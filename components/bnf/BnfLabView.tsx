'use client';

/**
 * BNF형 25일 이격도 역추세 연구(/bnf-lab) — 로컬에서 미리 계산한 백테스트 결과(data/bnf/*)를 읽기만 한다.
 * 실거래 주문·API 키·자동 진입 없음. 메뉴·사이트맵 미연결. 규격: docs/bnf/STRATEGY.md, 보고서: docs/bnf/REPORT.md
 */
import { useMemo, useState } from 'react';
import type { ExchangeView, ConfigView, PeriodKey, SummarySlim, FundingSlim } from '@/lib/bnf/view';

const PERIODS: readonly (readonly [PeriodKey, string])[] = [['oos', 'OOS 검증'], ['dev', '개발·탐색'], ['full', '전체']];
const TF_LABEL: Record<string, string> = { '15m': '15분', '1h': '1시간', '4h': '4시간', '1d': '일봉' };
const REASON: Record<string, string> = { target: '목표', stop: '손절', stop_gap: '갭 손절', time: '72h 만기', data_end: '데이터 끝' };

const sgn = (v: number | null | undefined, d = 2, unit = '%') => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}${unit}`);
const num = (v: number | null | undefined, d = 2) => (v == null ? '—' : v.toFixed(d));
const tone = (v: number | null | undefined) => (v == null || v === 0 ? 'var(--text-muted)' : v > 0 ? 'var(--up)' : 'var(--down)');
const day = (iso: string) => iso.slice(0, 10);
const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(2, 16).replace('T', ' ');

function verdictStyle(code: string): React.CSSProperties {
  if (code === 'candidate') return { color: 'var(--accent)' };
  if (code === 'insufficient') return { color: 'var(--text-muted)' };
  return { color: 'var(--warn)' };
}

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-[var(--line)] overflow-hidden">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={k === value} onClick={() => onChange(k)}
          className="flex-1 min-w-0 px-2 py-2 text-[13px] font-bold truncate"
          style={k === value ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>{l}</button>
      ))}
    </div>
  );
}

/** 자산 곡선(주간 표본) — OOS 시작 세로선, 초기자본 가로 점선 */
function Curve({ pts, oosT, initial }: { pts: [number, number][]; oosT: number; initial: number }) {
  if (pts.length < 2) return null;
  const W = 640, Hh = 180, P = 6;
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
  const ys = pts.map((p) => p[1]).concat(initial);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (t: number) => P + ((t - x0) / (x1 - x0 || 1)) * (W - 2 * P);
  const Y = (v: number) => P + (1 - (v - y0) / (y1 - y0 || 1)) * (Hh - 2 * P);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto" role="img" aria-label={`전체 기간 자산 곡선 — 시작 ${initial} USDT, 끝 ${pts[pts.length - 1][1]} USDT`}>
      <line x1={P} x2={W - P} y1={Y(initial)} y2={Y(initial)} stroke="var(--line)" strokeDasharray="4 4" />
      {oosT > x0 && oosT < x1 && <line x1={X(oosT)} x2={X(oosT)} y1={P} y2={Hh - P} stroke="var(--text-muted)" strokeDasharray="2 3" />}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.8} />
    </svg>
  );
}

const ROWS: { label: string; get: (s: SummarySlim) => React.ReactNode }[] = [
  { label: '거래 수', get: (s) => <>{s.trades}{!s.sufficient && <span className="text-[var(--text-muted)]"> · 판단 불가</span>}</> },
  { label: '승률', get: (s) => (s.winRate == null ? '—' : `${s.winRate.toFixed(1)}%`) },
  { label: 'PF', get: (s) => (s.trades === 0 ? '—' : s.pf == null ? '손실 없음' : s.pf.toFixed(2)) },
  { label: '평균 R', get: (s) => <span style={{ color: tone(s.avgR) }}>{sgn(s.avgR, 3, 'R')}</span> },
  { label: '평균 보유', get: (s) => (s.avgHoldH == null ? '—' : `${s.avgHoldH.toFixed(1)}시간`) },
  { label: '단일 최대 손실', get: (s) => (s.maxLossUsdt == null ? '—' : `${s.maxLossUsdt.toFixed(2)} USDT (${num(s.maxLossR, 2)}R)`) },
  { label: 'MTM 최대낙폭', get: (s) => `${num(s.mddPct)}%` },
  { label: '전체 수익률', get: (s) => <span style={{ color: tone(s.totalReturnPct) }}>{sgn(s.totalReturnPct)}</span> },
  { label: '최대 연속 손실', get: (s) => `${s.maxConsecLoss}회` },
  { label: '수수료 합계', get: (s) => `${num(s.feesTotal)} USDT` },
  { label: '슬리피지 비용', get: (s) => `${num(s.slipTotal)} USDT` },
  { label: '최대 역행(MAE)', get: (s) => (s.worstMaePct == null ? '—' : `${s.worstMaePct.toFixed(2)}%`) },
  { label: '청산 사유', get: (s) => Object.entries(s.exitReasons).filter(([, n]) => n > 0).map(([k, n]) => `${REASON[k]} ${n}`).join(' · ') || '—' },
  { label: '버린 신호', get: (s) => `손절>8% ${s.skipped.wideStop} · 보유 중 ${s.skipped.busy} · 대기 ${s.skipped.cooldown}` },
];

function Monthly({ rows }: { rows: [string, number | null][] }) {
  const years = [...new Set(rows.map(([m]) => m.slice(0, 4)))];
  const at = new Map(rows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11.5px] min-w-[560px] tabular-nums">
        <thead><tr className="text-[var(--text-muted)]"><th className="text-left font-bold py-1">연</th>{Array.from({ length: 12 }, (_, i) => <th key={i} className="text-right font-bold px-1">{i + 1}월</th>)}</tr></thead>
        <tbody>
          {years.map((y) => (
            <tr key={y} className="border-t border-[var(--line)]">
              <td className="py-1 pr-1 text-[var(--text-muted)]">{y}</td>
              {Array.from({ length: 12 }, (_, i) => {
                const k = `${y}-${String(i + 1).padStart(2, '0')}`;
                const v = at.get(k);
                return <td key={k} className="py-1 px-1 text-right" style={{ color: tone(v) }}>{at.has(k) ? sgn(v, 2, '') : ''}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BnfLabView({ data }: { data: ExchangeView[] }) {
  const [exId, setExId] = useState(data[0].id);
  const [period, setPeriod] = useState<PeriodKey>('oos');
  const ex = data.find((e) => e.id === exId) ?? data[0];
  const [key, setKey] = useState('1h-all-5x');
  const cfg = ex.configs.find((c) => c.key === key) ?? ex.configs[0];
  /** 5x·10x 손익이 같으면 10x 상세는 5x 의 월별·곡선·거래를 쓴다 */
  const twin: ConfigView = useMemo(() => (cfg.curve ? cfg : ex.configs.find((c) => c.tf === cfg.tf && c.regime === cfg.regime && c.leverage === 5) ?? cfg), [cfg, ex]);
  const initial = Number(ex.meta.params.initial ?? 1000);
  const oosT = new Date(ex.meta.oosFromUtc).getTime();
  const hasFunding = ex.configs.some((c) => c.periods.oos.f != null);

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-12 min-w-0">
      <div className="mb-4">
        <h2 className="text-xl font-extrabold text-[var(--text)]">BNF형 이격도 역추세 연구 · ETH 선물</h2>
        <p className="text-[13px] text-[var(--text-muted)] mt-1 leading-relaxed">
          25일 이동평균 이격도가 직전 1년 하위 10% 까지 벌어진 뒤 반등 돌파에 롱으로 들어가는 규칙을 <b className="text-[var(--text)]">공개 과거 데이터로 한 번만</b> 돌린 결과입니다.
          목표는 높은 수익률이 아니라 낮은 낙폭과 일관된 기대수익이며, 기준은 결과를 보기 전에 정했습니다.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="fin-chip warn">연구용 백테스트 — 실거래 주문 기능 없음</span>
          <span className="fin-chip flat">BNF 본인의 매매 알고리즘 아님</span>
          <span className="fin-chip flat">{ex.meta.costBasis}</span>
        </div>
      </div>

      <section aria-label="결론" className="fin-card p-4 mb-4">
        <div className="text-[12px] font-bold text-[var(--text-muted)] mb-1">결론 · {ex.name}</div>
        <p className="text-[15px] font-extrabold" style={verdictStyle(ex.conclusion.code === 'unfit' ? 'unfit' : ex.conclusion.code)}>{ex.conclusion.label}</p>
        <ul className="mt-2 text-[12.5px] text-[var(--text-muted)] leading-relaxed list-disc pl-4 space-y-0.5">
          <li>판정은 OOS 구간({day(ex.meta.oosFromUtc)} 이후 진입) 기준입니다. 순서대로 거래 30회 미만이면 판단 불가, 이후 PF &lt; 1·평균 R ≤ 0, 낙폭 &gt; 10%, PF &lt; 1.2, 개발 구간 평균 R ≤ 0{hasFunding ? ', 펀딩 반영 시 평균 R ≤ 0' : ''}에 걸리면 사용 부적합입니다.</li>
          <li>모든 기준을 통과해도 &lsquo;추가 검증 후보&rsquo;일 뿐 실거래 적합 판정이 아닙니다.</li>
          {ex.meta.leverageIdentical && <li>손절 거리가 최소 1.2% 라 위험예산 0.5% 로 정한 명목가(최대 자산의 약 42%)가 5x·10x 증거금 상한(125%·250%)에 닿지 않습니다. 그래서 <b className="text-[var(--text)]">5x·10x 손익은 같고 사용 증거금만 다릅니다</b>.</li>}
        </ul>
      </section>

      <section aria-label="구성별 결과" className="fin-card p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <Toggle label="거래소" value={exId} onChange={setExId} options={data.map((e) => [e.id, e.name] as const)} />
          <Toggle label="구간" value={period} onChange={setPeriod} options={PERIODS} />
        </div>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[12px] min-w-[640px] tabular-nums">
            <thead>
              <tr className="text-[var(--text-muted)] border-b border-[var(--line)]">
                <th className="text-left font-bold py-1.5">구성</th>
                <th className="text-right font-bold px-1">거래</th>
                <th className="text-right font-bold px-1">승률</th>
                <th className="text-right font-bold px-1">PF</th>
                <th className="text-right font-bold px-1">평균R</th>
                <th className="text-right font-bold px-1">MDD</th>
                <th className="text-right font-bold px-1">수익률</th>
                <th className="text-left font-bold pl-2">판정(OOS 기준)</th>
              </tr>
            </thead>
            <tbody>
              {ex.configs.map((c) => {
                const s = c.periods[period].s;
                const on = c.key === cfg.key;
                return (
                  <tr key={c.key} className="border-b border-[var(--line)] cursor-pointer" style={on ? { background: 'var(--surface-2)' } : undefined}
                    onClick={() => setKey(c.key)} aria-selected={on}>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      <button type="button" className="font-bold text-left text-[var(--text)]" onClick={() => setKey(c.key)}>
                        {TF_LABEL[c.tf]} · {c.regime === 'bear' ? '약세장' : '전체'} · {c.leverage}x
                      </button>
                    </td>
                    <td className="text-right px-1">{s.trades}{!s.sufficient && <span className="text-[var(--text-muted)]">*</span>}</td>
                    <td className="text-right px-1">{s.winRate == null ? '—' : `${s.winRate.toFixed(0)}%`}</td>
                    <td className="text-right px-1">{s.trades === 0 ? '—' : s.pf == null ? '∞' : s.pf.toFixed(2)}</td>
                    <td className="text-right px-1" style={{ color: tone(s.avgR) }}>{sgn(s.avgR, 3, '')}</td>
                    <td className="text-right px-1">{num(s.mddPct, 1)}%</td>
                    <td className="text-right px-1" style={{ color: tone(s.totalReturnPct) }}>{sgn(s.totalReturnPct, 1)}</td>
                    <td className="pl-2 whitespace-nowrap font-semibold" style={verdictStyle(c.verdict)}>{c.verdictLabel.replace(/ \(.*\)/, '')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-[var(--text-muted)] mt-2">* 거래 30회 미만 — 판단 불가. 수익률은 초기 {initial.toLocaleString()} USDT 기준이며, {ex.meta.costBasis}입니다. 행을 누르면 아래에 상세가 나옵니다.</p>
      </section>

      <section aria-label="선택 구성 상세" className="fin-card p-4 mb-4">
        <div className="flex flex-wrap items-baseline gap-x-2 mb-2">
          <h3 className="text-[15px] font-extrabold text-[var(--text)]">{TF_LABEL[cfg.tf]}봉 · {cfg.regimeLabel} · {cfg.leverage}x</h3>
          <span className="text-[12.5px] font-bold" style={verdictStyle(cfg.verdict)}>{cfg.verdictLabel}</span>
        </div>
        <p className="text-[12px] text-[var(--text-muted)] mb-3">후보 신호 {cfg.signals.toLocaleString()}건 (보유·대기 중 신호는 버림) · 진입 기간: 개발 {day(cfg.periods.dev.from)}~{day(cfg.periods.dev.to)} / OOS {day(cfg.periods.oos.from)}~{day(cfg.periods.oos.to)}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[480px] tabular-nums">
            <thead><tr className="text-[var(--text-muted)] border-b border-[var(--line)]"><th className="text-left font-bold py-1">지표</th>{PERIODS.map(([k, l]) => <th key={k} className="text-right font-bold px-1">{l}</th>)}</tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-b border-[var(--line)]">
                  <td className="py-1.5 pr-2 text-[var(--text-muted)] whitespace-nowrap">{r.label}</td>
                  {PERIODS.map(([k]) => <td key={k} className="py-1.5 px-1 text-right">{r.get(cfg.periods[k].s)}</td>)}
                </tr>
              ))}
              {hasFunding && (
                <>
                  <FundRow label="펀딩 손익(보조)" get={(f) => (f?.fundingTotal == null ? '—' : `${f.fundingTotal.toFixed(2)} USDT`)} cfg={cfg} />
                  <FundRow label="펀딩 반영 수익률" get={(f) => <span style={{ color: tone(f?.totalReturnPct) }}>{sgn(f?.totalReturnPct)}</span>} cfg={cfg} />
                  <FundRow label="펀딩 반영 평균 R" get={(f) => <span style={{ color: tone(f?.avgR) }}>{sgn(f?.avgR, 3, 'R')}</span>} cfg={cfg} />
                </>
              )}
            </tbody>
          </table>
        </div>
        {hasFunding && <p className="text-[11.5px] text-[var(--text-muted)] mt-1.5">펀딩 행은 Binance 공식 펀딩비를 반영한 보조 지표입니다(명목가는 mark price 가 아니라 해당 시각 15분봉 시가로 근사).</p>}
        {!hasFunding && <p className="text-[11.5px] text-[var(--text-muted)] mt-1.5">이 거래소는 과거 펀딩비 이력이 없어 펀딩비 미포함입니다.</p>}

        {twin.curve && (
          <div className="mt-4">
            <div className="text-[12.5px] font-bold text-[var(--text)] mb-1">자산 곡선 (전체 기간, 주간 표본)</div>
            <Curve pts={twin.curve} oosT={oosT} initial={initial} />
            <p className="text-[11.5px] text-[var(--text-muted)]">점선 가로 = 초기자본 {initial.toLocaleString()} USDT, 점선 세로 = OOS 시작({day(ex.meta.oosFromUtc)}). 끝 {twin.curve[twin.curve.length - 1][1].toLocaleString()} USDT.</p>
          </div>
        )}

        {twin.periods[period].monthly && (
          <div className="mt-4">
            <div className="text-[12.5px] font-bold text-[var(--text)] mb-1">월별 수익률 (%, UTC 월말 MTM · {PERIODS.find(([k]) => k === period)![1]})</div>
            <Monthly rows={twin.periods[period].monthly!} />
          </div>
        )}
      </section>

      {twin.oosTrades && (
        <section aria-label="OOS 거래 목록" className="fin-card p-4 mb-4">
          <div className="text-[13px] font-extrabold text-[var(--text)] mb-1">OOS 거래 {twin.oosTrades.length}건</div>
          <p className="text-[11.5px] text-[var(--text-muted)] mb-2">시각은 KST, 가격은 슬리피지 반영 체결가입니다. 순손익은 {ex.meta.costBasis} 기준입니다.</p>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-[11.5px] min-w-[620px] tabular-nums">
              <thead className="sticky top-0" style={{ background: 'var(--bg-card)' }}>
                <tr className="text-[var(--text-muted)] border-b border-[var(--line)]">
                  <th className="text-left font-bold py-1">진입</th><th className="text-left font-bold px-1">청산</th><th className="text-left font-bold px-1">사유</th>
                  <th className="text-right font-bold px-1">진입가</th><th className="text-right font-bold px-1">손절</th><th className="text-right font-bold px-1">청산가</th>
                  <th className="text-right font-bold px-1">순손익</th><th className="text-right font-bold px-1">R</th><th className="text-right font-bold pl-1">보유h</th>
                </tr>
              </thead>
              <tbody>
                {twin.oosTrades.map((t) => (
                  <tr key={t[0]} className="border-b border-[var(--line)]">
                    <td className="py-1 pr-1 whitespace-nowrap">{kst(t[0])}</td><td className="px-1 whitespace-nowrap">{kst(t[1])}</td><td className="px-1 whitespace-nowrap">{REASON[t[2]] ?? t[2]}</td>
                    <td className="px-1 text-right">{t[3].toFixed(2)}</td><td className="px-1 text-right">{t[4].toFixed(2)}</td><td className="px-1 text-right">{t[6].toFixed(2)}</td>
                    <td className="px-1 text-right" style={{ color: tone(t[7]) }}>{sgn(t[7], 2, '')}</td><td className="px-1 text-right" style={{ color: tone(t[8]) }}>{sgn(t[8], 2, '')}</td>
                    <td className="pl-1 text-right">{t[9].toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-label="데이터 출처와 한계" className="fin-card p-4 mb-4 text-[12.5px] leading-relaxed">
        <div className="text-[13px] font-extrabold text-[var(--text)] mb-1">데이터 · 한계</div>
        <ul className="list-disc pl-4 space-y-1 text-[var(--text-muted)]">
          <li><b className="text-[var(--text)]">{ex.contract}</b> 15분봉 {ex.meta.data.bars.toLocaleString()}개, {day(ex.meta.data.firstUtc)} 00:00 ~ {ex.meta.data.lastBarOpenUtc.slice(0, 16).replace('T', ' ')} UTC(마지막 봉 시작). 1시간·4시간·일봉은 UTC 경계로 리샘플링했습니다.</li>
          <li>출처: <span className="break-all">{ex.meta.data.source}</span></li>
          <li>정규화 데이터 SHA256 <span className="break-all font-mono text-[11px]">{ex.meta.data.sha256}</span></li>
          {ex.id === 'binance'
            ? <li>공식 아카이브에 <b className="text-[var(--text)]">2026-10-28 하루치(96봉)가 없습니다</b>(월별·일별 모두). 보간하지 않고 2026-10-27 23:45 UTC 봉에서 멈췄습니다.</li>
            : <li>Binance 실험과 같은 기간으로 비교하려고 2026-10-27 23:45 UTC 봉에서 잘랐습니다. 두 거래소의 데이터는 섞지 않았습니다.</li>}
          {ex.meta.data.gaps.length > 0 && <li>기록된 결측: {ex.meta.data.gaps.map((g) => `${g.afterUtc} 다음 ${g.nextUtc} (${g.missing}봉)`).join(', ')}</li>}
          <li>첫 신호 가능일 {day(ex.meta.firstSignalDayUtc)}. SMA25(25일)와 직전 365일 이격도 분위수를 쓰려면 약 390일의 선행 데이터가 필요합니다.</li>
          <li>미포함: {ex.meta.notIncluded.join(', ')}. 예상 청산가나 파산 확률은 만들지 않았습니다(진입 대비 최대 역행 MAE 만 사실값으로 표시).</li>
          <li>가정: 편도 수수료 {(Number(ex.meta.params.feeRate) * 100).toFixed(2)}%, 슬리피지 {(Number(ex.meta.params.slip) * 100).toFixed(2)}%(진입·청산 모두), 1회 위험 {(Number(ex.meta.params.riskPct) * 100).toFixed(1)}%, 증거금 상한 {(Number(ex.meta.params.marginCapPct) * 100).toFixed(0)}%, 손절 4시간봉 ATR14×1.5(1.2%~8%), 목표 1.8R, 최대 보유 72시간, 청산 뒤 24시간 대기, 롱 1포지션.</li>
          <li>같은 15분봉에서 목표·손절이 함께 닿으면 손절로 봅니다. 갭 하락은 실제 시가로 체결하고, 갭 상승은 목표가로만 체결합니다(보수적).</li>
          <li>생성 {ex.meta.generatedAt.slice(0, 16).replace('T', ' ')} UTC · 엔진 해시 <span className="font-mono text-[11px]">{ex.meta.engineSha256.slice(0, 12)}</span></li>
        </ul>
      </section>
    </div>
  );
}

function FundRow({ label, get, cfg }: { label: string; get: (f: FundingSlim | null) => React.ReactNode; cfg: ConfigView }) {
  return (
    <tr className="border-b border-[var(--line)]">
      <td className="py-1.5 pr-2 text-[var(--text-muted)] whitespace-nowrap">{label}</td>
      {PERIODS.map(([k]) => <td key={k} className="py-1.5 px-1 text-right">{get(cfg.periods[k].f)}</td>)}
    </tr>
  );
}
