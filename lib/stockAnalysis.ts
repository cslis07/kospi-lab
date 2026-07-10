/**
 * 국내주식 분석 엔진 — 코인 분석과 같은 철학(추세 필터 + 수급 확인 + 검증)을
 * 한국 시장 특성(투자자별 수급·외국인 보유율·밸류에이션)에 맞춰 재구성.
 *
 * 핵심 차별점:
 *  - 코인의 롱숏/테이커 → 주식의 "투자자 수급"(개인·외국인·기관 순매수)
 *  - 외국인 보유율 추세 = 스마트머니 방향 (한국 시장의 가장 강한 단일 신호)
 *  - 밸류에이션(ROE·PER)은 방향이 아니라 "안전마진 품질 필터"로만 사용
 *  - 개인 투자자는 공매도가 어려우므로 매수우위/중립/비중축소 3분류
 */
import {
  Candle, TimeframeAnalysis, SRZone, FibLevels,
} from './coinAnalysis';

/* ── 투자자 수급 ─────────────────────────────────────── */
export interface InvestorDay {
  date: string;
  individual: number;   // 개인 순매수 수량
  foreign: number;      // 외국인 순매수 수량
  institution: number;  // 기관 순매수 수량
  foreignHoldRatio: number | null; // 외국인 보유율(%)
  close: number;
}

export interface SupplyDemand {
  foreign5d: number; inst5d: number; indiv5d: number;
  foreign20d: number; inst20d: number;
  foreignStreak: number;   // 외국인 연속 순매수(+)/순매도(-) 일수
  instStreak: number;
  smartMoney5d: number;    // 외국인+기관 5일 합산
  holdRatioNow: number | null;
  holdRatioChange5d: number | null; // 외국인 보유율 5일 변화(%p)
  score: number;           // -100~+100 수급 종합
}

export function analyzeSupply(days: InvestorDay[]): SupplyDemand {
  const d = [...days].sort((a, b) => (a.date < b.date ? -1 : 1)); // 과거→최근
  const n = d.length;
  const last = (k: number, sel: (x: InvestorDay) => number) =>
    d.slice(Math.max(0, n - k)).reduce((s, x) => s + sel(x), 0);

  const foreign5d = last(5, (x) => x.foreign);
  const inst5d = last(5, (x) => x.institution);
  const indiv5d = last(5, (x) => x.individual);
  const foreign20d = last(20, (x) => x.foreign);
  const inst20d = last(20, (x) => x.institution);

  const streak = (sel: (x: InvestorDay) => number) => {
    let s = 0;
    for (let i = n - 1; i >= 0; i--) {
      const v = sel(d[i]);
      if (i === n - 1) { s = v > 0 ? 1 : v < 0 ? -1 : 0; if (s === 0) break; }
      else { if (Math.sign(v) === Math.sign(s) && v !== 0) s += Math.sign(v); else break; }
    }
    return s;
  };

  const holdNow = d[n - 1]?.foreignHoldRatio ?? null;
  const hold5ago = d[Math.max(0, n - 6)]?.foreignHoldRatio ?? null;
  const holdChange = holdNow !== null && hold5ago !== null ? holdNow - hold5ago : null;

  const smartMoney5d = foreign5d + inst5d;
  const foreignStreak = streak((x) => x.foreign);
  const instStreak = streak((x) => x.institution);

  // 수급 점수: 외국인 방향(최대 가중) + 기관 + 연속성 + 보유율 추세
  let score = 0;
  if (foreign5d > 0) score += 20; else if (foreign5d < 0) score -= 20;
  if (inst5d > 0) score += 12; else if (inst5d < 0) score -= 12;
  if (foreignStreak >= 3) score += 12; else if (foreignStreak <= -3) score -= 12;
  if (instStreak >= 3) score += 6; else if (instStreak <= -3) score -= 6;
  if (holdChange !== null) {
    if (holdChange >= 0.1) score += 10; else if (holdChange <= -0.1) score -= 10;
  }
  // 외국인+기관 동반 매수/매도 = 신뢰도 가산
  if (foreign5d > 0 && inst5d > 0) score += 8;
  else if (foreign5d < 0 && inst5d < 0) score -= 8;

  return {
    foreign5d, inst5d, indiv5d, foreign20d, inst20d,
    foreignStreak, instStreak, smartMoney5d,
    holdRatioNow: holdNow, holdRatioChange5d: holdChange,
    score: Math.max(-100, Math.min(100, score)),
  };
}

/* ── 밸류에이션 품질 (방향 아님 — 안전마진 필터) ─────── */
export interface FinancialQuality {
  per: number | null; pbr: number | null; roe: number | null;
  debtRatio: number | null; revenueGrowth: number | null;
  netIncomePositive: boolean | null;
  grade: 'A' | 'B' | 'C' | 'D' | null;  // 종합 품질
  notes: string[];
}

export function gradeFinancials(f: {
  per: number | null; pbr: number | null; roe: number | null;
  debtRatio: number | null; revenueGrowth: number | null; netIncomePositive: boolean | null;
}): FinancialQuality {
  const notes: string[] = [];
  let pts = 0, cnt = 0;
  if (f.roe !== null) {
    cnt++;
    if (f.roe >= 15) { pts += 2; notes.push(`ROE ${f.roe.toFixed(1)}% — 우수한 자본효율`); }
    else if (f.roe >= 8) { pts += 1; }
    else if (f.roe < 0) { notes.push(`ROE ${f.roe.toFixed(1)}% — 자본손실 주의`); }
  }
  if (f.per !== null && f.per > 0) {
    cnt++;
    if (f.per <= 12) { pts += 1.5; notes.push(`PER ${f.per.toFixed(1)}배 — 저평가 구간`); }
    else if (f.per <= 25) { pts += 1; }
    else if (f.per > 40) { notes.push(`PER ${f.per.toFixed(1)}배 — 고평가, 실적 뒷받침 필요`); }
  }
  if (f.debtRatio !== null) {
    cnt++;
    if (f.debtRatio <= 100) pts += 1;
    else if (f.debtRatio > 200) { notes.push(`부채비율 ${f.debtRatio.toFixed(0)}% — 재무 부담`); }
  }
  if (f.netIncomePositive === false) notes.push('최근 적자 — 밸류에이션 신뢰도 낮음');
  if (f.revenueGrowth !== null && f.revenueGrowth >= 15) { pts += 0.5; notes.push(`매출성장 ${f.revenueGrowth.toFixed(1)}% — 성장성 양호`); }

  let grade: FinancialQuality['grade'] = null;
  if (cnt >= 2) {
    const ratio = pts / (cnt * 1.5);
    grade = ratio >= 0.7 ? 'A' : ratio >= 0.45 ? 'B' : ratio >= 0.25 ? 'C' : 'D';
  }
  return { ...f, grade, notes };
}

/* ── DART 공시 분류 (호재/악재/중요도) ──────────────── */
export interface Disclosure {
  date: string; type: string; url: string;
  sentiment: 'pos' | 'neg' | 'neu';
  importance: 'high' | 'mid' | 'low';
  label: string; // 사람이 읽을 한 줄 해석
}

// 공시명(report_nm) 키워드 → 의미. 앞쪽일수록 우선.
const DISCLOSURE_RULES: { kw: RegExp; sentiment: 'pos' | 'neg' | 'neu'; importance: 'high' | 'mid' | 'low'; label: string }[] = [
  { kw: /횡령|배임/, sentiment: 'neg', importance: 'high', label: '횡령·배임 발생 — 강한 악재, 거래정지 위험' },
  { kw: /관리종목|상장폐지|불성실공시/, sentiment: 'neg', importance: 'high', label: '관리종목·불성실공시 — 상장 리스크' },
  { kw: /유상증자/, sentiment: 'neg', importance: 'high', label: '유상증자 — 주식수 희석, 단기 수급 부담' },
  { kw: /전환사채|신주인수권부사채|교환사채|CB|BW/, sentiment: 'neg', importance: 'mid', label: '메자닌(CB·BW) 발행 — 잠재적 물량 부담' },
  { kw: /감자/, sentiment: 'neg', importance: 'high', label: '감자 — 자본 축소, 통상 악재' },
  { kw: /자기주식.*취득|자사주.*취득|자기주식취득\s*신탁/, sentiment: 'pos', importance: 'high', label: '자사주 매입 — 주주환원·수급 개선 신호' },
  { kw: /자기주식.*소각|자사주.*소각/, sentiment: 'pos', importance: 'high', label: '자사주 소각 — 주당가치 상승, 강한 호재' },
  { kw: /무상증자/, sentiment: 'pos', importance: 'mid', label: '무상증자 — 유동성·심리 호재' },
  { kw: /단일판매|공급계약|수주/, sentiment: 'pos', importance: 'high', label: '대규모 공급계약·수주 — 실적 기대' },
  { kw: /흑자전환/, sentiment: 'pos', importance: 'high', label: '흑자전환 — 펀더멘털 개선' },
  { kw: /적자전환|적자지속/, sentiment: 'neg', importance: 'high', label: '적자 — 펀더멘털 악화' },
  { kw: /현금.*배당|현물.*배당|배당.*결정/, sentiment: 'pos', importance: 'mid', label: '배당 결정 — 주주환원' },
  { kw: /영업.*실적|잠정실적|매출액.*손익/, sentiment: 'neu', importance: 'high', label: '잠정실적 발표 — 내용 확인 필요' },
  { kw: /최대주주.*변경|경영권/, sentiment: 'neu', importance: 'high', label: '최대주주·경영권 변동 — 중대 이벤트' },
  { kw: /주식분할|액면분할/, sentiment: 'pos', importance: 'mid', label: '액면분할 — 거래 접근성 개선' },
  { kw: /주식병합/, sentiment: 'neu', importance: 'mid', label: '주식병합 — 유통주식수 감소' },
];

export function classifyDisclosure(type: string): { sentiment: 'pos' | 'neg' | 'neu'; importance: 'high' | 'mid' | 'low'; label: string } {
  for (const r of DISCLOSURE_RULES) if (r.kw.test(type)) return { sentiment: r.sentiment, importance: r.importance, label: r.label };
  return { sentiment: 'neu', importance: 'low', label: type };
}

/* ── 정책·테마 신호 감지 (뉴스·공시 제목 스캔) ────────── */
const POLICY_KW: { kw: RegExp; tone: 'pos' | 'neg'; label: string }[] = [
  { kw: /금리\s*인하|기준금리\s*인하|완화적|피벗/, tone: 'pos', label: '금리 인하 기대 — 성장주·유동성 우호' },
  { kw: /금리\s*인상|긴축/, tone: 'neg', label: '금리 인상·긴축 — 밸류에이션 부담' },
  { kw: /보조금|지원책|육성|세제\s*지원|세액공제|감세|국책|정부.*투자|부양책/, tone: 'pos', label: '정부 지원·부양 정책 — 업종 수혜 기대' },
  { kw: /규제\s*강화|과징금|제재|수출\s*규제|관세|반독점|공정위/, tone: 'neg', label: '규제·제재 리스크 — 정책 역풍' },
  { kw: /반도체\s*특별법|K-칩스|칩스법|첨단전략산업/, tone: 'pos', label: '반도체 지원 정책 — 반도체 섹터 수혜' },
  { kw: /밸류업|기업가치\s*제고|주주환원\s*정책/, tone: 'pos', label: '밸류업 정책 — 저PBR·주주환원주 수혜' },
];

export function detectPolicy(titles: string[]): { tone: 'pos' | 'neg'; label: string }[] {
  const found = new Map<string, { tone: 'pos' | 'neg'; label: string }>();
  for (const t of titles) for (const p of POLICY_KW) if (p.kw.test(t)) found.set(p.label, { tone: p.tone, label: p.label });
  return [...found.values()].slice(0, 3);
}

/* ── 시장(코스피) 컨텍스트 ───────────────────────────── */
export interface MarketContext {
  kospiChange: number | null;   // 코스피 등락률
  kospiTrend: 'up' | 'down' | 'flat' | null;
}

/* ── 종합 판단 ───────────────────────────────────────── */
export interface StockVerdict {
  stance: 'buy' | 'neutral' | 'reduce';
  score: number;
  state: string;
  entryOk: boolean;
  entryNote: string;
  entry: number; stop: number; stopPct: number;
  target1: number; target2: number;
  reasons: string[];
  warnings: string[];
  checklist: { label: string; pass: boolean; note: string }[];
}

export interface StockExtras {
  supply?: SupplyDemand | null;
  fin?: FinancialQuality | null;
  market?: MarketContext | null;
  catalyst?: { discPos: number; discNeg: number; policyPos: number; policyNeg: number } | null;
  cio?: { sector: string; stance: 'overweight' | 'neutral' | 'underweight'; label: string } | null;
}

export function buildStockVerdict(
  daily: TimeframeAnalysis,
  candles: Candle[],
  fib: FibLevels | null,
  zones: SRZone[],
  extras: StockExtras = {},
): StockVerdict {
  const price = daily.close;
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  /* 1) 추세 (일봉 EMA 배열 + 시장구조) */
  if (daily.emaAlign === '정배열' && daily.priceVsEma20 === 'above') {
    score += 22; reasons.push('일봉 EMA20>EMA60 정배열 + 가격이 EMA20 위 → 상승 추세');
  } else if (daily.emaAlign === '역배열' && daily.priceVsEma20 === 'below') {
    score -= 22; reasons.push('일봉 EMA20<EMA60 역배열 + 가격이 EMA20 아래 → 하락 추세');
  } else {
    reasons.push('일봉 EMA 혼조 — 추세 불명확');
  }
  if (daily.structure === '상승') { score += 10; reasons.push('고점·저점 동반 상승(HH·HL) 구조'); }
  else if (daily.structure === '하락') { score -= 10; reasons.push('고점·저점 동반 하락(LH·LL) 구조'); }

  // EMA200(장기) 위/아래
  if (daily.ema200 !== null) {
    if (price >= daily.ema200) { score += 6; reasons.push('가격이 200일선 위 — 장기 상승 국면'); }
    else { score -= 6; reasons.push('가격이 200일선 아래 — 장기 하락 국면'); }
  }

  /* 2) 투자자 수급 (한국 시장의 핵심 — 큰 가중) */
  if (extras.supply) {
    const s = extras.supply;
    const w = Math.round(s.score * 0.35); // 수급 점수를 최대 ±35로 반영
    score += w;
    if (s.foreignStreak >= 3) reasons.push(`외국인 ${s.foreignStreak}일 연속 순매수 — 스마트머니 유입`);
    else if (s.foreignStreak <= -3) reasons.push(`외국인 ${Math.abs(s.foreignStreak)}일 연속 순매도 — 스마트머니 이탈`);
    if (s.foreign5d > 0 && s.inst5d > 0) reasons.push('외국인·기관 동반 순매수(5일) — 수급 신뢰도 높음');
    else if (s.foreign5d < 0 && s.inst5d < 0) reasons.push('외국인·기관 동반 순매도(5일) — 수급 이탈');
    if (s.holdRatioChange5d !== null && Math.abs(s.holdRatioChange5d) >= 0.1) {
      reasons.push(`외국인 보유율 5일 ${s.holdRatioChange5d >= 0 ? '+' : ''}${s.holdRatioChange5d.toFixed(2)}%p ${s.holdRatioChange5d >= 0 ? '상승' : '하락'}`);
    }
    // 개인만 매수하고 외국인·기관 이탈 = 전형적 약세 신호
    if (s.indiv5d > 0 && s.foreign5d < 0 && s.inst5d < 0) {
      warnings.push('개인만 순매수, 외국인·기관 이탈 — 개인 물량 떠받치기 주의');
    }
  }

  /* 3) 거래량 */
  if (daily.volumeRatio >= 1.6) {
    score += Math.sign(score || 1) * 6;
    reasons.push(`거래량 평균 대비 ${daily.volumeRatio.toFixed(1)}배 — 관심 급증`);
  } else if (daily.volumeRatio < 0.6) {
    warnings.push(`거래량 평균 대비 ${daily.volumeRatio.toFixed(1)}배 — 거래 부진, 방향성 신뢰 낮음`);
  }

  /* 4) 모멘텀 (RSI·MACD) */
  if (daily.rsi >= 72) { score -= 4; warnings.push(`RSI ${daily.rsi.toFixed(0)} 과열 — 단기 조정 주의`); }
  else if (daily.rsi <= 28) { score += 4; warnings.push(`RSI ${daily.rsi.toFixed(0)} 침체 — 낙폭과대 반등 가능`); }
  if (daily.macd.hist > 0 && daily.macd.histSlope > 0) { score += 5; reasons.push('MACD 히스토그램 양(+)·확장 — 상승 모멘텀'); }
  else if (daily.macd.hist < 0 && daily.macd.histSlope < 0) { score -= 5; reasons.push('MACD 히스토그램 음(-)·확장 — 하락 모멘텀'); }

  /* 5) 52주 위치 (모멘텀 vs 낙폭) */
  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const yearHigh = Math.max(...highs);
  const yearLow = Math.min(...lows);
  const posInRange = yearHigh > yearLow ? (price - yearLow) / (yearHigh - yearLow) : 0.5;
  if (price >= yearHigh * 0.98) { score += 6; reasons.push('52주 신고가 근접 — 강한 모멘텀(신고가는 저항이 없음)'); }
  else if (price <= yearLow * 1.03) { warnings.push('52주 신저가 근접 — 하락 추세, 바닥 확인 전 진입 위험'); }

  /* 6) 밸류에이션 품질 필터 (방향 아님 — 강한 추세에 안전마진 가산) */
  if (extras.fin?.grade) {
    if (extras.fin.grade === 'A' && score > 0) { score += 5; reasons.push('재무 A등급 — 상승에 펀더멘털 뒷받침'); }
    else if (extras.fin.grade === 'D' && score > 0) { warnings.push('재무 D등급 — 상승에 펀더멘털 근거 약함, 단기 테마성 주의'); }
  }

  /* 7) 공시·정책 촉매 (재료 기반 가감) */
  if (extras.catalyst) {
    const cat = extras.catalyst;
    if (cat.discPos > 0) { score += Math.min(10, cat.discPos * 6); reasons.push(`중요 호재성 공시 ${cat.discPos}건(자사주·수주·흑자 등) — 재료 우위`); }
    if (cat.discNeg > 0) { score -= Math.min(12, cat.discNeg * 7); warnings.push(`중요 악재성 공시 ${cat.discNeg}건(증자·CB·감자 등) — 수급 부담 재료`); }
    if (cat.policyPos > 0) { score += Math.min(8, cat.policyPos * 4); reasons.push('정부 정책·테마 수혜 신호 — 섹터 우호 재료'); }
    if (cat.policyNeg > 0) { score -= Math.min(8, cat.policyNeg * 4); warnings.push('정책·규제 역풍 신호 — 정책 리스크'); }
  }

  /* 7-1) 메릴린치 CIO 업종 의견 (하향식 오버레이 — 소폭) */
  if (extras.cio) {
    if (extras.cio.stance === 'overweight') { score += 5; reasons.push(`메릴린치 CIO: ${extras.cio.sector} 비중확대 업종 — 하향식 우호`); }
    else if (extras.cio.stance === 'underweight') { score -= 5; warnings.push(`메릴린치 CIO: ${extras.cio.sector} 비중축소 업종 — 하향식 역풍`); }
    else reasons.push(`메릴린치 CIO: ${extras.cio.sector} 중립 업종`);
  }

  /* 8) 시장(코스피) 동조 */
  if (extras.market?.kospiTrend) {
    if (extras.market.kospiTrend === 'down' && score > 0) warnings.push('코스피 약세 국면 — 개별 강세도 시장 반락에 취약');
    else if (extras.market.kospiTrend === 'up' && score > 0) { score += 3; }
  }

  score = Math.max(-100, Math.min(100, Math.round(score)));

  /* 상태·스탠스 */
  let state: string;
  if (daily.structure === '횡보' && Math.abs(score) < 25) state = '박스권';
  else if (score >= 30) state = '상승 추세';
  else if (score <= -30) state = '하락 추세';
  else state = '방향 탐색(혼조)';

  const stance: StockVerdict['stance'] = score >= 30 ? 'buy' : score <= -25 ? 'reduce' : 'neutral';

  /* 손절·목표 (구조 + ATR) */
  const atr14 = daily.atr;
  const supports = zones.filter((z) => z.kind === 'support').map((z) => z.price);
  const resistances = zones.filter((z) => z.kind === 'resistance').map((z) => z.price);
  // 가격 바로 아래 지지선을 손절 기준으로. 단 너무 멀면 ATR 스톱으로 폴백
  const atrStop = price - atr14 * 2.5;
  const nearSupport = supports.filter((s) => s < price).sort((a, b) => b - a)[0]; // 가장 가까운 하단 지지
  let stop = (nearSupport !== undefined && nearSupport >= atrStop) ? nearSupport * 0.997 : atrStop;
  // 스윙 매매 현실화: 손절 폭 3~15%로 제한
  const stopDist = Math.max(price * 0.03, Math.min(price * 0.15, price - stop));
  stop = price - stopDist;
  const risk = price - stop;
  const target1 = resistances.length ? Math.min(...resistances.filter((r) => r > price)) || price + risk * 1.5 : price + risk * 1.5;
  const target2 = price >= yearHigh * 0.98 ? price + risk * 2.5 : Math.max(yearHigh, price + risk * 2.5);
  const stopPct = price > 0 ? (risk / price) * 100 : 0;

  /* 진입 판정 */
  // 수급은 한국 시장 핵심 신호다. 결측(네이버 수급 조회 실패·신규상장)을 중립으로
  // 취급하면 검증되지 않은 종목이 매수 판정을 통과한다 → 결측은 진입 불가로 본다.
  const strongSupply = !!extras.supply && extras.supply.score >= 0;
  const entryOk = stance === 'buy' && score >= 40 && strongSupply && posInRange < 0.97;
  let entryNote: string;
  if (stance === 'reduce') entryNote = '하락 추세·수급 이탈 — 신규 매수 부적합, 보유 시 비중축소 검토.';
  else if (stance === 'neutral') entryNote = '방향 근거 부족 — 관망. 수급 개선·추세 전환 확인 후 판단.';
  else if (!extras.supply) entryNote = '투자자 수급 데이터 없음 — 한국 시장 핵심 신호가 빠져 진입 판단 불가.';
  else if (extras.supply.score < 0) entryNote = '기술적 매수우위지만 수급(외국인·기관)이 이탈 중 — 수급 개선 확인 후 진입.';
  else if (posInRange >= 0.97) entryNote = '52주 최고가 부근 — 눌림목 대기가 유리.';
  else if (!entryOk) entryNote = '매수우위지만 근거 강도 부족 — 분할·소액 접근.';
  else entryNote = '매수 근거 겹침 확인 — 분할 매수 + 손절 라인 설정 권장.';

  /* 체크리스트 */
  const checklist = [
    { label: '추세(EMA 배열)', pass: daily.emaAlign === '정배열', note: `일봉 EMA ${daily.emaAlign} · ${daily.structure}` },
    { label: '외국인 수급', pass: !!extras.supply && extras.supply.foreign5d > 0, note: extras.supply ? `5일 ${extras.supply.foreign5d >= 0 ? '+' : ''}${extras.supply.foreign5d.toLocaleString()}주` : '-' },
    { label: '기관 수급', pass: !!extras.supply && extras.supply.inst5d > 0, note: extras.supply ? `5일 ${extras.supply.inst5d >= 0 ? '+' : ''}${extras.supply.inst5d.toLocaleString()}주` : '-' },
    { label: '외국인 보유율', pass: !!extras.supply && (extras.supply.holdRatioChange5d ?? 0) >= 0, note: extras.supply?.holdRatioNow !== null && extras.supply?.holdRatioNow !== undefined ? `${extras.supply.holdRatioNow.toFixed(2)}% (${extras.supply.holdRatioChange5d !== null ? `${extras.supply.holdRatioChange5d >= 0 ? '+' : ''}${extras.supply.holdRatioChange5d.toFixed(2)}%p` : '-'})` : '-' },
    { label: '거래량 동반', pass: daily.volumeRatio >= 1.0, note: `평균 대비 ${daily.volumeRatio.toFixed(1)}배` },
    { label: '52주 위치', pass: posInRange >= 0.4 && posInRange < 0.97, note: `하단서 ${(posInRange * 100).toFixed(0)}%` },
    { label: '재무 품질', pass: !!extras.fin?.grade && ['A', 'B'].includes(extras.fin.grade), note: extras.fin?.grade ? `${extras.fin.grade}등급` : '-' },
    { label: '손절 설정', pass: stopPct <= 8, note: `${stopPct.toFixed(1)}% (ATR·구조 기반)` },
  ];

  return {
    stance, score, state, entryOk, entryNote,
    entry: price, stop, stopPct, target1, target2,
    reasons, warnings, checklist,
  };
}
