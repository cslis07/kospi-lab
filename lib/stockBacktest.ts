/**
 * 주식 룰 엔진 백테스트 — 일봉 기준.
 * 과거 일봉을 걸으며 매수 신호(buy + entryOk) 발생 시 가상 진입 →
 * 이후 N영업일 내 1R 익절 vs 손절 판정. 수급·재무는 과거 시점 데이터가
 * 없어 기술적 신호만으로 백테스트(실전은 수급까지 봐서 더 정교함을 명시).
 */
import {
  Candle, analyzeTimeframe, srZones, fibonacci, atr,
} from './coinAnalysis';
import { buildStockVerdict } from './stockAnalysis';

export interface StockBacktestTrade {
  ts: number; score: number;
  entry: number; stop: number; target: number;
  result: 'win' | 'loss'; days: number;
}

export interface StockBacktestResult {
  spanDays: number;
  signals: number; wins: number; losses: number; open: number;
  winRate: number | null; avgR: number | null;
  trades: StockBacktestTrade[];
}

function sliceUpTo(candles: Candle[], idx: number, limit: number): Candle[] {
  return candles.slice(Math.max(0, idx - limit + 1), idx + 1);
}

export function backtestStock(candles: Candle[], maxHoldDays = 20): StockBacktestResult {
  const trades: StockBacktestTrade[] = [];
  const warmup = 70;
  let openUntil = -1;
  let openCount = 0;

  for (let i = warmup; i < candles.length - 1; i++) {
    if (i <= openUntil) continue;
    const win = sliceUpTo(candles, i, 250);
    if (win.length < 60) continue;

    const daily = analyzeTimeframe('D', win);
    const price = daily.close;
    const zones = srZones(win, price, atr(win));
    const fib = fibonacci(win, price);
    const v = buildStockVerdict(daily, win, fib, zones, {}); // 기술적 전용

    if (!v.entryOk || v.stance !== 'buy') continue;

    const entry = price;
    const stop = v.stop;
    const risk = entry - stop;
    if (risk <= 0) continue;
    const target = entry + risk; // 1R

    let result: 'win' | 'loss' | null = null;
    let days = 0;
    for (let j = i + 1; j < Math.min(candles.length, i + 1 + maxHoldDays); j++) {
      days = j - i;
      const c = candles[j];
      if (c.l <= stop) { result = 'loss'; openUntil = j; break; }  // 동시 → 보수적 손실
      if (c.h >= target) { result = 'win'; openUntil = j; break; }
    }
    if (result === null) { openCount++; openUntil = i + maxHoldDays; continue; }
    trades.push({ ts: candles[i].ts, score: v.score, entry, stop, target, result, days });
  }

  const wins = trades.filter((t) => t.result === 'win').length;
  const losses = trades.length - wins;
  const closed = trades.length;
  return {
    spanDays: candles.length > warmup ? Math.round((candles[candles.length - 1].ts - candles[warmup].ts) / 86400_000) : 0,
    signals: closed + openCount, wins, losses, open: openCount,
    winRate: closed > 0 ? (wins / closed) * 100 : null,
    avgR: closed > 0 ? (wins - losses) / closed : null,
    trades: trades.slice(-10).reverse(),
  };
}
