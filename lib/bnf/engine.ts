/**
 * BNF형 25일 이격도 역추세(롱 전용, 1포지션) 백테스트 엔진 — 순수 함수. 규격: docs/bnf/STRATEGY.md §3~§4
 * 신호는 신호 봉 종가에서 확정, 다음 봉 시가 + 슬리피지로 체결. 청산은 15분봉 경로로 판정
 * (시간 만기 시가 → 갭 손절 시가 → 손절 → 목표, 같은 봉 손절·목표 동시면 손절 우선).
 * ⚠ BNF 본인의 매매 알고리즘이 아니다. 실거래 주문 기능 없음.
 */
import { MIN15, HOUR, type Bar, type FundingEvent } from './data';
import { dayIndex, atrAsOf, type DailyContext } from './indicators';

export type Regime = 'all' | 'bear';

export interface Params {
  feeRate: number;        // 편도 수수료(명목가 대비)
  slip: number;           // 편도 슬리피지(불리한 방향)
  initial: number;        // 초기 자본(USDT)
  riskPct: number;        // 1회 위험예산(자산 대비)
  marginCapPct: number;   // 증거금 사용 상한(자산 대비)
  atrMult: number;
  minStop: number;        // 최소 손절 거리(가격 대비)
  maxStop: number;        // 초과 시 건너뛰기
  targetR: number;
  maxHoldMs: number;
  cooldownMs: number;
  lookback: number;       // 최근 N개 봉(현재 포함) 안의 과매도
}

export const DEFAULT_PARAMS: Params = {
  feeRate: 0.0005, slip: 0.0002, initial: 1000, riskPct: 0.005, marginCapPct: 0.25,
  atrMult: 1.5, minStop: 0.012, maxStop: 0.08, targetR: 1.8, maxHoldMs: 72 * HOUR, cooldownMs: 24 * HOUR, lookback: 4,
};

export interface Signal { t: number; decideT: number; dev: number; q10: number }

/** 봉 b 의 이격도·임계값 — 봉이 속한 UTC 날짜 D 의 (D−1까지) 일봉 기준 */
export function deviationAt(ctx: DailyContext, b: Bar): { dev: number; q10: number } | null {
  const d = dayIndex(ctx, b.t);
  if (d < 0 || d >= ctx.sma25.length) return null;
  const s = ctx.sma25[d], q = ctx.q10[d];
  if (s == null || q == null) return null;
  return { dev: b.c / s - 1, q10: q };
}

/** 후보 신호 — 최근 lookback 개 봉(현재 포함) 중 과매도가 있고 종가 > 직전 봉 고가. 약세장 한정은 D 의 bear */
export function findSignals(tf: Bar[], tfMs: number, ctx: DailyContext, regime: Regime, lookback = DEFAULT_PARAMS.lookback): Signal[] {
  const info = tf.map((b) => deviationAt(ctx, b));
  const over = info.map((x) => x != null && x.dev <= x.q10);
  const out: Signal[] = [];
  for (let i = 1; i < tf.length; i++) {
    const x = info[i];
    if (!x || tf[i].t - tf[i - 1].t !== tfMs) continue;
    let seen = false;
    for (let j = Math.max(0, i - lookback + 1); j <= i; j++) if (over[j]) { seen = true; break; }
    if (!seen || !(tf[i].c > tf[i - 1].h)) continue;
    if (regime === 'bear' && ctx.bear[dayIndex(ctx, tf[i].t)] !== true) continue;
    out.push({ t: tf[i].t, decideT: tf[i].t + tfMs, dev: x.dev, q10: x.q10 });
  }
  return out;
}

export type ExitReason = 'target' | 'stop' | 'stop_gap' | 'time' | 'data_end';

export interface Trade {
  signalT: number; entryT: number; exitT: number;
  rawOpen: number; entry: number; stop: number; target: number; stopDist: number; atr: number;
  qty: number; notional: number; margin: number; riskAmt: number; capped: boolean;
  rawExit: number; exit: number; reason: ExitReason;
  fees: number; slipCost: number; pricePnl: number;      // pricePnl 은 슬리피지 포함 체결가 차이
  funding: number | null;                                // 보유 중 펀딩(지불은 음수). 이력 결측이면 null
  net: number;                                           // 수수료·슬리피지 반영(+ applyFunding 이면 펀딩)
  r: number; holdH: number; maePct: number; mfePct: number;
  equityBefore: number; equityAfter: number;
}

export interface FundingInput { events: FundingEvent[]; gaps: { fromT: number; toT: number }[]; apply: boolean }

export interface RunInput {
  bars15: Bar[]; signals: Signal[]; bars4h: Bar[]; atr4h: (number | null)[];
  params?: Params; leverage: number; entryFrom: number; entryTo: number; startT: number;
  funding?: FundingInput | null;
}

export interface RunResult {
  trades: Trade[];
  equity: [number, number][];      // [시각, MTM 자산] — 시작점·보유 중 15분봉 종가·청산
  skipped: { wideStop: number; busy: number; cooldown: number; noAtr: number; noBar: number };
  fundingIncomplete: number;       // 펀딩 이력 결측과 겹친 거래 수
  signalsInWindow: number;
}

export function simulate(inp: RunInput): RunResult {
  const P = inp.params ?? DEFAULT_PARAMS;
  const { bars15 } = inp;
  const t0 = bars15[0].t;
  const idxOf = (T: number) => { const i = (T - t0) / MIN15; return Number.isInteger(i) && bars15[i]?.t === T ? i : -1; };
  const trades: Trade[] = [];
  const equity: [number, number][] = [[inp.startT, P.initial]];
  const skipped = { wideStop: 0, busy: 0, cooldown: 0, noAtr: 0, noBar: 0 };
  let cash = P.initial, posExitT = -Infinity, fundingIncomplete = 0, signalsInWindow = 0;
  const signals = [...inp.signals].sort((a, b) => a.decideT - b.decideT);

  for (const s of signals) {
    const entryT = s.decideT;
    if (entryT < inp.entryFrom || entryT >= inp.entryTo) continue;
    signalsInWindow++;
    if (entryT < posExitT) { skipped.busy++; continue; }
    if (entryT < posExitT + P.cooldownMs) { skipped.cooldown++; continue; }
    const k = idxOf(entryT);
    if (k < 0) { skipped.noBar++; continue; }
    const atr = atrAsOf(inp.bars4h, inp.atr4h, s.decideT);
    if (atr == null) { skipped.noAtr++; continue; }
    const rawOpen = bars15[k].o;
    const entry = rawOpen * (1 + P.slip);
    let stopDist = (P.atrMult * atr) / entry;
    if (stopDist > P.maxStop) { skipped.wideStop++; continue; }
    stopDist = Math.max(stopDist, P.minStop);
    const stop = entry * (1 - stopDist);
    const R = entry - stop;
    const target = entry + P.targetR * R;
    const riskAmt = P.riskPct * cash;
    let qty = riskAmt / R;
    const cap = P.marginCapPct * cash * inp.leverage;
    const capped = qty * entry > cap;
    if (capped) qty = cap / entry;
    const feeIn = qty * entry * P.feeRate;

    // 청산 경로(15분봉)
    const expiry = entryT + P.maxHoldMs;
    let reason: ExitReason = 'data_end', rawExit = 0, exitT = 0, minLow = entry, maxHigh = entry;
    const held: number[] = [];                 // 보유 중 지난 봉 인덱스(MTM 용)
    let m = k;
    for (; m < bars15.length; m++) {
      const b = bars15[m];
      if (b.t >= expiry) { reason = 'time'; rawExit = b.o; exitT = b.t; minLow = Math.min(minLow, b.o); maxHigh = Math.max(maxHigh, b.o); break; }
      if (b.o <= stop) { reason = 'stop_gap'; rawExit = b.o; exitT = b.t; minLow = Math.min(minLow, b.o); break; }
      minLow = Math.min(minLow, b.l); maxHigh = Math.max(maxHigh, b.h);
      if (b.l <= stop) { reason = 'stop'; rawExit = stop; exitT = b.t + MIN15; break; }
      if (b.o >= target) { reason = 'target'; rawExit = target; exitT = b.t; break; }
      if (b.h >= target) { reason = 'target'; rawExit = target; exitT = b.t + MIN15; break; }
      held.push(m);
    }
    if (m >= bars15.length) { const last = bars15[bars15.length - 1]; rawExit = last.c; exitT = last.t + MIN15; held.pop(); }

    // 펀딩 — entryT < 정산시각(초 단위 내림) ≤ exitT 동안 보유, 명목가는 그 시각 15분봉 시가로 근사
    let funding: number | null = null;
    const fundAt: [number, number][] = [];
    if (inp.funding) {
      const overlapGap = inp.funding.gaps.some((g) => g.fromT < exitT && g.toT > entryT);
      if (overlapGap) { funding = null; fundingIncomplete++; }
      else {
        funding = 0;
        for (const e of inp.funding.events) {
          const fs = Math.floor(e.t / 1000) * 1000;
          if (fs <= entryT) continue;
          if (fs > exitT) break;
          const bi = idxOf(Math.floor(fs / MIN15) * MIN15);
          if (bi < 0) { funding = null; fundingIncomplete++; break; }
          const pay = -qty * bars15[bi].o * e.rate;
          funding += pay;
          fundAt.push([fs, pay]);
        }
      }
    }
    const applyFunding = !!inp.funding?.apply && funding != null;

    const exit = rawExit * (1 - P.slip);
    const feeOut = qty * exit * P.feeRate;
    const pricePnl = qty * (exit - entry);
    const net = pricePnl - feeIn - feeOut + (applyFunding ? funding! : 0);
    const equityBefore = cash;

    // MTM: 보유 중 15분봉 종가마다(진입 수수료·누적 펀딩 반영, 청산 비용은 청산 시 반영)
    equity.push([entryT, cash - feeIn]);
    let fi = 0, accrued = 0;
    for (const hi of held) {
      const closeT = bars15[hi].t + MIN15;
      while (applyFunding && fi < fundAt.length && fundAt[fi][0] <= closeT) accrued += fundAt[fi++][1];
      equity.push([closeT, cash - feeIn + qty * (bars15[hi].c - entry) + accrued]);
    }
    cash += net;
    equity.push([exitT, cash]);
    posExitT = exitT;

    trades.push({
      signalT: s.t, entryT, exitT, rawOpen, entry, stop, target, stopDist, atr,
      qty, notional: qty * entry, margin: (qty * entry) / inp.leverage, riskAmt, capped,
      rawExit, exit, reason, fees: feeIn + feeOut, slipCost: qty * (entry - rawOpen) + qty * (rawExit - exit), pricePnl,
      funding, net, r: net / (qty * R), holdH: (exitT - entryT) / HOUR,
      maePct: (minLow / entry - 1) * 100, mfePct: (maxHigh / entry - 1) * 100,
      equityBefore, equityAfter: cash,
    });
  }
  return { trades, equity, skipped, fundingIncomplete, signalsInWindow };
}
