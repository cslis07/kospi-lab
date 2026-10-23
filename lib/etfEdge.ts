/**
 * 현물 ETF 순유입 "과거 통계" — 큰 유입·유출 다음 날 BTC·ETH가 실제로 어땠나를 **측정**한다(예측 아님).
 *
 * 판정 기준은 모닝 브리핑 과거 통계(lib/briefEdge)와 **같은 사전 고정 규칙**을 그대로 쓴다(튜닝 금지):
 *   상위·하위 20% 날 · 전체 50일 이상 · 구간 표본 30건 이상 · |z| ≥ 2.58 · 반분 일관.
 *
 * 데이터 한계: SoSoValue 공식 API는 최근 1개월만 준다. 그래서 GitHub Actions(etf-archive.yml)가 매일
 * `/api/etf/history`를 받아 etf-data 브랜치의 data/etf-flows.json에 누적한다. 쌓이기 전엔 '표본 쌓는 중'이 정상이다
 * (구간 표본 30건 = 대략 150거래일 ≈ 7개월).
 *
 * 시점 정렬: 미국 거래일 t의 순유입(미국 장 마감 뒤 집계) → BTC/ETH UTC 일봉 t+1의 수익률(close(t+1)/close(t)).
 */
import { edgeRows, nextReturns, bucketOf, type EdgeRow, type Obs, type Bucket } from '@/lib/briefEdge';
import { fetchEtfRows, type Row } from '@/lib/etfFlow';

export const ARCHIVE_URL = 'https://raw.githubusercontent.com/cslis07/kospi-lab/etf-data/data/etf-flows.json';
/** edgeRows 가 요구하는 최소 전체 일수 */
export const MIN_DAYS = 50;

export interface EtfArchive { updatedAt: string; BTC: Row[]; ETH: Row[] }

/** 날짜 기준 병합 — 같은 날짜는 새 값(fresh)이 이김. 오름차순 */
export function mergeRows(old: Row[], fresh: Row[]): Row[] {
  const m = new Map<string, Row>();
  for (const r of old) if (r?.date && Number.isFinite(r.totalNetInflow)) m.set(r.date, r);
  for (const r of fresh) if (r?.date && Number.isFinite(r.totalNetInflow)) m.set(r.date, r);
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface EtfEdge {
  coin: 'BTC' | 'ETH';
  days: number; from: string | null; to: string | null;
  rows: EdgeRow[];
  latest: { date: string; netM: number; bucket: Bucket } | null;
  /** 표본이 모자라면 얼마나 더 필요한지 */
  need: number;
}

/** 순수 함수 — 순유입 행 + 대상 일봉(오름차순 Obs) → 통계 */
export function buildEtfEdge(coin: 'BTC' | 'ETH', flows: Row[], target: Obs[]): EtfEdge {
  const factor = mergeRows([], flows).map((r) => ({ date: r.date, ch: r.totalNetInflow / 1e6 }));
  const pairs = nextReturns(factor, target);
  const rows = edgeRows({ key: `etf_${coin.toLowerCase()}`, label: `${coin} ETF 순유입`, unit: '$M' }, pairs);
  const last = factor[factor.length - 1];
  return {
    coin, days: pairs.length, from: pairs[0]?.date ?? null, to: pairs[pairs.length - 1]?.date ?? null, rows,
    latest: last ? { date: last.date, netM: last.ch, bucket: bucketOf(last.ch, rows) } : null,
    need: Math.max(0, MIN_DAYS - pairs.length),
  };
}

/* ── 로더(네트워크) ─────────────────────────────── */
async function archive(): Promise<EtfArchive | null> {
  try {
    const res = await fetch(ARCHIVE_URL, { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } });
    return res.ok ? ((await res.json()) as EtfArchive) : null;
  } catch { return null; }
}

async function daily(coin: 'BTC' | 'ETH'): Promise<Obs[]> {
  // 현물 UTC 일봉(최대 약 300일) — 보관분이 이보다 길어지면 history-candles 페이징으로 바꿀 것
  const res = await fetch(`https://api.bitget.com/api/v2/spot/market/candles?symbol=${coin}USDT&granularity=1Dutc&limit=1000`, {
    signal: AbortSignal.timeout(8000), next: { revalidate: 3600 },
  });
  const j = await res.json().catch(() => null);
  if (j?.code !== '00000') return [];
  return (j.data as string[][])
    .map((r) => ({ date: new Date(+r[0]).toISOString().slice(0, 10), value: +r[4] }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function getEtfEdge(): Promise<{ BTC: EtfEdge; ETH: EtfEdge; archivedAt: string | null }> {
  const [arc, btcLive, ethLive, btcD, ethD] = await Promise.all([
    archive(), fetchEtfRows('BTC').catch(() => null), fetchEtfRows('ETH').catch(() => null), daily('BTC'), daily('ETH'),
  ]);
  return {
    BTC: buildEtfEdge('BTC', mergeRows(arc?.BTC ?? [], btcLive ?? []), btcD),
    ETH: buildEtfEdge('ETH', mergeRows(arc?.ETH ?? [], ethLive ?? []), ethD),
    archivedAt: arc?.updatedAt ?? null,
  };
}
