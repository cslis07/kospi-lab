/**
 * 추가 가설 신호(docs/bnf/EXPERIMENTS.md E4) — 같은 엔진(lib/bnf/engine)·판정으로 시험한다.
 * 가설 2: 펀딩비 음수 극단 역추세 — 정산 펀딩비가 음수이면서 직전 365일 정산값의 10% 분위수 이하면 롱.
 * ⚠ 정산 직후에야 값이 확정되므로 정산 시각이 속한 15분봉의 '다음' 봉 시가에 체결(같은 봉 시가 금지).
 */
import { MIN15, DAY, type FundingEvent } from './data';
import { dayIndex, quantileSorted, type DailyContext } from './indicators';
import type { Regime, Signal } from './engine';

export interface FundingSignalOpts { windowMs?: number; q?: number; minEvents?: number }

/** Signal.dev = 그 정산의 펀딩비, Signal.q10 = 임계값(직전 365일 분위수) */
export function fundingExtremeSignals(events: FundingEvent[], ctx: DailyContext, regime: Regime, opts: FundingSignalOpts = {}): Signal[] {
  const { windowMs = 365 * DAY, q = 0.1, minEvents = 1000 } = opts;
  const ev = [...events].sort((a, b) => a.t - b.t);
  const out: Signal[] = [];
  let lo = 0;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    while (lo < i && ev[lo].t < e.t - windowMs) lo++;
    const n = i - lo;                                   // [t−365일, t) 구간 정산 건수(현재 제외)
    if (n < minEvents || !(e.rate < 0)) continue;
    const thr = quantileSorted(ev.slice(lo, i).map((x) => x.rate).sort((a, b) => a - b), q);
    if (!(e.rate <= thr)) continue;
    if (regime === 'bear') {
      const d = dayIndex(ctx, e.t);
      if (d < 0 || d >= ctx.bear.length || ctx.bear[d] !== true) continue;
    }
    const bar = Math.floor(e.t / MIN15) * MIN15;
    out.push({ t: e.t, decideT: bar + MIN15, dev: e.rate, q10: thr });
  }
  return out;
}
