'use client';

/**
 * 경제지표 발표 전후 분석 연구실(/event-lab) — 실제로 받은 시계열만으로 발표 전후 가격·거래량·OI·펀딩을 본다.
 * 계산은 lib/eventStudy(테스트 고정), 데이터는 /api/event-lab, 일정은 /api/risk/events.
 * ⚠ 과거 분석 화면이다(발표 이후 데이터 포함). 실시간 진입 판단은 /risk-control 의 관망 규칙이 맡는다.
 */
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';
import { MACRO_DEFS, MACRO_KINDS, coReleases, fmtKst, fmtEt, fmtUtc, type MacroEvent, type MacroKind } from '@/lib/macroSchedule';
import { CHECKPOINTS, compareSummary, type StudyResult, type OiChange, type FundingPoint } from '@/lib/eventStudy';

type Sym = 'BTCUSDT' | 'ETHUSDT';
interface EventsResp { events: MacroEvent[]; missing: string[]; note: string }
interface LabResp {
  symbol: string; ts: number; source: string; study: StudyResult;
  m1: [number, number][]; m5: [number, number][];
  oi: OiChange | null; oiNote: string | null;
  funding: { before: FundingPoint | null; after: FundingPoint[] } | null;
  compare: { ts: number; study: StudyResult }[];
  errors: string[];
}

const pct = (v: number | null | undefined, d = 2) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`);
const tone = (v: number | null | undefined) => (v == null ? 'var(--text-muted)' : v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--text)');
const px = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: v >= 1000 ? 1 : 3 }));
const M = 60_000;

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

/** 실제 받은 종가만 잇는 선 차트 — 발표 시각 세로선, 발표 직전 가격 가로 점선 */
function LineChart({ pts, eventTs, pre, label }: { pts: [number, number][]; eventTs: number; pre: number | null; label: string }) {
  if (pts.length < 2) return <p className="text-[12px] text-[var(--text-muted)] py-6 text-center">차트를 그릴 봉이 부족합니다.</p>;
  const W = 640, Hh = 200, P = 6;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]).concat(pre != null ? [pre] : []);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (t: number) => P + ((t - x0) / (x1 - x0 || 1)) * (W - 2 * P);
  const Y = (v: number) => P + (1 - (v - y0) / (y1 - y0 || 1)) * (Hh - 2 * P);
  // 봉이 빠진 구간(간격 2배 초과)은 선을 끊는다 — 없는 데이터를 이어 그리지 않음
  const step = Math.min(...pts.slice(1).map((p, i) => p[0] - pts[i][0]));
  let d = '';
  pts.forEach((p, i) => { d += `${i === 0 || p[0] - pts[i - 1][0] > step * 2 ? 'M' : 'L'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`; });
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto" role="img" aria-label={label}>
      {pre != null && <line x1={P} x2={W - P} y1={Y(pre)} y2={Y(pre)} stroke="var(--faint)" strokeDasharray="4 4" strokeWidth={1} />}
      {eventTs >= x0 && eventTs <= x1 && <line x1={X(eventTs)} x2={X(eventTs)} y1={P} y2={Hh - P} stroke="var(--warn)" strokeWidth={1.2} />}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function EventLabView() {
  const [kind, setKind] = useState<MacroKind>('cpi');
  const [sym, setSym] = useState<Sym>('BTCUSDT');
  const [sel, setSel] = useState<string | null>(null);
  const [span, setSpan] = useState<'4h' | '24h'>('4h');
  const [now, setNow] = useState(0);
  useEffect(() => { const t = setTimeout(() => setNow(Date.now()), 0); return () => clearTimeout(t); }, []);

  const ev = useSWR<EventsResp>('/api/risk/events', jsonFetcher, { revalidateOnFocus: false });
  const past = useMemo(() => (ev.data?.events ?? []).filter((e) => e.kind === kind && now > 0 && e.ts <= now).sort((a, b) => b.ts - a.ts), [ev.data, kind, now]);
  const cur = past.find((e) => e.id === sel) ?? past[0] ?? null;
  const cmp = cur ? past.filter((e) => e.ts < cur.ts).slice(0, 6) : [];
  const co = cur && ev.data ? coReleases(ev.data.events, cur) : [];

  const url = cur ? `/api/event-lab?symbol=${sym}&ts=${cur.ts}&cmp=${cmp.map((e) => e.ts).join(',')}` : null;
  const lab = useSWR<LabResp>(url, jsonFetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const d = lab.data;
  const pre = d?.study.checkpoints.find((c) => c.key === 'pre')?.price ?? null;
  const summary = d ? compareSummary(d.compare.map((c) => c.study)) : [];

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-12 min-w-0">
      <div className="mb-4">
        <h2 className="text-xl font-extrabold text-[var(--text)]">발표 전후 연구실</h2>
        <p className="text-[13px] text-[var(--text-muted)] mt-1 leading-relaxed">
          미국 주요 경제지표 발표 전후에 BTC·ETH 가격·거래량·미결제약정·펀딩이 실제로 어떻게 움직였는지 <b className="text-[var(--text)]">받은 데이터만으로</b> 봅니다.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="fin-chip warn">과거 분석 — 실시간 판단 아님</span>
          <span className="fin-chip flat">발표 후 데이터 포함</span>
          <span className="fin-chip flat">예측 아님</span>
        </div>
      </div>

      <section aria-label="분석 대상 선택" className="fin-card p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <label className="block min-w-0">
            <span className="block text-[11px] font-bold text-[var(--faint)] mb-1">경제지표</span>
            <select className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2 text-[14px] text-[var(--text)]" value={kind}
              onChange={(e) => { setKind(e.target.value as MacroKind); setSel(null); }}>
              {MACRO_KINDS.map((k) => <option key={k} value={k}>{MACRO_DEFS[k].title}{MACRO_DEFS[k].includes.length > 1 ? ` (${MACRO_DEFS[k].includes.join('·')})` : ''}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="block text-[11px] font-bold text-[var(--faint)] mb-1">발표 날짜(KST)</span>
            <select className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2 text-[14px] text-[var(--text)] tabular-nums" value={cur?.id ?? ''}
              onChange={(e) => setSel(e.target.value)} disabled={!past.length}>
              {past.length === 0 && <option value="">{ev.isLoading ? '불러오는 중…' : '지난 발표 없음'}</option>}
              {past.map((e) => <option key={e.id} value={e.id}>{fmtKst(e.ts, true)}</option>)}
            </select>
          </label>
          <div className="min-w-0">
            <span className="block text-[11px] font-bold text-[var(--faint)] mb-1">종목</span>
            <Toggle label="종목" value={sym} options={[['BTCUSDT', 'BTC'], ['ETHUSDT', 'ETH']] as const} onChange={setSym} />
          </div>
        </div>
        {cur && (
          <div className="mt-3 text-[12px] text-[var(--text-muted)] leading-relaxed">
            <b className="text-[var(--text)]">{cur.title}</b> ({cur.includes.join(' · ')}) — <span className="tabular-nums">{fmtKst(cur.ts, true)} KST · {fmtEt(cur.ts)} · {fmtUtc(cur.ts)}</span>
            <span className="block text-[11px] text-[var(--faint)]">출처: {cur.source} · 시각은 기관 표준 발표 시각</span>
            {co.length > 0 && (
              <p className="mt-1.5 text-[12px]" style={{ color: 'var(--amber)' }}>
                ⚠ 같은 시각 동시 발표: {co.map((c) => c.title).join(', ')} — 아래 움직임을 {cur.title} 하나의 영향으로 단정할 수 없습니다.
              </p>
            )}
          </div>
        )}
        {ev.error && <p className="mt-2 text-[12px] text-[var(--warn)]">경제지표 일정을 불러오지 못했습니다.</p>}
        {ev.data?.missing.length ? <p className="mt-2 text-[11px] text-[var(--faint)]">일정 누락(불러오기 실패): {ev.data.missing.join(', ')}</p> : null}
      </section>

      {lab.error && <div className="fin-card p-4 mb-4 text-[12.5px] text-[var(--warn)]">분석 데이터를 불러오지 못했습니다: {String((lab.error as Error).message ?? lab.error)}</div>}
      {cur && !d && !lab.error && <div className="fin-card p-4 mb-4 text-[12.5px] text-[var(--text-muted)]">발표 전후 1분봉·5분봉을 불러오는 중…</div>}

      {d && (
        <>
          <section aria-label="발표 전후 가격 차트" className="fin-card p-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-[14px] font-bold text-[var(--text)]">{sym.replace('USDT', '')} 가격 — 발표(빨간 선) 전후</h3>
              <div className="w-44"><Toggle label="구간" value={span} options={[['4h', '−1h~+4h'], ['24h', '~+24h']] as const} onChange={setSpan} /></div>
            </div>
            <LineChart pts={span === '4h' ? d.m1 : d.m5} eventTs={d.ts} pre={pre} label={`${sym} 발표 전후 가격`} />
            <p className="text-[10.5px] text-[var(--faint)] mt-1">점선 = 발표 직전 가격. {span === '4h' ? '1분봉' : '5분봉'} 종가 · 받은 봉 {span === '4h' ? `${d.study.coverage.m1}/${d.study.coverage.m1Expected}` : `${d.study.coverage.m5}/${d.study.coverage.m5Expected}`}개{d.errors.length ? ` · 실패: ${d.errors.join(', ')}` : ''} · {d.source}</p>
          </section>

          <section aria-label="시점별 가격 변화" className="fin-card p-4 mb-4">
            <h3 className="text-[14px] font-bold text-[var(--text)] mb-2">시점별 가격 — 발표 직전 대비</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <tbody>
                  {d.study.checkpoints.map((c) => (
                    <tr key={c.key} className="border-t border-[var(--line)] first:border-t-0">
                      <td className="py-1.5 text-[var(--text-muted)] whitespace-nowrap">{c.label}</td>
                      <td className="py-1.5 text-right tabular-nums text-[var(--text)]">{px(c.price)}</td>
                      <td className="py-1.5 pl-3 text-right tabular-nums font-semibold" style={{ color: c.key === 'pre' ? 'var(--text-muted)' : tone(c.pctFromPre) }}>{c.key === 'pre' ? '기준' : pct(c.pctFromPre)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10.5px] text-[var(--faint)] mt-1.5">발표 직전 = 발표 시각에 끝나는 1분봉 종가. 그 시각 봉이 없으면 빈칸(보간 안 함).</p>
          </section>

          <section aria-label="변동·거래량·미결제약정·펀딩" className="fin-card p-4 mb-4">
            <h3 className="text-[14px] font-bold text-[var(--text)] mb-2">변동 폭 · 거래량 · OI · 펀딩</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
              {([
                ['최대 상승(4시간)', d.study.ex4h ? `${pct(d.study.ex4h.maxUpPct)} · ${d.study.ex4h.maxUpAtMin}분 후` : '—'],
                ['최대 하락(4시간)', d.study.ex4h ? `${pct(d.study.ex4h.maxDownPct)} · ${d.study.ex4h.maxDownAtMin}분 후` : '—'],
                ['최대 상승(24시간)', d.study.ex24h ? `${pct(d.study.ex24h.maxUpPct)} · ${Math.round(d.study.ex24h.maxUpAtMin / 60 * 10) / 10}시간 후` : '—'],
                ['최대 하락(24시간)', d.study.ex24h ? `${pct(d.study.ex24h.maxDownPct)} · ${Math.round(d.study.ex24h.maxDownAtMin / 60 * 10) / 10}시간 후` : '—'],
                ['거래량 15분(발표 전 대비)', d.study.volume.ratio15 == null ? '—' : `${d.study.volume.ratio15.toFixed(1)}배`],
                ['거래량 1시간(발표 전 대비)', d.study.volume.ratio60 == null ? '—' : `${d.study.volume.ratio60.toFixed(1)}배`],
                ['변동성 안정화까지', d.study.stab == null ? '기준 구간 부족' : d.study.stab.minutes == null ? `${d.study.stab.searchedMin}분 안에 안 됨` : `${d.study.stab.minutes}분`],
                ['OI 1시간 / 4시간 / 24시간', d.oi ? `${pct(d.oi.pct60)} / ${pct(d.oi.pct240)} / ${pct(d.oi.pct1440)}` : (d.oiNote ?? '—')],
                ['직전 정산 펀딩', d.funding?.before ? `${(d.funding.before.rate * 100).toFixed(4)}% (${fmtKst(d.funding.before.ts)})` : '—'],
                ['이후 정산 펀딩', d.funding?.after.length ? d.funding.after.map((f) => `${(f.rate * 100).toFixed(4)}%`).join(' → ') : '—'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-[var(--text-muted)] min-w-0">{k}</dt>
                  <dd className="text-right font-semibold tabular-nums text-[var(--text)] min-w-0 break-keep">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[10.5px] text-[var(--faint)] mt-2 leading-relaxed">
              안정화 = 발표 5~60분 전 1분봉 변동폭 중앙값의 1.5배 이하로 15분 창 중앙값이 내려온 첫 시점(정의가 임의인 참고 측정). OI 는 바이낸스 5분 기록(최근 30일만 제공).
              예상치·실제치·이전치는 무료 공개 소스를 확보하지 못해 표시하지 않습니다(추정 안 함).
            </p>
          </section>

          <section aria-label="과거 같은 지표 발표 비교" className="fin-card p-4 mb-4">
            <h3 className="text-[14px] font-bold text-[var(--text)]">과거 같은 지표 발표 비교</h3>
            <p className="text-[11.5px] text-[var(--text-muted)] mt-1">선택한 발표보다 <b>이전</b> 발표 {d.compare.length}건 — 발표 직전 대비 %.</p>
            {d.compare.length === 0 ? <p className="text-[12px] text-[var(--text-muted)] mt-2">이전 발표가 없습니다.</p> : (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-[12px] min-w-[520px]">
                  <thead>
                    <tr className="text-[10.5px] text-[var(--faint)]">
                      <th className="text-left font-bold py-1">발표(KST)</th>
                      {CHECKPOINTS.filter((c) => c.min > 0).map((c) => <th key={c.key} className="text-right font-bold px-1">{c.label}</th>)}
                      <th className="text-right font-bold pl-1">4h 최대↑/↓</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[{ ts: d.ts, study: d.study, me: true }, ...d.compare.map((c) => ({ ...c, me: false }))].map((r) => (
                      <tr key={r.ts} className="border-t border-[var(--line)]" style={r.me ? { background: 'var(--surface-2)' } : undefined}>
                        <td className="py-1.5 pr-2 whitespace-nowrap tabular-nums text-[var(--text)]">{fmtKst(r.ts, true).slice(2)}{r.me ? ' ◀' : ''}</td>
                        {CHECKPOINTS.filter((c) => c.min > 0).map((c) => {
                          const v = r.study.checkpoints.find((x) => x.key === c.key)?.pctFromPre;
                          return <td key={c.key} className="py-1.5 px-1 text-right tabular-nums" style={{ color: tone(v) }}>{pct(v)}</td>;
                        })}
                        <td className="py-1.5 pl-1 text-right tabular-nums text-[var(--text-muted)] whitespace-nowrap">{r.study.ex4h ? `${pct(r.study.ex4h.maxUpPct, 1)}/${pct(r.study.ex4h.maxDownPct, 1)}` : '—'}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[var(--line)] text-[var(--text-muted)]">
                      <td className="py-1.5 pr-2 font-bold">과거 중앙값(n)</td>
                      {summary.map((s) => <td key={s.key} className="py-1.5 px-1 text-right tabular-nums">{s.median == null ? '—' : `${pct(s.median)} (${s.n})`}</td>)}
                      <td />
                    </tr>
                    <tr className="text-[var(--text-muted)]">
                      <td className="py-1 pr-2 font-bold">평균 절대 변화</td>
                      {summary.map((s) => <td key={s.key} className="py-1 px-1 text-right tabular-nums">{s.absMean == null ? '—' : `${s.absMean.toFixed(2)}%`}</td>)}
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10.5px] text-[var(--faint)] mt-2 leading-relaxed">표본이 몇 건뿐이라 방향을 예측하는 근거가 아닙니다. 평균 절대 변화는 &lsquo;발표 때 얼마나 크게 움직이는가(위험 크기)&rsquo;를 보는 용도입니다. 동시 발표가 있던 날은 다른 지표 영향이 섞여 있습니다.</p>
          </section>
        </>
      )}

      <p className="text-[10.5px] text-[var(--faint)] leading-relaxed px-0.5">
        일정: {ev.data?.note ?? 'FRED·연준 공식 일정'} · 시세: 바이낸스 USDT 무기한 공개 API. 발표 전 매매 판단에는 발표 전에 알 수 있던 정보만 써야 합니다 — 이 화면의 발표 후 수치는 복기·위험 크기 파악용입니다.
      </p>
      {now > 0 && cur && now - cur.ts < 24 * 60 * M && <p className="text-[10.5px] text-[var(--amber)] mt-1 px-0.5">발표 후 24시간이 지나지 않아 일부 시점은 아직 비어 있습니다.</p>}
    </div>
  );
}
