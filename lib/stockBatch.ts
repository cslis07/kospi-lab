/**
 * 시세 일괄 API(/api/stock/batch?tickers=, /api/overseas/batch?symbols=)는 한 번에 20개까지만 받는다(상류 호출 제한).
 * 관심종목·보유가 20개를 넘으면 21번째부터 시세가 비고 평가손익 합계에서도 빠지던 문제 →
 * SWR 키는 그대로 두고 이 fetcher 가 20개씩 나눠 받아 합친다.
 * 사용: useSWR(`/api/stock/batch?tickers=${codes.join(',')}`, batchFetcher, …)
 */
export const BATCH_MAX = 20;

export function chunkList<T>(list: T[], size = BATCH_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function batchFetcher<T = unknown>(key: string): Promise<Record<string, T>> {
  const [path, query = ''] = key.split('?');
  const params = new URLSearchParams(query);
  const param = params.has('tickers') ? 'tickers' : 'symbols';
  const items = [...new Set((params.get(param) ?? '').split(',').map((t) => t.trim()).filter(Boolean))];
  const parts = await Promise.all(chunkList(items).map(async (c) => {
    const p = new URLSearchParams(params);
    p.set(param, c.join(','));
    const r = await fetch(`${path}?${p.toString().replace(/%2C/g, ',')}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as Record<string, T>;
  }));
  return Object.assign({}, ...parts);
}
