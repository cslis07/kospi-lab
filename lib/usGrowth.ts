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

export interface UsUniverseItem {
  ticker: string;
  name: string;
  sector: string;
}

/* 시총 상위 + 성장 대표주 큐레이션 (~80종목).
 * 동적 S&P500 구성종목 API 는 무료·무키 소스가 불안정해 정적 리스트로 운영한다.
 * 시세·재무는 전부 실시간(Yahoo)이므로 리스트만 가끔 손보면 된다. */
export const US_UNIVERSE: UsUniverseItem[] = [
  // 메가캡 테크
  { ticker: 'AAPL', name: 'Apple', sector: '테크' },
  { ticker: 'MSFT', name: 'Microsoft', sector: '테크' },
  { ticker: 'GOOGL', name: 'Alphabet', sector: '테크' },
  { ticker: 'AMZN', name: 'Amazon', sector: '소비/클라우드' },
  { ticker: 'NVDA', name: 'NVIDIA', sector: '반도체' },
  { ticker: 'META', name: 'Meta Platforms', sector: '테크' },
  { ticker: 'TSLA', name: 'Tesla', sector: '자동차/에너지' },
  { ticker: 'AVGO', name: 'Broadcom', sector: '반도체' },
  // 반도체·AI 인프라
  { ticker: 'AMD', name: 'AMD', sector: '반도체' },
  { ticker: 'QCOM', name: 'Qualcomm', sector: '반도체' },
  { ticker: 'TXN', name: 'Texas Instruments', sector: '반도체' },
  { ticker: 'MU', name: 'Micron', sector: '반도체' },
  { ticker: 'AMAT', name: 'Applied Materials', sector: '반도체장비' },
  { ticker: 'LRCX', name: 'Lam Research', sector: '반도체장비' },
  { ticker: 'KLAC', name: 'KLA', sector: '반도체장비' },
  { ticker: 'ASML', name: 'ASML', sector: '반도체장비' },
  { ticker: 'TSM', name: 'TSMC', sector: '반도체' },
  { ticker: 'ARM', name: 'Arm Holdings', sector: '반도체' },
  { ticker: 'SNPS', name: 'Synopsys', sector: '반도체설계' },
  { ticker: 'CDNS', name: 'Cadence', sector: '반도체설계' },
  // 소프트웨어·클라우드
  { ticker: 'CRM', name: 'Salesforce', sector: '소프트웨어' },
  { ticker: 'ORCL', name: 'Oracle', sector: '소프트웨어' },
  { ticker: 'ADBE', name: 'Adobe', sector: '소프트웨어' },
  { ticker: 'NOW', name: 'ServiceNow', sector: '소프트웨어' },
  { ticker: 'INTU', name: 'Intuit', sector: '소프트웨어' },
  { ticker: 'SAP', name: 'SAP', sector: '소프트웨어' },
  { ticker: 'IBM', name: 'IBM', sector: '소프트웨어' },
  { ticker: 'PLTR', name: 'Palantir', sector: '소프트웨어/AI' },
  { ticker: 'SNOW', name: 'Snowflake', sector: '데이터클라우드' },
  { ticker: 'DDOG', name: 'Datadog', sector: '소프트웨어' },
  { ticker: 'CRWD', name: 'CrowdStrike', sector: '보안' },
  { ticker: 'PANW', name: 'Palo Alto Networks', sector: '보안' },
  { ticker: 'FTNT', name: 'Fortinet', sector: '보안' },
  { ticker: 'ZS', name: 'Zscaler', sector: '보안' },
  { ticker: 'NET', name: 'Cloudflare', sector: '클라우드' },
  { ticker: 'MDB', name: 'MongoDB', sector: '데이터베이스' },
  { ticker: 'SHOP', name: 'Shopify', sector: '이커머스' },
  { ticker: 'UBER', name: 'Uber', sector: '플랫폼' },
  { ticker: 'ABNB', name: 'Airbnb', sector: '플랫폼' },
  { ticker: 'BKNG', name: 'Booking Holdings', sector: '여행' },
  { ticker: 'SPOT', name: 'Spotify', sector: '미디어' },
  { ticker: 'NFLX', name: 'Netflix', sector: '미디어' },
  { ticker: 'DIS', name: 'Disney', sector: '미디어' },
  // 결제·핀테크 (버핏 선호 업종)
  { ticker: 'V', name: 'Visa', sector: '결제' },
  { ticker: 'MA', name: 'Mastercard', sector: '결제' },
  { ticker: 'AXP', name: 'American Express', sector: '결제/금융' },
  { ticker: 'PYPL', name: 'PayPal', sector: '결제' },
  { ticker: 'COIN', name: 'Coinbase', sector: '크립토' },
  { ticker: 'HOOD', name: 'Robinhood', sector: '증권' },
  // 금융·보험
  { ticker: 'BRK-B', name: 'Berkshire Hathaway', sector: '보험/지주' },
  { ticker: 'JPM', name: 'JPMorgan', sector: '금융' },
  { ticker: 'GS', name: 'Goldman Sachs', sector: '금융' },
  { ticker: 'BLK', name: 'BlackRock', sector: '자산운용' },
  { ticker: 'SPGI', name: 'S&P Global', sector: '금융정보' },
  // 헬스케어·제약
  { ticker: 'LLY', name: 'Eli Lilly', sector: '제약' },
  { ticker: 'NVO', name: 'Novo Nordisk', sector: '제약' },
  { ticker: 'UNH', name: 'UnitedHealth', sector: '헬스케어' },
  { ticker: 'JNJ', name: 'Johnson & Johnson', sector: '헬스케어' },
  { ticker: 'ABBV', name: 'AbbVie', sector: '제약' },
  { ticker: 'MRK', name: 'Merck', sector: '제약' },
  { ticker: 'ISRG', name: 'Intuitive Surgical', sector: '의료기기' },
  { ticker: 'VRTX', name: 'Vertex Pharma', sector: '바이오' },
  { ticker: 'REGN', name: 'Regeneron', sector: '바이오' },
  // 소비재 (버핏 선호 업종)
  { ticker: 'COST', name: 'Costco', sector: '소비재' },
  { ticker: 'WMT', name: 'Walmart', sector: '소비재' },
  { ticker: 'PG', name: 'Procter & Gamble', sector: '소비재' },
  { ticker: 'KO', name: 'Coca-Cola', sector: '소비재' },
  { ticker: 'PEP', name: 'PepsiCo', sector: '소비재' },
  { ticker: 'MCD', name: "McDonald's", sector: '외식' },
  { ticker: 'SBUX', name: 'Starbucks', sector: '외식' },
  { ticker: 'NKE', name: 'Nike', sector: '소비재' },
  { ticker: 'LULU', name: 'Lululemon', sector: '소비재' },
  { ticker: 'CMG', name: 'Chipotle', sector: '외식' },
  // 산업·에너지·방산
  { ticker: 'CAT', name: 'Caterpillar', sector: '산업재' },
  { ticker: 'DE', name: 'Deere', sector: '산업재' },
  { ticker: 'GE', name: 'GE Aerospace', sector: '항공우주' },
  { ticker: 'RTX', name: 'RTX', sector: '방산' },
  { ticker: 'LMT', name: 'Lockheed Martin', sector: '방산' },
  { ticker: 'XOM', name: 'ExxonMobil', sector: '에너지' },
  { ticker: 'CVX', name: 'Chevron', sector: '에너지' },
  { ticker: 'VST', name: 'Vistra', sector: '전력/AI수혜' },
  { ticker: 'CEG', name: 'Constellation Energy', sector: '전력/AI수혜' },
];

export interface UsScanRow {
  ticker: string;
  name: string;
  sector: string;
  price: number | null;
  marketCap: number | null;   // USD
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

export async function scanUsTicker(ticker: string): Promise<UsScanRow | null> {
  const meta = US_UNIVERSE.find((u) => u.ticker === ticker);
  if (!meta) return null;
  const d = await fetchYahoo(ticker);
  if (!d) return null;
  return {
    ticker,
    name: yfStr(d.price ?? {}, 'shortName') ?? meta.name,
    sector: meta.sector,
    price: yfRaw(d.financialData ?? {}, 'currentPrice', 'raw') ?? yfRaw(d.price ?? {}, 'regularMarketPrice', 'raw'),
    marketCap: yfRaw(d.price ?? {}, 'marketCap', 'raw') ?? yfRaw(d.summaryDetail ?? {}, 'marketCap', 'raw'),
    score: scoreUsGrowth(d),
  };
}
