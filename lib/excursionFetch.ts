/**
 * MAE/MFE 계산용 캔들 조회 + 결과 캐시 — 매매별 패널(ExcursionPanel)과 요약 카드(ExcursionSummaryCard) 공용.
 * - 캔들: 공개 /api/candles(Bitget, 한 번 200봉) — 같은 매매는 메모리에서 재사용
 * - 결과(Excursion): 과거 캔들은 바뀌지 않으므로 이 기기(localStorage)에 저장 → 다음 방문엔 새 매매만 계산
 * 브라우저 전용. 계산은 lib/tradeAutopsy(테스트 고정).
 */
import { pickGranularity, tradeExcursion, type Candle, type Excursion } from './tradeAutopsy';

export interface ExcursionTrade {
  positionId: string; symbol: string; side: 'long' | 'short';
  openAvg: number; closeAvg: number; size: number; openTs: number; closeTs: number;
  netProfit: number; stop?: number;
}

const KEY = 'kospi-lab-excursions';
const VERSION = 1; // 계산식이 바뀌면 올려서 옛 캐시를 버린다
const candleCache = new Map<string, Promise<{ candles: Candle[]; barMs: number; g: string; error?: string }>>();

type Stored = Record<string, Excursion & { g: string }>;
function readStore(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.v === VERSION && s.d ? s.d : {};
  } catch { return {}; }
}
function writeStore(d: Stored) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, d })); } catch { /* 용량·사생활 모드 — 무시(다음에 다시 계산) */ }
}

/** 저장된 결과(없으면 null) */
export function cachedExcursion(id: string): (Excursion & { g: string }) | null {
  return readStore()[id] ?? null;
}

// Bitget 공개 API 속도 제한 — 동시 3건으로 몰아 보내면 429(Too Many Requests)가 난다(실측 44건 중 25건).
// 요청 시작 간격을 전체 합쳐 최소 GAP_MS 로 벌리고, 429 면 잠깐 쉬었다 다시 시도한다.
const GAP_MS = 220;
const RETRIES = 3;
let nextSlot = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function throttle() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP_MS;
  if (at > now) await sleep(at - now);
}

async function getCandles(url: string): Promise<{ candles?: Candle[]; error?: string }> {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    try {
      const j = await (await fetch(url)).json() as { candles?: Candle[]; error?: string };
      if (j.error?.includes('429') && attempt < RETRIES) { await sleep(800 * (attempt + 1)); continue; }
      return j;
    } catch (e) {
      if (attempt < RETRIES) { await sleep(800 * (attempt + 1)); continue; }
      return { error: String(e) };
    }
  }
}

/** 보유 구간 + 진입 전 30봉 캔들 — 같은 매매는 한 번만 요청 */
export function fetchTradeCandles(t: ExcursionTrade) {
  const hit = candleCache.get(t.positionId);
  if (hit) return hit;
  const { g, ms, limit } = pickGranularity(t.closeTs - t.openTs);
  const url = `/api/candles?symbol=${encodeURIComponent(t.symbol)}&granularity=${g}&endTime=${t.closeTs + ms}&limit=${limit}`;
  const p = getCandles(url)
    .then((j) => ({ candles: j.candles ?? [], barMs: ms, g, error: j.error }));
  candleCache.set(t.positionId, p);
  // 실패는 캐시하지 않는다(다음에 다시 시도)
  p.then((r) => { if (r.error) candleCache.delete(t.positionId); });
  return p;
}

/** 한 매매의 MAE/MFE — 저장본이 있으면 그대로, 없으면 캔들로 계산해 저장 */
export async function loadExcursion(t: ExcursionTrade): Promise<(Excursion & { g: string }) | null> {
  const hit = cachedExcursion(t.positionId);
  if (hit) return hit;
  const { candles, barMs, g, error } = await fetchTradeCandles(t);
  const ex = tradeExcursion({ side: t.side, entry: t.openAvg, exit: t.closeAvg, size: t.size, openTs: t.openTs, closeTs: t.closeTs, stop: t.stop }, candles, barMs);
  if (ex && !error) {
    const d = readStore();
    d[t.positionId] = { ...ex, g };
    writeStore(d);
  }
  return ex ? { ...ex, g } : null;
}

/** 여러 매매를 동시 n개씩 — Bitget 공개 API 에 몰아 보내지 않게 */
export async function loadExcursions(
  ts: ExcursionTrade[],
  onProgress: (done: number, total: number) => void,
  concurrency = 3,
): Promise<Map<string, Excursion & { g: string }>> {
  const out = new Map<string, Excursion & { g: string }>();
  let next = 0, done = 0;
  const worker = async () => {
    while (next < ts.length) {
      const t = ts[next++];
      const ex = await loadExcursion(t);
      if (ex) out.set(t.positionId, ex);
      onProgress(++done, ts.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ts.length) }, worker));
  return out;
}
