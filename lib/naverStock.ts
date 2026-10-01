/**
 * 네이버페이 증권(stock.naver.com) 홈 위젯 데이터 — 2026-09-30 번들 정적분석으로 확인한 실제 호출 경로.
 *  (Chrome 확장 미연결이라 _next 청크 + webpack 런타임 lazy 청크를 받아 URL 조립부를 추적)
 *
 *  산업 트렌드   : rankings/v2/domestic/{industries|themes} · rankings/v2/foreign/USA/sectors  (+ items/v2|v1 prices)
 *  애널리스트 산업: researches/v2/industry/industries → researches/v2/industry/by-industries
 *  목표주가 변화 : researches/v2/company/goal-price-changed?direction=up|down
 *  시장지표     : securityService/integration/indicators + securityService/marketindex/{cat}/{code}/prices(미니차트)
 *  테마 ETF     : etfs/v2/{domestic|foreign}/themes · domestic/market/home/notableETF · etfs/v2/foreign
 *  실시간 랭킹   : aggregate/domesticStock · aggregate/foreignStock · etfs/v2/domestic · coin/rank/{UPBIT|BITHUMB}
 *
 * 전부 무키 공개 엔드포인트. 라우트는 preferredRegion='icn1'(서울)로 돌려 해외 IP 차단 위험을 피한다.
 * 비공식 API 라 필드가 바뀔 수 있다 → 각 함수는 실패 시 빈 값(throw 안 함), 화면은 '불러오지 못함'으로.
 */

const BASE = 'https://stock.naver.com/api';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  Referer: 'https://stock.naver.com/',
  Accept: 'application/json',
};

/**
 * 시세성(가격·랭킹·지표) 호출 = LIVE(0) → 서버 데이터 캐시를 쓰지 않는다.
 * Next 데이터 캐시는 만료 후에도 직전 값을 먼저 주고 뒤에서 갱신하므로, 몇 초짜리 revalidate 라도 한 주기씩 늦어진다.
 * 동시 요청 합치기는 라우트의 짧은 CDN 캐시(5~15초)가 맡는다. 리포트·테마 목록처럼 하루에 몇 번 바뀌는 것만 revalidate.
 */
export const LIVE = 0;

export async function nget<T = unknown>(path: string, revalidate = 60, timeoutMs = 9000): Promise<T | null> {
  try {
    const cacheOpt = revalidate === LIVE ? { cache: 'no-store' as const } : { next: { revalidate } };
    const res = await fetch(BASE + path, { headers: HEADERS, ...cacheOpt, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) { console.warn(`[naver] ${res.status} ${path.split('?')[0]}`); return null; }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[naver] 실패 ${path.split('?')[0]}: ${e instanceof Error ? e.name : 'error'}`);
    return null;
  }
}

/**
 * 라우트 응답 캐시 헤더. 비공식 API라 구조가 바뀌면 조용히 빈 값이 온다 →
 * 빈 응답은 CDN에 오래 박제하지 않고(15초) 로그에 남겨 Vercel 로그에서 '[naver] 빈 응답'으로 찾게 한다.
 */
export function naverCache(route: string, empty: boolean, normal: string): HeadersInit {
  if (empty) console.warn(`[naver] 빈 응답 ${route} — 소스 구조 변경 가능`);
  return { 'Cache-Control': empty ? 's-maxage=15, stale-while-revalidate=30' : normal };
}

export const n = (v: unknown): number => {
  if (v == null || v === '') return 0;
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x: number) => Math.round(x * 100) / 100;
const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

/* ────────────────── 산업 트렌드 ────────────────── */
export type Period = 'daily' | 'weekly' | 'monthly';
export interface TrendStock { code: string; name: string; logo?: string; price: number; change: number; changeRate: number }
export interface TrendCard {
  rank: number; code: string; name: string; changeRate: number;
  rising: number; flat: number; falling: number;
  stocks: TrendStock[];
}

interface RawTrend {
  ranking: string; code: string; name: string; changeRate: string;
  risingCount: string; fallingCount: string; unchangedCount: string;
  topByChangeRate?: { code: string; name: string; value: string; itemLogoUrl?: string }[];
}

/** 국내 종목 현재가 일괄(최대 수십 개) */
export async function krPrices(codes: string[]): Promise<Map<string, { name: string; price: number; change: number; changeRate: number }>> {
  const m = new Map<string, { name: string; price: number; change: number; changeRate: number }>();
  if (!codes.length) return m;
  const q = codes.map((c) => `itemCodes=${encodeURIComponent(c)}`).join('&');
  const rows = await nget<{ itemCode: string; itemName: string; krx?: { currentPrice: string; changePrice: string; changeRate: string } }[]>(
    `/stockSecurity/items/v2/domestic/prices?${q}&recurring=false`, LIVE);
  for (const r of rows ?? []) if (r.krx) m.set(r.itemCode, { name: r.itemName, price: n(r.krx.currentPrice), change: n(r.krx.changePrice), changeRate: r2(n(r.krx.changeRate)) });
  return m;
}

/** 미국 종목 현재가 일괄 */
export async function usPrices(codes: string[]): Promise<Map<string, { price: number; change: number; changeRate: number; symbol: string }>> {
  const m = new Map<string, { price: number; change: number; changeRate: number; symbol: string }>();
  if (!codes.length) return m;
  const q = codes.map((c) => `itemCodes=${encodeURIComponent(c)}`).join('&');
  const obj = await nget<Record<string, { currentPrice: string; changePrice: string; changeRate: string; symbolCode?: string }>>(
    `/stockSecurity/items/v1/foreign/prices?${q}`, LIVE);
  for (const [k, v] of Object.entries(obj ?? {})) m.set(k, { price: n(v.currentPrice), change: n(v.changePrice), changeRate: r2(n(v.changeRate)), symbol: v.symbolCode ?? k });
  return m;
}

export async function industryTrend(market: 'kr' | 'us', category: 'industries' | 'themes', period: Period, size = 3): Promise<TrendCard[]> {
  const path = market === 'kr'
    ? `/stockSecurity/rankings/v2/domestic/${category}?${qs({ sortType: 'changeRate', size, period })}`
    : `/stockSecurity/rankings/v2/foreign/USA/sectors?${qs({ sortType: 'changeRate', size, period })}`;
  const raw = await nget<{ items?: RawTrend[] }>(path, LIVE);
  const items = raw?.items ?? [];
  const codes = [...new Set(items.flatMap((it) => (it.topByChangeRate ?? []).map((s) => s.code)))];
  const prices = market === 'kr' ? await krPrices(codes) : await usPrices(codes);
  return items.map((it) => ({
    rank: n(it.ranking), code: it.code, name: it.name, changeRate: r2(n(it.changeRate)),
    rising: n(it.risingCount), flat: n(it.unchangedCount), falling: n(it.fallingCount),
    stocks: (it.topByChangeRate ?? []).slice(0, 3).map((s) => {
      const p = prices.get(s.code);
      return {
        code: market === 'us' ? ((p as { symbol?: string } | undefined)?.symbol ?? s.code) : s.code,
        name: s.name, logo: s.itemLogoUrl,
        price: p?.price ?? 0, change: p?.change ?? 0,
        changeRate: p ? p.changeRate : r2(n(s.value)), // 주·월간이면 value 는 기간 등락률 — 현재가 없으면 그 값을 쓴다
      };
    }),
  }));
}

/* ────────────────── 리서치 ────────────────── */
export interface GoalPriceResearch { nid: string; title: string; writeDate: string; goalPrice: number; priceAtWriteDate: number; opinion: string; opinionType: string }
export interface GoalPriceSet {
  itemCode: string; itemName: string; brokerName: string; brokerCode: string;
  goalPriceDiff: number; goalPriceDiffRate: number;
  latest: GoalPriceResearch; prev: GoalPriceResearch | null;
}
const toRes = (x: Record<string, string> | undefined): GoalPriceResearch | null => x ? ({
  nid: x.nid, title: x.title, writeDate: x.writeDate, goalPrice: n(x.goalPrice), priceAtWriteDate: n(x.priceAtWriteDate),
  opinion: x.opinion ?? '', opinionType: x.opinionType ?? '',
}) : null;

export async function goalPriceChanged(direction: 'up' | 'down', size = 10): Promise<{ writeDate: string; sets: GoalPriceSet[] }> {
  const d = await nget<{ writeDate?: string; researchSets?: Record<string, unknown>[] }>(
    `/stockSecurity/researches/v2/company/goal-price-changed?${qs({ direction, size })}`, 600);
  const sets = (d?.researchSets ?? []).map((s) => ({
    itemCode: String(s.itemCode), itemName: String(s.itemName), brokerName: String(s.brokerName ?? ''), brokerCode: String(s.brokerCode ?? ''),
    goalPriceDiff: n(s.goalPriceDiff), goalPriceDiffRate: r2(n(s.goalPriceDiffRate)),
    latest: toRes(s.latestResearch as Record<string, string>)!, prev: toRes(s.prevResearch as Record<string, string> | undefined),
  })).filter((s) => s.latest);
  return { writeDate: d?.writeDate ?? '', sets };
}

/** 종목 로고(네이버 CDN, 네이버 API가 주는 itemLogoUrl 과 같은 규칙) */
export const stockLogo = (code: string) => `https://ssl.pstatic.net/imgstock/fn/real/logo/stock/Stock${code}.svg`;
/** 네이버 증권 기업 리포트 상세(목표주가 카드 클릭 시 이동) */
export const researchUrl = (nid: string) => `https://stock.naver.com/research/company/${nid}`;

/** 업종 코드 → 이름(79개 전체, 하루 캐시) — 업종 순위 API 를 size=100 으로 한 번 */
export async function industryNameMap(): Promise<Map<string, string>> {
  const d = await nget<{ items?: { code: string; name: string }[] }>(
    `/stockSecurity/rankings/v2/domestic/industries?${qs({ sortType: 'changeRate', size: 100, period: 'daily' })}`, 86400);
  return new Map((d?.items ?? []).map((x) => [String(x.code), x.name]));
}

/** 종목의 업종 코드(하루 캐시) — 모바일 증권 integration 응답의 industryCode */
export async function stockIndustryCode(code: string): Promise<string> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, {
      headers: { ...HEADERS, Referer: 'https://m.stock.naver.com/' }, next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return '';
    const j = (await res.json()) as { industryCode?: string | number };
    return j.industryCode != null ? String(j.industryCode) : '';
  } catch { return ''; }
}

export interface AnalystIndustry { industry: string; name: string; count: number; latest: string }
export interface IndustryReport { nid: string; title: string; brokerName: string; analystName: string; writeDate: string; readCount: number; industryName: string; url: string }

export async function analystIndustries(period = 7, size = 3): Promise<{ baseDate: string; industries: AnalystIndustry[] }> {
  const d = await nget<{ baseDate?: string; industries?: { industry: string; industryKorName: string; researchCount: string; mostRecentWriteDate: string }[] }>(
    `/stockSecurity/researches/v2/industry/industries?${qs({ sortType: 'industryName', period, size })}`, 900);
  return {
    baseDate: d?.baseDate ?? '',
    industries: (d?.industries ?? []).map((x) => ({ industry: x.industry, name: x.industryKorName, count: n(x.researchCount), latest: x.mostRecentWriteDate })),
  };
}

export async function industryReports(industry: string, size = 6): Promise<IndustryReport[]> {
  const d = await nget<Record<string, Record<string, string>[]>>(
    `/stockSecurity/researches/v2/industry/by-industries?${qs({ industryTypes: industry, size })}`, 900);
  return (d?.[industry] ?? []).map((x) => ({
    nid: x.nid, title: x.title, brokerName: x.brokerName ?? '', analystName: x.analystName ?? '', writeDate: x.writeDate ?? '',
    readCount: n(x.readCount), industryName: x.industryKoreanName ?? '',
    url: `https://finance.naver.com/research/industry_read.naver?nid=${x.nid}`,
  }));
}

/* ────────────────── 시장지표 ────────────────── */
export interface IndicatorDef { code: string; name: string; cat: 'exchange' | 'bond' | 'energy' | 'metals'; unit?: string; flag?: string }
/** 네이버 홈 '환율 · 시장지표' 12종(번들의 코드 배열과 동일 순서) */
export const INDICATORS: IndicatorDef[] = [
  { code: 'FX_USDKRW', name: '미국 USD', cat: 'exchange', unit: '원', flag: '🇺🇸' },
  { code: 'FX_EURKRW', name: '유럽 EUR', cat: 'exchange', unit: '원', flag: '🇪🇺' },
  { code: 'FX_JPYKRW', name: '일본 JPY(100엔)', cat: 'exchange', unit: '원', flag: '🇯🇵' },
  { code: '.DXY', name: '달러인덱스', cat: 'exchange' },
  { code: 'US3YT=RR', name: '미국 국채 3년', cat: 'bond', unit: '%', flag: '🇺🇸' },
  { code: 'US10YT=RR', name: '미국 국채 10년', cat: 'bond', unit: '%', flag: '🇺🇸' },
  { code: 'CLcv1', name: 'WTI', cat: 'energy', unit: '$' },
  { code: 'GCcv1', name: '국제 금', cat: 'metals', unit: '$' },
  { code: 'M04020000', name: '국내 금(g)', cat: 'metals', unit: '원' },
  { code: 'SIcv1', name: '은', cat: 'metals', unit: '$' },
  { code: 'KR2YT=RR', name: '한국 국채 2년', cat: 'bond', unit: '%', flag: '🇰🇷' },
  { code: 'KR10YT=RR', name: '한국 국채 10년', cat: 'bond', unit: '%', flag: '🇰🇷' },
];

export interface IndicatorQuote {
  code: string; name: string; cat: string; unit?: string; flag?: string;
  price: number; change: number; changeRate: number;
  status: '실시간' | string; tradedAt: string; spark: number[];
}

export async function marketIndicators(): Promise<IndicatorQuote[]> {
  const codes = INDICATORS.map((x) => x.code).join(',');
  const live = await nget<Record<string, string | number | null>[]>(
    `/securityService/integration/indicators?indicatorCodes=${encodeURIComponent(codes)}`, LIVE);
  const byCode = new Map((live ?? []).map((x) => [String(x.reutersCode), x]));
  // 미니차트 — 일별 종가 최근 30개(10분 캐시)
  const hist = await Promise.all(INDICATORS.map((d) =>
    nget<{ closePrice: string }[]>(`/securityService/marketindex/${d.cat}/${encodeURIComponent(d.code)}/prices?page=1&pageSize=30`, 600)));
  return INDICATORS.map((d, i) => {
    const x = byCode.get(d.code);
    const spark = (hist[i] ?? []).map((h) => n(h.closePrice)).filter((v) => v > 0).reverse();
    const price = n(x?.currentPrice) || spark[spark.length - 1] || 0;
    if (spark.length && price) spark[spark.length - 1] = price;
    const open = x?.marketStatus === 'OPEN';
    const delay = n(x?.delayTime);
    return {
      code: d.code, name: d.name, cat: d.cat, unit: d.unit, flag: d.flag,
      price, change: n(x?.fluctuations), changeRate: r2(n(x?.fluctuationsRatio)),
      status: !x ? '—' : open ? (delay > 0 ? `${delay}분 지연` : '실시간') : '장마감',
      tradedAt: String(x?.localTradedAt ?? ''), spark,
    };
  });
}

/* ────────────────── 테마 ETF ────────────────── */
export interface EtfTheme { code: string; name: string; large: string; count: number; return1d?: number; return3m?: number }
export async function etfThemes(region: 'kr' | 'us'): Promise<EtfTheme[]> {
  const d = await nget<{ largeCategoryName: string; middleCategories: { code: string; name: string; displayName?: string | null; itemCount: string; return1d?: string; return3m?: string }[] }[]>(
    `/stockSecurity/etfs/v2/${region === 'kr' ? 'domestic' : 'foreign'}/themes`, 3600);
  return (d ?? []).flatMap((g) => g.middleCategories.map((m) => ({
    code: m.code, name: m.displayName || m.name, large: g.largeCategoryName, count: n(m.itemCount),
    return1d: m.return1d != null ? r2(n(m.return1d)) : undefined, return3m: m.return3m != null ? r2(n(m.return3m)) : undefined,
  })));
}

export interface ThemeEtf { code: string; name: string; price: number; change: number; changeRate: number; return1w?: number; return1m?: number; type: string; currency: 'KRW' | 'USD' }
export async function themeEtfs(region: 'kr' | 'us', themeCode: string, size = 8): Promise<ThemeEtf[]> {
  if (region === 'kr') {
    // 국내: 테마(중분류) ETF → 1주 수익률 내림차순
    const d = await nget<Record<string, string>[]>(
      `/domestic/market/home/notableETF?${qs({ middleCodeList: themeCode, orderType: 'up_etf', startIdx: 0, pageSize: 40 })}`, LIVE);
    return (d ?? []).map((x) => ({
      code: x.itemcode, name: x.itemname, price: n(x.nowPrice), change: n(x.prevChangePrice), changeRate: r2(n(x.prevChangeRate)),
      return1w: r2(n(x.oneWeekEarnRate)), return1m: r2(n(x.oneMonthEarnRate)), type: x.etfType ?? '', currency: 'KRW' as const,
    })).sort((a, b) => (b.return1w ?? 0) - (a.return1w ?? 0)).slice(0, size);
  }
  // 미국: 1주 수익률 필드가 없어 거래대금 순(정직하게 '거래대금 상위'로 표기)
  const d = await nget<{ items?: Record<string, string>[] }>(
    `/stockSecurity/etfs/v2/foreign?${qs({ nationType: 'USA', middleCategoryCode: themeCode, sortType: 'tradingValue', sortDirection: 'desc', index: 0, size })}`, LIVE);
  return (d?.items ?? []).map((x) => ({
    code: x.symbolCode ?? x.itemCode, name: x.itemName, price: n(x.currentPrice), change: n(x.changePrice), changeRate: r2(n(x.changeRate)),
    type: x.exchangeName ?? '', currency: 'USD' as const,
  }));
}

/* ────────────────── 실시간 랭킹 ────────────────── */
export type RankTab = 'value' | 'popular' | 'up' | 'down' | 'cap' | 'volume';
export interface RankRow { code: string; name: string; price: number; change: number; changeRate: number; metric: number; metricLabel: string; href?: string }

const KR_LISTING: Record<Exclude<RankTab, 'popular'>, string> = {
  value: 'tradingValueDesc', up: 'changeRateDescUpAll', down: 'changeRateDescDownAll', cap: 'marketCapDesc', volume: 'tradingVolumeDesc',
};
const US_SORT: Record<Exclude<RankTab, 'popular'>, [string, string]> = {
  value: ['tradingValue', 'desc'], up: ['changeRate', 'desc'], down: ['changeRate', 'asc'], cap: ['marketCap', 'desc'], volume: ['tradingVolume', 'desc'],
};
const ETF_LISTING: Record<Exclude<RankTab, 'popular'>, string> = {
  value: 'tradingValueDesc', up: 'changeRateDescUpAll', down: 'changeRateDescDownAll', cap: 'aumDesc', volume: 'tradingVolumeDesc',
};
const COIN_SORT: Record<RankTab, string> = { value: 'top', popular: 'top', up: 'up', down: 'down', cap: 'marketValue', volume: 'quantTop' };

const metricOf = (tab: RankTab) => (tab === 'cap' ? '시가총액' : tab === 'volume' ? '거래량' : tab === 'popular' ? '조회' : '거래대금');

type KrRow = { itemCode: string; itemName: string; currentPrice: string; changePrice: string; changeRate: string; tradingValue: string; tradingVolume: string; marketCap: string };

export async function rankKrStocks(tab: RankTab, size = 10): Promise<RankRow[]> {
  if (tab === 'popular') {
    const d = await nget<{ items?: { itemCode: string; hitCount: string; price?: { itemName: string; krx?: Record<string, string> } }[] }>(
      `/stockSecurity/aggregate/domesticStock?${qs({ type: 'popular', exchangeType: 'KRX', size })}`, LIVE);
    return (d?.items ?? []).map((x) => ({
      code: x.itemCode, name: x.price?.itemName ?? x.itemCode, price: n(x.price?.krx?.currentPrice), change: n(x.price?.krx?.changePrice),
      changeRate: r2(n(x.price?.krx?.changeRate)), metric: n(x.hitCount), metricLabel: '조회', href: `/stock/${x.itemCode}`,
    }));
  }
  const d = await nget<{ items?: KrRow[] }>(
    `/stockSecurity/aggregate/domesticStock?${qs({ type: 'listing', exchangeType: 'KRX', size, index: 0, listingType: KR_LISTING[tab] })}`, LIVE);
  return (d?.items ?? []).map((x) => ({
    code: x.itemCode, name: x.itemName, price: n(x.currentPrice), change: n(x.changePrice), changeRate: r2(n(x.changeRate)),
    metric: tab === 'cap' ? n(x.marketCap) : tab === 'volume' ? n(x.tradingVolume) : n(x.tradingValue), metricLabel: metricOf(tab), href: `/stock/${x.itemCode}`,
  }));
}

type UsRow = { symbolCode: string; reutersCode: string; itemName: string; currentPrice: string; changePrice: string; changeRate: string; tradingValue: string; tradingVolume: string; marketCap: string };

export async function rankUsStocks(tab: RankTab, size = 10): Promise<RankRow[]> {
  if (tab === 'popular') {
    const d = await nget<{ items?: { itemCode: string; hitCount: string; price?: Record<string, string> }[] }>(
      `/stockSecurity/aggregate/foreignStock?${qs({ type: 'popular', nationType: 'USA', size })}`, LIVE);
    return (d?.items ?? []).map((x) => {
      const sym = x.price?.symbolCode ?? x.itemCode.split('.')[0];
      return {
        code: sym, name: x.price?.itemName ?? sym, price: n(x.price?.currentPrice), change: n(x.price?.changePrice),
        changeRate: r2(n(x.price?.changeRate)), metric: n(x.hitCount), metricLabel: '조회', href: `/overseas/${encodeURIComponent(sym)}`,
      };
    });
  }
  const [sortType, sortDirection] = US_SORT[tab];
  const d = await nget<{ items?: UsRow[] }>(
    `/stockSecurity/aggregate/foreignStock?${qs({ type: 'listing', nationType: 'USA', size, index: 0, sortType, sortDirection })}`, LIVE);
  return (d?.items ?? []).map((x) => ({
    code: x.symbolCode, name: x.itemName, price: n(x.currentPrice), change: n(x.changePrice), changeRate: r2(n(x.changeRate)),
    metric: tab === 'cap' ? n(x.marketCap) : tab === 'volume' ? n(x.tradingVolume) : n(x.tradingValue), metricLabel: metricOf(tab),
    href: `/overseas/${encodeURIComponent(x.symbolCode)}`,
  }));
}

type EtfRow = { itemCode: string; itemName: string; currentPrice: string; changePrice: string; changeRate: string; tradingValue: string; tradingVolume: string; totalNetAssets: string };

export async function rankKrEtfs(tab: RankTab, size = 10): Promise<RankRow[]> {
  if (tab === 'popular') {
    // 인기 ETF 랭킹은 코드·조회수만 준다 → 이름·현재가는 일괄 시세로 보강
    const d = await nget<{ items?: { itemCode: string; hitCount: string }[] }>(
      `/stockSecurity/rankings/v2/domestic/popular-etf?${qs({ size })}`, LIVE);
    const items = d?.items ?? [];
    const px = await krPrices(items.map((x) => x.itemCode));
    return items.map((x) => {
      const p = px.get(x.itemCode);
      return {
        code: x.itemCode, name: p?.name ?? x.itemCode, price: p?.price ?? 0, change: p?.change ?? 0,
        changeRate: p?.changeRate ?? 0, metric: n(x.hitCount), metricLabel: '조회', href: `/stock/${x.itemCode}`,
      };
    });
  }
  const d = await nget<{ items?: EtfRow[] }>(
    `/stockSecurity/etfs/v2/domestic?${qs({ listingType: ETF_LISTING[tab], index: 0, size })}`, LIVE);
  return (d?.items ?? []).map((x) => ({
    code: x.itemCode, name: x.itemName, price: n(x.currentPrice), change: n(x.changePrice), changeRate: r2(n(x.changeRate)),
    metric: tab === 'cap' ? n(x.totalNetAssets) : tab === 'volume' ? n(x.tradingVolume) : n(x.tradingValue),
    metricLabel: tab === 'cap' ? '순자산' : metricOf(tab), href: `/stock/${x.itemCode}`,
  }));
}

type CoinRow = { nfTicker: string; krName: string; tradePrice: number; changeRate: number; changeValue: number; marketCap: number; accumulatedTradingValue: number; accumulatedTradingVolume: number };

export async function rankCoins(tab: RankTab, exchange: 'UPBIT' | 'BITHUMB', size = 10): Promise<RankRow[]> {
  const d = await nget<{ contents?: CoinRow[] }>(`/coin/rank/${exchange}?${qs({ sortType: COIN_SORT[tab], page: 1, pageSize: size })}`, LIVE);
  return (d?.contents ?? []).map((x) => ({
    code: x.nfTicker, name: x.krName, price: x.tradePrice, change: x.changeValue, changeRate: r2(x.changeRate),
    metric: tab === 'cap' ? x.marketCap : tab === 'volume' ? x.accumulatedTradingVolume : x.accumulatedTradingValue,
    metricLabel: tab === 'cap' ? '시가총액' : tab === 'volume' ? '거래량' : '거래대금',
    href: `/crypto/${x.nfTicker}USDT`,
  }));
}
