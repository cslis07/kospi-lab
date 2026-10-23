'use client';

/**
 * "규칙대로였다면" — 같은 방향·같은 진입에 실행 규칙(손절 1.2×ATR · 복수 매매 빼기 · 진입 지정가)만 바꾼 가정 손익.
 * 계산은 lib/counterfactual(헤더 주석·테스트 고정). 복수 매매·지정가는 거래소 기록만으로 바로 계산하고,
 * 손절 규칙은 매매마다 캔들이 필요해 **버튼으로 시작**한다(lib/excursionFetch 의 캔들 조회·속도 제한 재사용, 200봉 한도).
 * 손절 판정 결과는 이 기기(localStorage 'kospi-lab-counterfactual', 버전 키)에만 저장 — 다음 방문엔 새 매매만 조회.
 */
import { useMemo, useState } from 'react';
import { fetchTradeCandles, type ExcursionTrade } from '@/lib/excursionFetch';
import { stopCheck, counterfactual, cfHeadline, stopSweep, CF_LABELS, CF_STOP_ATR, CF_MAKER_RATE, type CfTrade, type StopCheck, type CfKey } from '@/lib/counterfactual';

type Trade = ExcursionTrade & { grossPnl: number; fee: number; openFee?: number };

const KEY = 'kospi-lab-counterfactual';
const VERSION = 3; // 판정식(배수·ATR 기간·봉 범위)이 바뀌면 올린다
const MAX = 100;

type Stored = Record<string, StopCheck>;
function readStore(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.v === VERSION && s.d ? s.d : {};
  } catch { return {}; }
}
function writeStore(add: Stored) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, d: { ...readStore(), ...add } })); } catch { /* 용량·사생활 모드 — 다음에 다시 계산 */ }
}

const signed = (n: number, fmt: (n: number) => string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
const pnlColor = (n: number) => (n > 0 ? 'var(--warn)' : n < 0 ? 'var(--accent-ink)' : 'var(--text)');

/** 진입 직전 1시간봉 30개(ATR 14용) — 공개 /api/candles. 실패면 null */
async function fetchH1Before(symbol: string, openTs: number) {
  try {
    const j = await (await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&granularity=1H&endTime=${openTs}&limit=30`)).json();
    return Array.isArray(j?.candles) && j.candles.length ? j.candles : null;
  } catch { return null; }
}

export default function CounterfactualCard({ trades, fmt, sub, equity }: { trades: Trade[]; fmt: (n: number) => string; sub?: string; equity?: number | null }) {
  const list = useMemo(() => [...trades].filter((t) => t.openTs > 0 && t.openAvg > 0).sort((a, b) => b.closeTs - a.closeTs).slice(0, MAX), [trades]);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(0);
  const [fresh, setFresh] = useState<Stored>({}); // 이번 방문에 새로 계산한 것(저장 실패해도 화면엔 반영)
  // 이 기기 저장본 + 새로 계산한 것. 매매 목록은 클라이언트에서 불러온 뒤에만 생기므로(서버 렌더 땐 빈 목록) 렌더 중 읽어도 된다
  const stops = useMemo(() => {
    const s = { ...readStore(), ...fresh };
    const m: Stored = {};
    for (const t of list) if (s[t.positionId]) m[t.positionId] = s[t.positionId];
    return m;
  }, [list, fresh]);

  const missing = list.filter((t) => !stops[t.positionId]);
  const run = async () => {
    const todo = missing;
    setBusy({ done: 0, total: todo.length });
    const got: Stored = {};
    let done = 0, fail = 0, next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const t = todo[next++];
        const [{ candles, barMs, error }, h1] = await Promise.all([fetchTradeCandles(t), fetchH1Before(t.symbol, t.openTs)]);
        if (error || !candles.length || !h1) fail++;
        else got[t.positionId] = stopCheck(t, candles, barMs, undefined, undefined, { candles: h1, barMs: 3_600_000 });
        setBusy({ done: ++done, total: todo.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, todo.length) }, worker));
    // 'unknown'(ATR 부족 등)도 저장 — 같은 캔들이면 결과가 같다
    writeStore(got);
    setFresh((p) => ({ ...p, ...got }));
    setFailed(fail);
    setBusy(null);
  };

  const cfTrades: CfTrade[] = useMemo(() => list.map((t) => ({
    id: t.positionId, symbol: t.symbol, side: t.side, openAvg: t.openAvg, closeAvg: t.closeAvg, size: t.size,
    netProfit: t.netProfit, grossPnl: t.grossPnl, fee: t.fee, openFee: t.openFee, openTs: t.openTs, closeTs: t.closeTs,
  })), [list]);
  const s = useMemo(() => counterfactual(cfTrades, stops), [cfTrades, stops]);
  const sweep = useMemo(() => stopSweep(cfTrades, stops, equity ?? null), [cfTrades, stops, equity]);
  if (!list.length) return null;

  const checked = list.filter((t) => stops[t.positionId]).length;
  const stopPartial = checked < list.length;
  const rows: CfKey[] = ['stop', 'revenge', 'maker', 'all'];

  return (
    <section className="fin-card p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h2 className="text-sm font-bold text-[var(--text)]">규칙대로였다면 <span className="text-[10px] font-normal text-[var(--text-muted)]">가정 손익</span></h2>
        <span className="text-[10px] text-[var(--text-muted)]">{sub ?? `청산 ${list.length}건`}</span>
      </div>
      <p className="text-[11px] font-semibold mb-2 leading-snug" style={{ color: 'var(--amber)' }}>
        가정 계산 — 방향은 그대로, 실행 규칙만 바꿈; 손절이 실제보다 빨리 끊어 이후 반등을 놓친 경우도 반영됨
      </p>

      <div className="overflow-x-auto rounded-xl border border-[var(--line-2)]">
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-semibold px-2 py-1.5">규칙</th>
              <th className="font-semibold px-2">순손익</th>
              <th className="font-semibold px-2">실제 대비</th>
              <th className="font-semibold px-2">영향</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[var(--line-2)] text-right bg-[var(--surface-2)]">
              <td className="text-left px-2 py-1.5 font-bold text-[var(--text)]">실제</td>
              <td className="px-2 font-bold" style={{ color: pnlColor(s.actual) }}>{signed(s.actual, fmt)}</td>
              <td className="px-2 text-[var(--faint)]">—</td>
              <td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{s.n}건</td>
            </tr>
            {rows.map((k) => {
              const r = s.rules[k];
              const partial = (k === 'stop' || k === 'all') && stopPartial;
              return (
                <tr key={k} className="border-t border-[var(--line-2)] text-right">
                  <td className="text-left px-2 py-1.5 text-[var(--text)]">
                    {CF_LABELS[k]}
                    {partial && <span className="block text-[9.5px] text-[var(--faint)]">손절 판정 {checked}/{list.length}건만 반영</span>}
                  </td>
                  <td className="px-2 font-bold" style={{ color: pnlColor(r.net) }}>{signed(r.net, fmt)}</td>
                  <td className="px-1.5 font-bold" style={{ color: pnlColor(r.delta) }}>{signed(r.delta, fmt)}</td>
                  <td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{k === 'revenge' ? `${r.affected}건 뺌` : `${r.affected}건`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-[var(--text)] mt-2 leading-relaxed">{cfHeadline(s, fmt)}</p>
      {s.stopHits > 0 && (
        <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
          손절 판정 {s.stopKnown}건 중 {s.stopHits}건이 손절가에 닿음 — 그중 <b style={{ color: 'var(--warn)' }}>{s.stopHelped}건은 손실을 줄였고</b>({signed(s.stopHelpedUsdt, fmt)}),{' '}
          <b style={{ color: 'var(--accent-ink)' }}>{s.stopHurt}건은 일찍 끊겨 이후 회복을 놓쳤습니다</b>({signed(s.stopHurtUsdt, fmt)}).
        </p>
      )}

      {sweep.n > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold text-[var(--text)] mb-1">손절 배수 비교 <span className="text-[10px] font-normal text-[var(--text-muted)]">1H ATR · {sweep.n}건 · 시간순 앞/뒤 절반</span></p>
          <div className="overflow-x-auto rounded-xl border border-[var(--line-2)]">
            <table className="w-full text-[11px] tabular-nums" style={{ minWidth: 320 }}>
              <thead>
                <tr className="text-[10px] text-[var(--text-muted)] text-right">
                  <th className="text-left font-semibold px-2.5 py-1.5">배수</th>
                  <th className="font-semibold px-2">같은 수량 + 손절<br />실제 대비</th>
                  <th className="font-semibold px-2.5">손절 + 자본 1% 수량<br />앞 · 뒤 (비용 제외)</th>
                </tr>
              </thead>
              <tbody>
                {sweep.rows.map((r) => (
                  <tr key={r.mult} className="border-t border-[var(--line-2)] text-right" style={sweep.pick === r.mult ? { background: 'var(--warn-soft)' } : undefined}>
                    <td className="text-left px-2.5 py-1.5 text-[var(--text)] font-semibold">×{r.mult}{sweep.pick === r.mult ? ' ★' : ''}<span className="block text-[9.5px] font-normal text-[var(--text-muted)]">닿음 {r.sameSize.hits}건</span></td>
                    <td className="px-2" style={{ color: pnlColor(r.sameSize.delta) }}>{signed(r.sameSize.delta, fmt)}</td>
                    <td className="px-2.5"><span style={{ color: pnlColor(r.fixedRisk.first) }}>{signed(r.fixedRisk.first, fmt)}</span> · <span style={{ color: pnlColor(r.fixedRisk.second) }}>{signed(r.fixedRisk.second, fmt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10.5px] text-[var(--text-muted)] mt-1 leading-relaxed">
            {sweep.pick != null
              ? <>★ ×{sweep.pick}: 자본 1% 수량 방식에서 앞·뒤 절반 모두 플러스이고 둘 중 작은 쪽이 가장 큰 배수(사전에 정한 규칙). 포지션 가드 제안({CF_STOP_ATR}배){sweep.pick === CF_STOP_ATR ? '와 같습니다.' : `와 다릅니다 — 표본이 쌓여도 같으면 가드 배수를 바꿀 근거가 됩니다.`}</>
              : equity ? '앞·뒤 절반 모두 플러스인 배수가 없어 고르지 않았습니다(우연과 구분 불가).' : '자본을 불러오지 못해 1% 수량 비교는 생략했습니다.'}
            {' '}같은 수량 그대로 손절만 넓히면 한 번 닿을 때 손실이 커집니다 — 손절 폭과 수량은 같이 정해야 합니다.
          </p>
        </div>
      )}

      {failed > 0 && !busy && (
        <p className="text-[11px] text-[var(--warn)] mt-1.5">{failed}건은 캔들을 받지 못했습니다(거래소 응답 제한 등) — 다시 누르면 남은 건만 조회합니다.</p>
      )}
      {missing.length > 0 && (
        <button type="button" onClick={run} disabled={!!busy}
          className="w-full mt-2 px-3 py-2.5 rounded-xl border border-[var(--border)] text-[13px] font-semibold text-[var(--accent-ink)] disabled:opacity-60">
          {busy ? `손절 규칙 계산 중… ${busy.done}/${busy.total}` : `손절 ${CF_STOP_ATR}×1H ATR 규칙 ${checked ? '나머지 ' : ''}${missing.length}건 계산하기 (캔들 ${missing.length}회 조회)`}
        </button>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer select-none text-[11px] font-semibold text-[var(--text-muted)]">가정과 계산 방식</summary>
        <ul className="text-[10.5px] text-[var(--text-muted)] mt-1 leading-relaxed list-disc pl-4 space-y-0.5">
          <li>손절 {CF_STOP_ATR}×ATR — ATR(14)은 1시간봉(진입 전에 마감된 봉)으로 계산 — 포지션 가드의 손절 제안과 같은 기준. 손절에 닿았는지는 보유 구간을 잘게 나눈 봉(짧은 매매는 1분봉)으로 봅니다. 보유 중 봉이 손절가를 건드렸으면 그 가격에 청산, 아니면 실제 결과. 같은 봉 안 순서는 몰라 봉 범위에 손절가가 있으면 맞았다고 봅니다(보수적). 수수료·펀딩은 실제 값 그대로.</li>
          <li>복수 매매 빼기 — 손실 청산 후 30분 안에 진입한 매매(종목 무관, 규율 점수와 같은 정의)를 없던 것으로. 판정은 실제 기록 기준.</li>
          <li>진입 지정가 — 진입 수수료만 메이커 {(CF_MAKER_RATE * 100).toFixed(2)}% × 진입 금액으로 바꿈(실제가 더 싸면 그대로). 청산은 시장가(손절은 즉시 체결이 필요) 유지. 지정가가 같은 가격에 체결됐다고 가정 — 실제로는 미체결로 놓치는 매매가 생길 수 있습니다.</li>
          <li>전부 적용 — 복수 매매를 뺀 나머지에 손절·지정가를 함께. 방향 예측이 아니라 이미 지난 가격 경로에 규칙을 대입한 사후 계산입니다. 최근 {MAX}건까지.</li>
        </ul>
      </details>
    </section>
  );
}
