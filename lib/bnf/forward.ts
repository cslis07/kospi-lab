/**
 * BNF 모의 검증 봇(선행 테스트) — 순수 계산. 사전등록: docs/bnf/FORWARD.md
 * 실행할 때마다 시작 시각 이후 확정 봉으로 처음부터 다시 계산한다(실행 지연과 무관한 결정적 결과).
 * 백테스트와 같은 엔진(findSignals·simulate)을 쓰고, 끝에 남은 거래는 '보유 중'으로 따로 둔다.
 * ⚠ 실거래 주문 없음. 기록되는 진입가·손절·목표는 모의 기록이며 매매 권유가 아니다.
 */
import { validateBars, resample, MIN15, HOUR, H4, DAY, isoUtc, type Bar } from './data';
import { dailyContext, wilderAtr, dayIndex } from './indicators';
import { findSignals, simulate, deviationAt, DEFAULT_PARAMS, type Params, type Trade, type RunResult } from './engine';
import { summarize, monthlyReturns, verdict, VERDICT_LABEL, MIN_TRADES, type Summary } from './metrics';

export const FORWARD_START = Date.UTC(2026, 10, 5);       // 2026-11-05 00:00 UTC
export const FORWARD_LEVERAGE = 5;

export interface Candidate { id: 'A' | 'B'; name: string; desc: string; params: Params }
export const CANDIDATES: Candidate[] = [
  { id: 'A', name: 'A · 1시간 BNF형 (목표 1.8R)', desc: '1차 규격 그대로', params: DEFAULT_PARAMS },
  { id: 'B', name: 'B · 1시간 BNF형 (목표 1.0R)', desc: '진단(E3)에서 나온 변형 — 선행 테스트로만 판정', params: { ...DEFAULT_PARAMS, targetR: 1.0 } },
];

export interface ForwardTrade {
  signalT: string; entryT: string; exitT: string; reason: string;
  entry: number; stop: number; target: number; exit: number; qty: number;
  net: number; r: number; holdH: number; maePct: number; firstSeenAt: string;
}
export interface OpenPosition { signalT: string; entryT: string; entry: number; stop: number; target: number; qty: number; lastClose: number; unrealizedR: number; expiresT: string }
export interface PendingEntry { signalT: string; entryAtBarT: string; dev: number; q10: number }
export interface CandidateResult {
  id: string; name: string; desc: string; targetR: number;
  closed: ForwardTrade[]; open: OpenPosition | null; pending: PendingEntry | null;
  summary: Summary; progress: string; verdict: string | null; verdictLabel: string | null;
  monthly: [string, number][]; equity: number;
}
export interface ForwardResult {
  version: 1; status: 'ok' | 'data_gap' | 'waiting'; statusNote: string | null;
  registeredAt: string; startUtc: string; updatedAt: string; dataThroughUtc: string | null;
  symbol: string; exchange: string;
  now: { barUtc: string; close: number; sma25: number | null; deviation: number | null; q10: number | null; oversoldRecent: boolean } | null;
  candidates: CandidateResult[];
  revisions: { candidate: string; entryT: string; before: string; after: string; detectedAt: string }[];
}

const r = (x: number, d = 4) => +x.toFixed(d);
const tradeKey = (t: { entryT: string; exitT: string; reason: string; net: number }) => `${t.entryT}|${t.exitT}|${t.reason}|${t.net.toFixed(4)}`;

/** 1시간봉·15분봉 연속 구간 — 시작 이후 첫 결측 직전까지 자른다(보간 없음) */
function cutAtFirstGap(bars: Bar[], step: number): { bars: Bar[]; gapAfter: number | null } {
  for (let i = 1; i < bars.length; i++) if (bars[i].t - bars[i - 1].t !== step) return { bars: bars.slice(0, i), gapAfter: bars[i - 1].t };
  return { bars, gapAfter: null };
}

export interface ForwardInput {
  bars1h: Bar[]; bars15: Bar[]; nowT: number;
  start?: number; previous?: ForwardResult | null; registeredAt?: string;
  /** A 의 개발 구간 일관성 항목(사전등록 §4) — Bitget 백테스트 1h 전체 국면 전체 구간 요약 */
  devForA?: Summary | null;
}

export function runForward(inp: ForwardInput): ForwardResult {
  const start = inp.start ?? FORWARD_START;
  const v1 = validateBars(inp.bars1h, HOUR, inp.nowT);
  const v15 = validateBars(inp.bars15, MIN15, inp.nowT);
  const base: Omit<ForwardResult, 'candidates' | 'status' | 'statusNote' | 'now' | 'dataThroughUtc'> = {
    version: 1, registeredAt: inp.registeredAt ?? '2026-11-04', startUtc: isoUtc(start), updatedAt: isoUtc(inp.nowT),
    symbol: 'ETHUSDT', exchange: 'bitget', revisions: [...(inp.previous?.revisions ?? [])],
  };
  if (!v1.ok || !v15.ok) return { ...base, status: 'data_gap', statusNote: '캔들 검증 실패(중복 불일치·OHLC 범위·경계)', now: null, dataThroughUtc: null, candidates: [] };

  // 1시간봉: 시작 전 결측이 있으면 그 다음 봉부터(일봉 기준은 연속 구간만), 시작 이후는 첫 결측 직전까지
  const preGaps = v1.gaps.filter((g) => g.nextT <= start);
  const from1h = preGaps.length ? preGaps[preGaps.length - 1].nextT : -Infinity;
  const c1 = cutAtFirstGap(v1.bars.filter((b) => b.t >= from1h), HOUR);
  const c15 = cutAtFirstGap(v15.bars.filter((b) => b.t >= start), MIN15);
  const gapNotes: string[] = [];
  if (c1.gapAfter != null) gapNotes.push(`1시간봉 ${isoUtc(c1.gapAfter)} 다음 결측`);
  if (c15.gapAfter != null) gapNotes.push(`15분봉 ${isoUtc(c15.gapAfter)} 다음 결측`);
  // 두 계열 중 먼저 끊긴 곳까지만
  const lastHourEnd = c1.bars.length ? c1.bars[c1.bars.length - 1].t + HOUR : start;
  const last15End = c15.bars.length ? c15.bars[c15.bars.length - 1].t + MIN15 : start;
  const through = Math.min(lastHourEnd, last15End);
  const bars1h = c1.bars.filter((b) => b.t + HOUR <= through);
  const bars15 = c15.bars.filter((b) => b.t + MIN15 <= through);

  let ctx;
  try { ctx = dailyContext(resample(bars1h, DAY, HOUR)); } catch { return { ...base, status: 'data_gap', statusNote: `일봉 기준을 만들 수 없음(시작 전 결측) ${gapNotes.join(', ')}`, now: null, dataThroughUtc: null, candidates: [] }; }
  const bars4h = resample(bars1h, H4, HOUR);
  const atr4h = wilderAtr(bars4h, 14);
  const lastH = bars1h[bars1h.length - 1];
  let now: ForwardResult['now'] = null;
  if (lastH) {
    const d = deviationAt(ctx, lastH);
    const recent = bars1h.slice(-4).some((b) => { const x = deviationAt(ctx, b); return x != null && x.dev <= x.q10; });
    now = { barUtc: isoUtc(lastH.t), close: lastH.c, sma25: ctx.sma25[dayIndex(ctx, lastH.t)] ?? null, deviation: d ? r(d.dev, 5) : null, q10: d ? r(d.q10, 5) : null, oversoldRecent: recent };
  }
  if (!bars15.length) {
    return { ...base, status: c1.gapAfter != null || c15.gapAfter != null ? 'data_gap' : 'waiting', statusNote: gapNotes.join(', ') || '시작 시각 이후 확정 15분봉 없음', now, dataThroughUtc: null, candidates: [] };
  }

  const signals = findSignals(bars1h, HOUR, ctx, 'all').filter((s) => s.decideT >= start);
  const prevBy = new Map((inp.previous?.candidates ?? []).map((c) => [c.id, c]));
  const revisions = base.revisions;
  const nowIso = isoUtc(inp.nowT);
  const lastBarEnd = bars15[bars15.length - 1].t + MIN15;

  const candidates = CANDIDATES.map((cand): CandidateResult => {
    const run = simulate({ bars15, signals, bars4h, atr4h, params: cand.params, leverage: FORWARD_LEVERAGE, entryFrom: start, entryTo: Infinity, startT: start });
    const last = run.trades[run.trades.length - 1];
    const openTrade = last && last.reason === 'data_end' ? last : null;
    const closedT = openTrade ? run.trades.slice(0, -1) : run.trades;
    // 보유 중 거래의 청산 비용·마지막 자산점은 성적에서 뺀다(MTM 은 직전 종가까지)
    const equity = openTrade ? run.equity.slice(0, -1) : run.equity;
    const closedRun: RunResult = { ...run, trades: closedT, equity };
    const summary = summarize(closedRun, cand.params.initial);

    const prev = prevBy.get(cand.id);
    const prevSeen = new Map((prev?.closed ?? []).map((t) => [t.entryT, t]));
    const closed: ForwardTrade[] = closedT.map((t: Trade) => {
      const row = {
        signalT: isoUtc(t.signalT), entryT: isoUtc(t.entryT), exitT: isoUtc(t.exitT), reason: t.reason,
        entry: r(t.entry, 2), stop: r(t.stop, 2), target: r(t.target, 2), exit: r(t.exit, 2), qty: r(t.qty, 6),
        net: r(t.net, 4), r: r(t.r, 4), holdH: r(t.holdH, 2), maePct: r(t.maePct, 3), firstSeenAt: nowIso,
      };
      const p = prevSeen.get(row.entryT);
      if (p) {
        row.firstSeenAt = p.firstSeenAt;
        if (tradeKey(p) !== tradeKey(row) && !revisions.some((x) => x.candidate === cand.id && x.entryT === row.entryT && x.after === tradeKey(row)))
          revisions.push({ candidate: cand.id, entryT: row.entryT, before: tradeKey(p), after: tradeKey(row), detectedAt: nowIso });
      }
      return row;
    });
    // 이전에 청산으로 기록됐는데 이번 재계산에서 사라진 거래도 경고
    for (const p of prev?.closed ?? []) {
      if (!closed.some((t) => t.entryT === p.entryT) && !revisions.some((x) => x.candidate === cand.id && x.entryT === p.entryT && x.after === 'missing'))
        revisions.push({ candidate: cand.id, entryT: p.entryT, before: tradeKey(p), after: 'missing', detectedAt: nowIso });
    }

    let open: OpenPosition | null = null;
    if (openTrade) {
      const lc = bars15[bars15.length - 1].c;
      open = {
        signalT: isoUtc(openTrade.signalT), entryT: isoUtc(openTrade.entryT), entry: r(openTrade.entry, 2), stop: r(openTrade.stop, 2), target: r(openTrade.target, 2),
        qty: r(openTrade.qty, 6), lastClose: lc, unrealizedR: r((lc - openTrade.entry) / (openTrade.entry - openTrade.stop), 3), expiresT: isoUtc(openTrade.entryT + cand.params.maxHoldMs),
      };
    }
    // 신호는 확정됐지만 진입할 다음 봉이 아직 없는 경우(보유·대기 중이면 버려지는 신호는 제외)
    const lastExit = closedT.length ? closedT[closedT.length - 1].exitT : -Infinity;
    const p = !open ? signals.find((s) => s.decideT >= lastBarEnd && s.decideT >= lastExit + cand.params.cooldownMs) : undefined;
    const pending = p ? { signalT: isoUtc(p.t), entryAtBarT: isoUtc(p.decideT), dev: r(p.dev, 5), q10: r(p.q10, 5) } : null;

    let vcode: string | null = null;
    if (summary.trades >= MIN_TRADES) {
      const dev = cand.id === 'A' ? (inp.devForA ?? null) : null;
      vcode = verdict(summary, dev ?? { ...summary, sufficient: false }, null);
    }
    const monthly = monthlyReturns(equity, cand.params.initial, start, lastBarEnd).map((m) => [m.month, r(m.retPct, 3)] as [string, number]);
    return {
      id: cand.id, name: cand.name, desc: cand.desc, targetR: cand.params.targetR,
      closed, open, pending, summary, progress: `${Math.min(summary.trades, MIN_TRADES)}/${MIN_TRADES}`,
      verdict: vcode, verdictLabel: vcode ? VERDICT_LABEL[vcode as keyof typeof VERDICT_LABEL] : null,
      monthly, equity: r(equity[equity.length - 1][1], 4),
    };
  });

  const gap = c1.gapAfter != null || c15.gapAfter != null;
  return {
    ...base, revisions, status: gap ? 'data_gap' : 'ok', statusNote: gap ? `${gapNotes.join(', ')} — 결측 직전까지만 계산(보간 없음)` : null,
    now, dataThroughUtc: isoUtc(lastBarEnd), candidates,
  };
}
