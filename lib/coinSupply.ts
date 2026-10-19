/**
 * 레이어1 — 공급/구조 (느리게 변함 · "상승이 오면 증폭될 조건인가"를 보는 층, 트리거 아님)
 *
 * 무료·무키 소스만 사용(전부 2026-10-19 서버 fetch 실측 통과):
 *  - DefiLlama stablecoins: USD 페그 스테이블코인 총 공급(대기 자금 dry powder)
 *  - CoinGecko: stETH peg(디페그=유동성스테이킹 매도압력) + stETH 시총(스테이킹 잠김 프록시)
 *  - DefiLlama cexs: 거래소 총 리저브(전자산 USD) — ⚠ ETH 단독 아님, 추세 참고용
 *
 * ⚠ 정직성: 거래소 ETH 단독 보유량 정밀값(CryptoQuant/Glassnode)은 유료라 못 가져온다.
 *   여기 지표는 "공급 측 그림"을 그리는 무료 대체이지 ETH 리저브 정밀값이 아니다.
 *   '방향 신호'가 아니라 '공급 상태'일 뿐 — 상승을 보장하지 않는다(수요가 없으면 공급 줄어도 하락).
 */

export type SupplyState = 'supportive' | 'headwind' | 'neutral';

export interface StableSummary {
  totalUsd: number;
  prevDayUsd: number;
  prevWeekUsd: number;
  dayChangePct: number;
  weekChangePct: number;
}
export interface StethSummary {
  ethUsd: number;
  stethUsd: number;
  pegPct: number; // (stETH/ETH - 1) * 100, 음수면 디스카운트(매도압력)
  stakedMcapUsd: number; // stETH 시총 = 스테이킹 잠김 프록시(Lido 우세)
}
export interface CexSummary {
  totalReserveUsd: number; // 전 거래소 cleanAssetsTvl 합(전자산, ETH 아님)
  topReserveUsd: number;
  count: number;
}
export interface SupplyLayer {
  stables: StableSummary | null;
  steth: StethSummary | null;
  cex: CexSummary | null;
  state: SupplyState;
  asof: number;
}

interface PeggedAsset {
  pegType?: string;
  circulating?: { peggedUSD?: number };
  circulatingPrevDay?: { peggedUSD?: number };
  circulatingPrevWeek?: { peggedUSD?: number };
}
interface CexRow {
  cleanAssetsTvl?: number;
  currentTvl?: number;
}

/** USD 페그 스테이블코인만 합산해 총 공급·전일/전주 대비 변화율 계산 */
export function summarizeStables(assets: PeggedAsset[]): StableSummary | null {
  const usd = assets.filter((a) => a.pegType === 'peggedUSD');
  if (!usd.length) return null;
  const sum = (k: 'circulating' | 'circulatingPrevDay' | 'circulatingPrevWeek') =>
    usd.reduce((s, a) => s + (a[k]?.peggedUSD ?? 0), 0);
  const totalUsd = sum('circulating');
  const prevDayUsd = sum('circulatingPrevDay');
  const prevWeekUsd = sum('circulatingPrevWeek');
  return {
    totalUsd,
    prevDayUsd,
    prevWeekUsd,
    dayChangePct: prevDayUsd ? (totalUsd / prevDayUsd - 1) * 100 : 0,
    weekChangePct: prevWeekUsd ? (totalUsd / prevWeekUsd - 1) * 100 : 0,
  };
}

/** 거래소 총 리저브(cleanAssetsTvl 합)·최대 거래소·개수 */
export function summarizeCex(cexs: CexRow[]): CexSummary | null {
  const vals = cexs.map((c) => c.cleanAssetsTvl ?? c.currentTvl ?? 0).filter((v) => v > 0);
  if (!vals.length) return null;
  return { totalReserveUsd: vals.reduce((s, v) => s + v, 0), topReserveUsd: Math.max(...vals), count: vals.length };
}

/**
 * 공급 상태 판정 — 방향 예측이 아니라 "공급 측이 상승을 받쳐줄 조건인가".
 *  - 스테이블코인 주간 공급↑ = 대기 자금 유입(supportive) / ↓ = 이탈(headwind)
 *  - stETH 디스카운트(peg < -0.3%) = 유동성스테이킹 매도압력(headwind)
 */
export function supplyState(s: { stableWeekPct?: number | null; stethPegPct?: number | null }): SupplyState {
  let score = 0;
  const w = s.stableWeekPct ?? 0;
  if (w > 0.5) score += 1;
  else if (w < -0.5) score -= 1;
  const peg = s.stethPegPct ?? 0;
  if (peg < -0.3) score -= 1;
  return score >= 1 ? 'supportive' : score <= -1 ? 'headwind' : 'neutral';
}

async function jget(url: string, ms: number, revalidate: number): Promise<unknown> {
  const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getSupplyLayer(): Promise<SupplyLayer> {
  const [stables, steth, cex] = await Promise.all([
    jget('https://stablecoins.llama.fi/stablecoins?includePrices=true', 9000, 1800)
      .then((j) => summarizeStables(((j as { peggedAssets?: PeggedAsset[] }).peggedAssets) ?? []))
      .catch(() => null),
    jget(
      'https://api.coingecko.com/api/v3/simple/price?ids=staked-ether,ethereum&vs_currencies=usd&include_market_cap=true',
      8000,
      300,
    )
      .then((j) => {
        const d = j as Record<string, { usd?: number; usd_market_cap?: number }>;
        const eth = d.ethereum?.usd ?? 0;
        const st = d['staked-ether']?.usd ?? 0;
        if (!eth || !st) return null;
        return {
          ethUsd: eth,
          stethUsd: st,
          pegPct: (st / eth - 1) * 100,
          stakedMcapUsd: d['staked-ether']?.usd_market_cap ?? 0,
        } satisfies StethSummary;
      })
      .catch(() => null),
    jget('https://api.llama.fi/cexs', 9000, 1800)
      .then((j) => summarizeCex(((j as { cexs?: CexRow[] }).cexs) ?? []))
      .catch(() => null),
  ]);

  const state = supplyState({ stableWeekPct: stables?.weekChangePct, stethPegPct: steth?.pegPct });
  return { stables, steth, cex, state, asof: Date.now() };
}
