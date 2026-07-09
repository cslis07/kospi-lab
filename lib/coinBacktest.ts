/**
 * 룰 엔진 신호 백테스트 — "이 신호를 믿어도 되는가"를 데이터로 답한다.
 *
 * 방법: 과거 5분봉을 시간순으로 걸으며, 포지션이 없을 때마다 실제 룰 엔진
 * (analyzeTimeframe + buildVerdict)을 그 시점까지의 데이터로 실행.
 * 진입 조건 충족(|score|>=45 + 트리거) 시 가상 진입 → 이후 봉의 고저로
 * 1R 익절 vs 손절 중 어느 쪽이 먼저 닿는지 판정 (동시 도달 시 보수적으로 손실 처리).
 *
 * 한계: 수수료·슬리피지 미반영(실전은 이보다 나쁨), 표본이 수 일치로 짧음.
 * 승률보다 "최근 장세에서 엔진이 작동하는가"의 온도계로 사용.
 */
import {
  Candle, analyzeTimeframe, buildVerdict, srZones, fibonacci, atr,
} from './coinAnalysis';

export interface BacktestTrade {
  ts: number;
  direction: 'long' | 'short';
  score: number;
  entry: number;
  stop: number;
  target: number;
  result: 'win' | 'loss';
  bars: number;           // 청산까지 걸린 5분봉 수
}

export interface BacktestResult {
  fromTs: number;
  toTs: number;
  spanHours: number;
  signals: number;         // 진입 조건 충족 횟수(비중복)
  wins: number;
  losses: number;
  open: number;            // 데이터 끝까지 미청산
  winRate: number | null;  // %
  avgR: number | null;     // 1R 익절/-1R 손절 기준 기대값
  longSignals: number;
  shortSignals: number;
  trades: BacktestTrade[]; // 최근 순
}

/** ts 이하 캔들만 슬라이스 (최근 limit개) */
function sliceUpTo(candles: Candle[], ts: number, limit: number): Candle[] {
  let end = candles.length;
  while (end > 0 && candles[end - 1].ts > ts) end--;
  return candles.slice(Math.max(0, end - limit), end);
}

export function backtestEngine(
  c5m: Candle[], c15m: Candle[], c1h: Candle[],
  fundingRate: number,
  stepBars = 3,           // 신호 평가 주기(5분봉 3개 = 15분)
  maxHoldBars = 96,        // 최대 보유 8시간
): BacktestResult {
  const trades: BacktestTrade[] = [];
  const warmup = 80;       // 지표 안정화 구간
  let openUntil = -1;      // 진행 중 트레이드가 있으면 그 청산 인덱스까지 스킵
  let openCount = 0;

  for (let i = warmup; i < c5m.length - 1; i += stepBars) {
    if (i <= openUntil) continue;
    const nowTs = c5m[i].ts;

    const s5 = sliceUpTo(c5m, nowTs, 160);
    const s15 = sliceUpTo(c15m, nowTs, 160);
    const s1h = sliceUpTo(c1h, nowTs, 120);
    if (s5.length < 60 || s15.length < 60 || s1h.length < 60) continue;

    const h1 = analyzeTimeframe('1H', s1h);
    const m15 = analyzeTimeframe('15m', s15);
    const m5 = analyzeTimeframe('5m', s5);
    const price = m5.close;
    const zones = srZones(s15, price, atr(s15));
    const fib = fibonacci(s15, price);
    // nearFunding·이벤트는 백테스트에서 미적용(nextFundingTs=null, extras 생략)
    const v = buildVerdict(h1, m15, m5, fundingRate, null, fib, zones, null, {});

    if (!v.entryOk || v.direction === 'wait') continue;

    // 진입 → 이후 봉으로 결과 판정
    const entry = price;
    const stop = v.stop;
    const risk = Math.abs(entry - stop);
    if (risk <= 0) continue;
    const target = v.direction === 'long' ? entry + risk : entry - risk; // 1R

    let result: 'win' | 'loss' | null = null;
    let bars = 0;
    for (let j = i + 1; j < Math.min(c5m.length, i + 1 + maxHoldBars); j++) {
      bars = j - i;
      const c = c5m[j];
      const hitStop = v.direction === 'long' ? c.l <= stop : c.h >= stop;
      const hitTarget = v.direction === 'long' ? c.h >= target : c.l <= target;
      if (hitStop) { result = 'loss'; openUntil = j; break; }   // 동시 도달 → 보수적 손실
      if (hitTarget) { result = 'win'; openUntil = j; break; }
    }
    if (result === null) { openCount++; openUntil = i + maxHoldBars; continue; }

    trades.push({ ts: nowTs, direction: v.direction, score: v.score, entry, stop, target, result, bars });
  }

  const wins = trades.filter((t) => t.result === 'win').length;
  const losses = trades.length - wins;
  const closed = trades.length;
  return {
    fromTs: c5m[warmup]?.ts ?? 0,
    toTs: c5m[c5m.length - 1]?.ts ?? 0,
    spanHours: c5m.length > warmup ? ((c5m[c5m.length - 1].ts - c5m[warmup].ts) / 3600_000) : 0,
    signals: closed + openCount,
    wins, losses, open: openCount,
    winRate: closed > 0 ? (wins / closed) * 100 : null,
    avgR: closed > 0 ? (wins - losses) / closed : null,
    longSignals: trades.filter((t) => t.direction === 'long').length,
    shortSignals: trades.filter((t) => t.direction === 'short').length,
    trades: trades.slice(-10).reverse(),
  };
}
