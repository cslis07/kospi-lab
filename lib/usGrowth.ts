/**
 * 미국 성장주 스캔 — Yahoo quoteSummary 기반.
 * 점수 체계는 한국(lib/growthScreener)과 동일한 100점 4부문·동일 출력 형태(GrowthScore)로
 * 맞춰 UI 를 그대로 재사용한다.
 *
 * 한국과의 데이터 차이:
 *  - 확정 다개년 시계열 대신 Yahoo 의 TTM 지표(revenueGrowth·earningsGrowth 등)
 *  - 컨센서스 = forwardPE(애널리스트 EPS 추정 기반) + pegRatio(야후 계산)
 *  - FCF·배당수익률이 직접 제공된다(한국은 미제공이라 당좌비율·유보율로 대체했던 부분)
 */
import { fetchYahoo, yfRaw, yfStr } from './yahooFinance';
import type { GrowthScore } from './growthScreener';

/** GICS 11섹터 기반 — 증권사·토스가 쓰는 대분류 뼈대 */
export const US_SECTORS = [
  '기술', '커뮤니케이션', '경기소비재', '필수소비재', '헬스케어',
  '금융', '산업재', '에너지', '유틸리티', '소재', '부동산',
] as const;
export type UsSector = (typeof US_SECTORS)[number];

/** 테마 — 섹터를 가로지르는 증권사 스타일 소분류(한 종목이 여러 테마에 속할 수 있다) */
export const US_THEMES = [
  'AI·반도체', '반도체장비', '빅테크', '클라우드·SaaS', '사이버보안', '데이터·인프라',
  '핀테크·결제', '전기차·자율주행', '우주항공·방산', '원자력·전력', '양자컴퓨터',
  '비만치료제', '바이오·제약', '소비브랜드', '플랫폼·미디어', '금융·보험', '에너지·원자재',
] as const;
export type UsTheme = (typeof US_THEMES)[number];

export interface UsUniverseItem {
  ticker: string;
  name: string;
  sector: UsSector;
  themes: UsTheme[];
}

/** Yahoo assetProfile 의 영문 섹터 → 한글 섹터 (검색으로 들어온 임의 종목용) */
const YF_SECTOR_KO: Record<string, UsSector> = {
  'Technology': '기술',
  'Communication Services': '커뮤니케이션',
  'Consumer Cyclical': '경기소비재',
  'Consumer Defensive': '필수소비재',
  'Healthcare': '헬스케어',
  'Financial Services': '금융',
  'Financial': '금융',
  'Industrials': '산업재',
  'Energy': '에너지',
  'Utilities': '유틸리티',
  'Basic Materials': '소재',
  'Real Estate': '부동산',
};

/* 큐레이션 유니버스 (~110종목) — 섹터(GICS 11) × 테마(증권사 스타일) 2축 태깅.
 * 동적 S&P500 구성종목 API 는 무료·무키 소스가 불안정해 정적 리스트로 운영한다.
 * 시세·재무는 전부 실시간(Yahoo)이므로 리스트만 가끔 손보면 된다.
 * 여기에 없는 종목은 화면의 '종목 검색'으로 티커를 직접 찾아 스캔할 수 있다. */
export const US_UNIVERSE: UsUniverseItem[] = [
  // ── 빅테크 ──
  { ticker: 'AAPL', name: 'Apple', sector: '기술', themes: ['빅테크', '소비브랜드'] },
  { ticker: 'MSFT', name: 'Microsoft', sector: '기술', themes: ['빅테크', '클라우드·SaaS', 'AI·반도체'] },
  { ticker: 'GOOGL', name: 'Alphabet', sector: '커뮤니케이션', themes: ['빅테크', '클라우드·SaaS', '플랫폼·미디어'] },
  { ticker: 'AMZN', name: 'Amazon', sector: '경기소비재', themes: ['빅테크', '클라우드·SaaS', '플랫폼·미디어'] },
  { ticker: 'META', name: 'Meta Platforms', sector: '커뮤니케이션', themes: ['빅테크', '플랫폼·미디어'] },
  { ticker: 'NVDA', name: 'NVIDIA', sector: '기술', themes: ['빅테크', 'AI·반도체'] },
  { ticker: 'AVGO', name: 'Broadcom', sector: '기술', themes: ['빅테크', 'AI·반도체'] },
  { ticker: 'TSLA', name: 'Tesla', sector: '경기소비재', themes: ['빅테크', '전기차·자율주행'] },
  // ── AI·반도체 ──
  { ticker: 'AMD', name: 'AMD', sector: '기술', themes: ['AI·반도체'] },
  { ticker: 'TSM', name: 'TSMC', sector: '기술', themes: ['AI·반도체'] },
  { ticker: 'MU', name: 'Micron', sector: '기술', themes: ['AI·반도체'] },
  { ticker: 'QCOM', name: 'Qualcomm', sector: '기술', themes: ['AI·반도체'] },
  { ticker: 'TXN', name: 'Texas Instruments', sector: '기술', themes: ['AI·반도체'] },
  { ticker: 'ARM', name: 'Arm Holdings', sector: '기술', themes: ['AI·반도체'] },
  { ticker: 'MRVL', name: 'Marvell Technology', sector: '기술', themes: ['AI·반도체'] },
  { ticker: 'INTC', name: 'Intel', sector: '기술', themes: ['AI·반도체'] },
  { ticker: 'ADI', name: 'Analog Devices', sector: '기술', themes: ['AI·반도체'] },
  { ticker: 'NXPI', name: 'NXP Semiconductors', sector: '기술', themes: ['AI·반도체', '전기차·자율주행'] },
  { ticker: 'SMCI', name: 'Super Micro Computer', sector: '기술', themes: ['AI·반도체', '데이터·인프라'] },
  { ticker: 'DELL', name: 'Dell Technologies', sector: '기술', themes: ['AI·반도체', '데이터·인프라'] },
  { ticker: 'ANET', name: 'Arista Networks', sector: '기술', themes: ['AI·반도체', '데이터·인프라'] },
  { ticker: 'VRT', name: 'Vertiv Holdings', sector: '산업재', themes: ['데이터·인프라', 'AI·반도체'] },
  // ── 반도체 장비·설계 ──
  { ticker: 'ASML', name: 'ASML', sector: '기술', themes: ['반도체장비'] },
  { ticker: 'AMAT', name: 'Applied Materials', sector: '기술', themes: ['반도체장비'] },
  { ticker: 'LRCX', name: 'Lam Research', sector: '기술', themes: ['반도체장비'] },
  { ticker: 'KLAC', name: 'KLA', sector: '기술', themes: ['반도체장비'] },
  { ticker: 'SNPS', name: 'Synopsys', sector: '기술', themes: ['반도체장비', '클라우드·SaaS'] },
  { ticker: 'CDNS', name: 'Cadence Design', sector: '기술', themes: ['반도체장비', '클라우드·SaaS'] },
  { ticker: 'TER', name: 'Teradyne', sector: '기술', themes: ['반도체장비'] },
  // ── 클라우드·SaaS ──
  { ticker: 'ORCL', name: 'Oracle', sector: '기술', themes: ['클라우드·SaaS', '데이터·인프라'] },
  { ticker: 'CRM', name: 'Salesforce', sector: '기술', themes: ['클라우드·SaaS'] },
  { ticker: 'ADBE', name: 'Adobe', sector: '기술', themes: ['클라우드·SaaS'] },
  { ticker: 'NOW', name: 'ServiceNow', sector: '기술', themes: ['클라우드·SaaS'] },
  { ticker: 'INTU', name: 'Intuit', sector: '기술', themes: ['클라우드·SaaS'] },
  { ticker: 'SAP', name: 'SAP', sector: '기술', themes: ['클라우드·SaaS'] },
  { ticker: 'IBM', name: 'IBM', sector: '기술', themes: ['클라우드·SaaS', '양자컴퓨터'] },
  { ticker: 'WDAY', name: 'Workday', sector: '기술', themes: ['클라우드·SaaS'] },
  { ticker: 'TEAM', name: 'Atlassian', sector: '기술', themes: ['클라우드·SaaS'] },
  { ticker: 'SHOP', name: 'Shopify', sector: '경기소비재', themes: ['클라우드·SaaS', '플랫폼·미디어'] },
  // ── 데이터·AI 소프트웨어 ──
  { ticker: 'PLTR', name: 'Palantir', sector: '기술', themes: ['데이터·인프라', 'AI·반도체'] },
  { ticker: 'SNOW', name: 'Snowflake', sector: '기술', themes: ['데이터·인프라', '클라우드·SaaS'] },
  { ticker: 'MDB', name: 'MongoDB', sector: '기술', themes: ['데이터·인프라', '클라우드·SaaS'] },
  { ticker: 'DDOG', name: 'Datadog', sector: '기술', themes: ['데이터·인프라', '클라우드·SaaS'] },
  { ticker: 'NET', name: 'Cloudflare', sector: '기술', themes: ['데이터·인프라', '사이버보안'] },
  // ── 사이버보안 ──
  { ticker: 'CRWD', name: 'CrowdStrike', sector: '기술', themes: ['사이버보안'] },
  { ticker: 'PANW', name: 'Palo Alto Networks', sector: '기술', themes: ['사이버보안'] },
  { ticker: 'FTNT', name: 'Fortinet', sector: '기술', themes: ['사이버보안'] },
  { ticker: 'ZS', name: 'Zscaler', sector: '기술', themes: ['사이버보안'] },
  { ticker: 'OKTA', name: 'Okta', sector: '기술', themes: ['사이버보안'] },
  // ── 양자컴퓨터 ──
  { ticker: 'IONQ', name: 'IonQ', sector: '기술', themes: ['양자컴퓨터'] },
  { ticker: 'RGTI', name: 'Rigetti Computing', sector: '기술', themes: ['양자컴퓨터'] },
  { ticker: 'QBTS', name: 'D-Wave Quantum', sector: '기술', themes: ['양자컴퓨터'] },
  // ── 핀테크·결제 ──
  { ticker: 'V', name: 'Visa', sector: '금융', themes: ['핀테크·결제'] },
  { ticker: 'MA', name: 'Mastercard', sector: '금융', themes: ['핀테크·결제'] },
  { ticker: 'AXP', name: 'American Express', sector: '금융', themes: ['핀테크·결제', '금융·보험'] },
  { ticker: 'PYPL', name: 'PayPal', sector: '금융', themes: ['핀테크·결제'] },
  { ticker: 'COIN', name: 'Coinbase', sector: '금융', themes: ['핀테크·결제'] },
  { ticker: 'HOOD', name: 'Robinhood', sector: '금융', themes: ['핀테크·결제'] },
  { ticker: 'FI', name: 'Fiserv', sector: '금융', themes: ['핀테크·결제'] },
  // ── 금융·보험 (버핏 선호) ──
  { ticker: 'BRK-B', name: 'Berkshire Hathaway', sector: '금융', themes: ['금융·보험'] },
  { ticker: 'JPM', name: 'JPMorgan Chase', sector: '금융', themes: ['금융·보험'] },
  { ticker: 'BAC', name: 'Bank of America', sector: '금융', themes: ['금융·보험'] },
  { ticker: 'GS', name: 'Goldman Sachs', sector: '금융', themes: ['금융·보험'] },
  { ticker: 'MS', name: 'Morgan Stanley', sector: '금융', themes: ['금융·보험'] },
  { ticker: 'BLK', name: 'BlackRock', sector: '금융', themes: ['금융·보험'] },
  { ticker: 'SPGI', name: 'S&P Global', sector: '금융', themes: ['금융·보험'] },
  { ticker: 'PGR', name: 'Progressive', sector: '금융', themes: ['금융·보험'] },
  // ── 비만치료제·제약 ──
  { ticker: 'LLY', name: 'Eli Lilly', sector: '헬스케어', themes: ['비만치료제', '바이오·제약'] },
  { ticker: 'NVO', name: 'Novo Nordisk', sector: '헬스케어', themes: ['비만치료제', '바이오·제약'] },
  { ticker: 'VKTX', name: 'Viking Therapeutics', sector: '헬스케어', themes: ['비만치료제', '바이오·제약'] },
  { ticker: 'ABBV', name: 'AbbVie', sector: '헬스케어', themes: ['바이오·제약'] },
  { ticker: 'MRK', name: 'Merck', sector: '헬스케어', themes: ['바이오·제약'] },
  { ticker: 'PFE', name: 'Pfizer', sector: '헬스케어', themes: ['바이오·제약'] },
  { ticker: 'JNJ', name: 'Johnson & Johnson', sector: '헬스케어', themes: ['바이오·제약'] },
  { ticker: 'AMGN', name: 'Amgen', sector: '헬스케어', themes: ['바이오·제약'] },
  { ticker: 'VRTX', name: 'Vertex Pharmaceuticals', sector: '헬스케어', themes: ['바이오·제약'] },
  { ticker: 'REGN', name: 'Regeneron', sector: '헬스케어', themes: ['바이오·제약'] },
  { ticker: 'GILD', name: 'Gilead Sciences', sector: '헬스케어', themes: ['바이오·제약'] },
  { ticker: 'UNH', name: 'UnitedHealth', sector: '헬스케어', themes: ['금융·보험'] },
  { ticker: 'ISRG', name: 'Intuitive Surgical', sector: '헬스케어', themes: ['바이오·제약'] },
  // ── 소비 브랜드 ──
  { ticker: 'COST', name: 'Costco', sector: '필수소비재', themes: ['소비브랜드'] },
  { ticker: 'WMT', name: 'Walmart', sector: '필수소비재', themes: ['소비브랜드'] },
  { ticker: 'PG', name: 'Procter & Gamble', sector: '필수소비재', themes: ['소비브랜드'] },
  { ticker: 'KO', name: 'Coca-Cola', sector: '필수소비재', themes: ['소비브랜드'] },
  { ticker: 'PEP', name: 'PepsiCo', sector: '필수소비재', themes: ['소비브랜드'] },
  { ticker: 'PM', name: 'Philip Morris', sector: '필수소비재', themes: ['소비브랜드'] },
  { ticker: 'MCD', name: "McDonald's", sector: '경기소비재', themes: ['소비브랜드'] },
  { ticker: 'SBUX', name: 'Starbucks', sector: '경기소비재', themes: ['소비브랜드'] },
  { ticker: 'NKE', name: 'Nike', sector: '경기소비재', themes: ['소비브랜드'] },
  { ticker: 'LULU', name: 'Lululemon', sector: '경기소비재', themes: ['소비브랜드'] },
  { ticker: 'CMG', name: 'Chipotle', sector: '경기소비재', themes: ['소비브랜드'] },
  { ticker: 'HD', name: 'Home Depot', sector: '경기소비재', themes: ['소비브랜드'] },
  // ── 플랫폼·미디어 ──
  { ticker: 'NFLX', name: 'Netflix', sector: '커뮤니케이션', themes: ['플랫폼·미디어'] },
  { ticker: 'DIS', name: 'Disney', sector: '커뮤니케이션', themes: ['플랫폼·미디어'] },
  { ticker: 'SPOT', name: 'Spotify', sector: '커뮤니케이션', themes: ['플랫폼·미디어'] },
  { ticker: 'UBER', name: 'Uber', sector: '산업재', themes: ['플랫폼·미디어', '전기차·자율주행'] },
  { ticker: 'ABNB', name: 'Airbnb', sector: '경기소비재', themes: ['플랫폼·미디어'] },
  { ticker: 'BKNG', name: 'Booking Holdings', sector: '경기소비재', themes: ['플랫폼·미디어'] },
  // ── 전기차·자율주행 ──
  { ticker: 'RIVN', name: 'Rivian', sector: '경기소비재', themes: ['전기차·자율주행'] },
  { ticker: 'LCID', name: 'Lucid Group', sector: '경기소비재', themes: ['전기차·자율주행'] },
  { ticker: 'GM', name: 'General Motors', sector: '경기소비재', themes: ['전기차·자율주행'] },
  { ticker: 'F', name: 'Ford Motor', sector: '경기소비재', themes: ['전기차·자율주행'] },
  { ticker: 'MBLY', name: 'Mobileye', sector: '기술', themes: ['전기차·자율주행', 'AI·반도체'] },
  // ── 우주항공·방산 ──
  { ticker: 'GE', name: 'GE Aerospace', sector: '산업재', themes: ['우주항공·방산'] },
  { ticker: 'RTX', name: 'RTX', sector: '산업재', themes: ['우주항공·방산'] },
  { ticker: 'LMT', name: 'Lockheed Martin', sector: '산업재', themes: ['우주항공·방산'] },
  { ticker: 'NOC', name: 'Northrop Grumman', sector: '산업재', themes: ['우주항공·방산'] },
  { ticker: 'BA', name: 'Boeing', sector: '산업재', themes: ['우주항공·방산'] },
  { ticker: 'RKLB', name: 'Rocket Lab', sector: '산업재', themes: ['우주항공·방산'] },
  { ticker: 'AXON', name: 'Axon Enterprise', sector: '산업재', themes: ['우주항공·방산'] },
  // ── 원자력·전력 (AI 데이터센터 수혜) ──
  { ticker: 'VST', name: 'Vistra', sector: '유틸리티', themes: ['원자력·전력', '데이터·인프라'] },
  { ticker: 'CEG', name: 'Constellation Energy', sector: '유틸리티', themes: ['원자력·전력', '데이터·인프라'] },
  { ticker: 'NEE', name: 'NextEra Energy', sector: '유틸리티', themes: ['원자력·전력'] },
  { ticker: 'SMR', name: 'NuScale Power', sector: '유틸리티', themes: ['원자력·전력'] },
  { ticker: 'OKLO', name: 'Oklo', sector: '유틸리티', themes: ['원자력·전력'] },
  { ticker: 'CCJ', name: 'Cameco', sector: '에너지', themes: ['원자력·전력', '에너지·원자재'] },
  { ticker: 'ETN', name: 'Eaton', sector: '산업재', themes: ['원자력·전력', '데이터·인프라'] },
  // ── 산업재·에너지 ──
  { ticker: 'CAT', name: 'Caterpillar', sector: '산업재', themes: ['에너지·원자재'] },
  { ticker: 'DE', name: 'Deere', sector: '산업재', themes: ['에너지·원자재'] },
  { ticker: 'XOM', name: 'ExxonMobil', sector: '에너지', themes: ['에너지·원자재'] },
  { ticker: 'CVX', name: 'Chevron', sector: '에너지', themes: ['에너지·원자재'] },
  { ticker: 'COP', name: 'ConocoPhillips', sector: '에너지', themes: ['에너지·원자재'] },
  { ticker: 'LIN', name: 'Linde', sector: '소재', themes: ['에너지·원자재'] },
  { ticker: 'NEM', name: 'Newmont', sector: '소재', themes: ['에너지·원자재'] },
  // ── 부동산 (데이터센터·통신 리츠 = AI 인프라 수혜) ──
  { ticker: 'EQIX', name: 'Equinix', sector: '부동산', themes: ['데이터·인프라'] },
  { ticker: 'DLR', name: 'Digital Realty', sector: '부동산', themes: ['데이터·인프라'] },
  { ticker: 'AMT', name: 'American Tower', sector: '부동산', themes: ['데이터·인프라'] },
];

export interface UsScanRow {
  ticker: string;
  name: string;
  sector: string;
  themes: string[];
  price: number | null;
  marketCap: number | null;   // USD
  /** 큐레이션 유니버스에 없는 종목(검색으로 들어온 것) */
  adhoc: boolean;
  score: GrowthScore;
}

const pctOf = (v: number | null, dp = 1): number | null =>
  v != null ? Math.round(v * Math.pow(10, dp + 2)) / Math.pow(10, dp) : null;

function scale(v: number | null, lo: number, hi: number, max: number): number {
  if (v == null) return 0;
  if (v <= lo) return 0;
  if (v >= hi) return max;
  return Math.round(((v - lo) / (hi - lo)) * max * 10) / 10;
}

/** Yahoo quoteSummary → 한국과 동일한 GrowthScore 형태 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scoreUsGrowth(d: any): GrowthScore {
  const fd = d.financialData ?? {};
  const ks = d.defaultKeyStatistics ?? {};
  const sd = d.summaryDetail ?? {};

  const revYoY = pctOf(yfRaw(fd, 'revenueGrowth', 'raw'));            // TTM YoY %
  const opYoY = pctOf(yfRaw(fd, 'earningsGrowth', 'raw'));            // 이익 성장 YoY %
  const roe = pctOf(yfRaw(fd, 'returnOnEquity', 'raw'));
  const opMargin = pctOf(yfRaw(fd, 'operatingMargins', 'raw'));
  const profitMargin = pctOf(yfRaw(fd, 'profitMargins', 'raw'));
  const fcf = yfRaw(fd, 'freeCashflow', 'raw');
  const debtToEquity = yfRaw(fd, 'debtToEquity', 'raw');              // 이미 % 스케일
  const trailingRaw = yfRaw(ks, 'trailingPE', 'raw') ?? yfRaw(sd, 'trailingPE', 'raw');
  const forwardRaw = yfRaw(ks, 'forwardPE', 'raw') ?? yfRaw(sd, 'forwardPE', 'raw');
  const trailingPer = trailingRaw != null && trailingRaw > 0 ? Math.round(trailingRaw * 10) / 10 : null;
  const forwardPer = forwardRaw != null && forwardRaw > 0 ? Math.round(forwardRaw * 10) / 10 : null;
  const pegRaw = yfRaw(ks, 'pegRatio', 'raw');
  const divYield = pctOf(yfRaw(sd, 'dividendYield', 'raw'));

  // 포워드 EPS 성장률(%) = trailing/forward - 1 (같은 주가라 PER 비율이 곧 EPS 비율)
  const cEpsGrowth =
    trailingPer != null && forwardPer != null && forwardPer > 0
      ? Math.max(-300, Math.min(300, Math.round((trailingPer / forwardPer - 1) * 1000) / 10))
      : null;
  // PEG: Yahoo 제공값 우선(5년 성장 기반), 없으면 fwdPER ÷ 포워드 EPS 성장률.
  // 한국과 동일 원칙 — 이익 적자(=trailingPE 없음)면 계산하지 않는다.
  const peg =
    pegRaw != null && pegRaw > 0
      ? Math.round(pegRaw * 100) / 100
      : forwardPer != null && cEpsGrowth != null && cEpsGrowth > 0 && trailingPer != null
        ? Math.round((forwardPer / cEpsGrowth) * 100) / 100
        : null;

  const warnings: string[] = [];

  /* 1) 확정 성장 35 — TTM 매출 15 + 이익 12 + (다개년 시계열 없음 → 지속성 보너스 대신 양쪽 동반 성장 8) */
  let growth = scale(revYoY, 0, 20, 15) + scale(opYoY, 0, 25, 12);
  if (revYoY != null && opYoY != null && revYoY > 0 && opYoY > 0) growth += 8;
  growth = Math.min(35, Math.round(growth * 10) / 10);

  /* 2) 미래 기대 30 — 포워드 EPS 성장 20 + 포워드PER<트레일링 10 */
  const hasConsensus = forwardPer != null;
  let outlook = 0;
  if (hasConsensus) {
    outlook = scale(cEpsGrowth, 0, 30, 20);
    if (forwardPer != null && trailingPer != null && forwardPer < trailingPer) outlook += 10;
  } else {
    warnings.push('포워드 PER 없음 — 미래 기대 점수 제외');
  }
  outlook = Math.min(30, Math.round(outlook * 10) / 10);

  /* 3) 수익성 15 — ROE 8 + 영업이익률 7 (미국 대형주 기준 상향: 버핏 15% 룰) */
  const quality = Math.min(15, Math.round((scale(roe, 0, 20, 8) + scale(opMargin, 5, 25, 7)) * 10) / 10);

  /* 4) 밸류에이션·안정 20 — PEG 12 + FCF 플러스 4 + 부채 4 */
  let valuation = 0;
  if (peg != null) valuation += peg < 0.8 ? 12 : peg < 1.2 ? 9 : peg < 1.8 ? 6 : peg < 2.5 ? 3 : 0;
  else if (trailingPer == null) warnings.push('이익 적자 — PER·PEG 평가 불가');
  if (fcf != null && fcf > 0) valuation += 4;
  if (debtToEquity != null && debtToEquity < 150) valuation += debtToEquity < 80 ? 4 : 2;
  valuation = Math.min(20, valuation);

  const badges: string[] = [];
  if (revYoY != null && opYoY != null && revYoY >= 20 && opYoY >= 20) badges.push('고성장');
  if (cEpsGrowth != null && cEpsGrowth >= 25) badges.push('기대주');
  if (trailingPer == null && forwardPer != null) badges.push('턴어라운드');
  if (peg != null && peg < 1 && revYoY != null && revYoY > 0) badges.push('저평가성장');

  /* 버핏 체크 — 미국 기준(첨부 문서 "미국주식용 예시"): ROE 15↑·영업이익률 15↑·FCF+·부채 안정·매출 성장 */
  const chk = (label: string, pass: boolean | null, note: string) => ({ label, pass, note });
  const checks = [
    chk('ROE 15% 이상', roe != null ? roe >= 15 : null, roe != null ? `${roe.toFixed(1)}%` : '-'),
    chk('영업이익률 15% 이상', opMargin != null ? opMargin >= 15 : null, opMargin != null ? `${opMargin.toFixed(1)}%` : '-'),
    chk('FCF 플러스', fcf != null ? fcf > 0 : null, fcf != null ? `$${(fcf / 1e9).toFixed(1)}B` : '-'),
    chk('순이익 흑자', profitMargin != null ? profitMargin > 0 : null, profitMargin != null ? `순이익률 ${profitMargin.toFixed(1)}%` : '-'),
    chk('부채/자본 100% 미만', debtToEquity != null ? debtToEquity < 100 : null, debtToEquity != null ? `${debtToEquity.toFixed(0)}%` : '-'),
    chk('매출 성장', revYoY != null ? revYoY > 0 : null, revYoY != null ? `TTM ${revYoY > 0 ? '+' : ''}${revYoY}%` : '-'),
    chk('주주환원(배당)', divYield != null ? divYield > 0 : null, divYield != null && divYield > 0 ? `배당수익률 ${divYield.toFixed(2)}%` : '배당 없음'),
  ];
  const buffett = { pass: checks.filter((c) => c.pass === true).length, total: checks.length, checks };

  const total = Math.min(100, Math.round((growth + outlook + quality + valuation) * 10) / 10);

  const strengths: string[] = [];
  if (cEpsGrowth != null && cEpsGrowth >= 25) strengths.push(`포워드 EPS +${cEpsGrowth}% — 애널리스트 추정 이익이 크게 는다`);
  else if (revYoY != null && revYoY >= 20 && opYoY != null && opYoY >= 20) strengths.push(`매출 +${revYoY}%·이익 +${opYoY}% 동반 고성장`);
  else if (peg != null && peg < 1) strengths.push(`PEG ${peg} — 성장 대비 가격이 싸다`);
  else if (roe != null && roe >= 20 && fcf != null && fcf > 0) strengths.push(`ROE ${roe.toFixed(0)}% + FCF 흑자 — 버핏식 현금창출 기업`);
  else if (opMargin != null && opMargin >= 25) strengths.push(`영업이익률 ${opMargin.toFixed(0)}% — 해자(가격 결정력) 신호`);
  else if (revYoY != null && revYoY > 0) strengths.push(`매출 +${revYoY}% 성장 지속`);
  const cautions: string[] = [];
  if (trailingPer == null) cautions.push('이익 적자 — "미래만 있는" 유형인지 확인');
  else if (peg != null && peg >= 2.5) cautions.push(`PEG ${peg} — 성장을 감안해도 비싸다`);
  else if (trailingPer != null && trailingPer >= 60) cautions.push(`PER ${trailingPer} — 기대 선반영 큼, 실적 미스에 취약`);
  else if (debtToEquity != null && debtToEquity >= 150) cautions.push(`부채/자본 ${debtToEquity.toFixed(0)}% — 금리 상승 취약`);
  else if (fcf != null && fcf <= 0) cautions.push('FCF 마이너스 — 회계이익과 현금의 괴리 확인');
  const comment = [strengths[0], cautions[0]].filter(Boolean).join('. 다만 ') || '뚜렷한 강점·약점 없음 — 관망';

  return {
    total,
    parts: { growth, outlook, quality, valuation },
    metrics: {
      revYoY, opYoY, revYoYPrev: null,
      cRevGrowth: null, cOpGrowth: null, cEpsGrowth,
      trailingPer, forwardPer, peg, roe,
      opMarginTrend: null, debtRatio: debtToEquity,
    },
    badges, hasConsensus, warnings, buffett, comment,
  };
}

/**
 * 티커 하나를 스캔한다. 큐레이션 유니버스 밖(=검색으로 찾은 종목)도 허용하며,
 * 이 경우 섹터는 Yahoo assetProfile 의 영문 섹터를 한글로 매핑한다.
 */
export async function scanUsTicker(ticker: string): Promise<UsScanRow | null> {
  const meta = US_UNIVERSE.find((u) => u.ticker === ticker);
  const d = await fetchYahoo(ticker);
  if (!d) return null;

  const yfSector = yfStr(d.assetProfile ?? {}, 'sector');
  const sector = meta?.sector ?? (yfSector ? YF_SECTOR_KO[yfSector] ?? yfSector : '기타');

  return {
    ticker,
    name: meta?.name ?? yfStr(d.price ?? {}, 'shortName') ?? yfStr(d.price ?? {}, 'longName') ?? ticker,
    sector,
    themes: meta?.themes ?? [],
    price: yfRaw(d.financialData ?? {}, 'currentPrice', 'raw') ?? yfRaw(d.price ?? {}, 'regularMarketPrice', 'raw'),
    marketCap: yfRaw(d.price ?? {}, 'marketCap', 'raw') ?? yfRaw(d.summaryDetail ?? {}, 'marketCap', 'raw'),
    adhoc: !meta,
    score: scoreUsGrowth(d),
  };
}
