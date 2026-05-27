// ── 이동평균 (Moving Average) ─────────────────────────
export function calcMA(prices: number[], period: number): (number | null)[] {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const slice = prices.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

// ── RSI (Relative Strength Index) ────────────────────
export function calcRSI(prices: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (prices.length <= period) return prices.map(() => null);

  for (let i = 0; i < period; i++) result.push(null);

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;

  const rsi = (ag: number, al: number) =>
    al === 0 ? 100 : 100 - 100 / (1 + ag / al);

  result.push(rsi(avgGain, avgLoss));

  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    result.push(rsi(avgGain, avgLoss));
  }
  return result;
}

// ── 볼린저 밴드 (Bollinger Bands) ────────────────────
export function calcBB(
  prices: number[],
  period = 20,
  k = 2,
): { upper: number | null; middle: number | null; lower: number | null }[] {
  return prices.map((_, i) => {
    if (i < period - 1) return { upper: null, middle: null, lower: null };
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const sd   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    return { upper: mean + k * sd, middle: mean, lower: mean - k * sd };
  });
}

// ── MACD ─────────────────────────────────────────────
function ema(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++)
    result.push(prices[i] * k + result[i - 1] * (1 - k));
  return result;
}

export function calcMACD(prices: number[], fast = 12, slow = 26, signal = 9): {
  macd: number | null; signal: number | null; hist: number | null;
}[] {
  if (prices.length < slow) return prices.map(() => ({ macd: null, signal: null, hist: null }));
  const emaFast = ema(prices, fast);
  const emaSlow = ema(prices, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine.slice(slow - 1), signal);

  return prices.map((_, i) => {
    if (i < slow - 1) return { macd: null, signal: null, hist: null };
    const m = macdLine[i];
    const s = signalLine[i - (slow - 1)];
    return s !== undefined ? { macd: m, signal: s, hist: m - s } : { macd: m, signal: null, hist: null };
  });
}
