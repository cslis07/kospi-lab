/**
 * 시장 참고자료 — 분석에 "반드시 참고"할 하향식(top-down) 오버레이.
 *  1) 메릴린치 CIO 업종별 투자 의견 (2026.6.29 보고서)
 *  2) 반드시 봐야 하는 필수 경제 지표 체크리스트
 *
 * 종목은 이름 키워드로 GICS 11업종에 매핑하고, 업종의 CIO 스탠스를 판정에 소폭 반영.
 */

export type SectorStance = 'overweight' | 'neutral' | 'underweight';
export type Gics =
  | '산업재' | '경기소비재' | '필수소비재' | '금융' | '정보기술'
  | '커뮤니케이션서비스' | '헬스케어' | '소재' | '에너지' | '유틸리티';

/* ── 메릴린치 CIO 업종 의견 (출처: 메릴린치 CIO 자본시장 전망 보고서 2026.6.29) ── */
export const MERRILL_CIO: {
  source: string; date: string;
  stance: Record<Gics, SectorStance>;
} = {
  source: '메릴린치 CIO 자본시장 전망 보고서',
  date: '2026-06-29',
  stance: {
    산업재:           'overweight',  // 비중 확대
    경기소비재:       'overweight',  // 비중 확대
    금융:             'overweight',  // 비중 확대
    정보기술:         'neutral',     // 중립
    에너지:           'neutral',
    소재:             'neutral',
    유틸리티:         'neutral',
    헬스케어:         'neutral',
    커뮤니케이션서비스: 'neutral',
    필수소비재:       'neutral',     // 보고서 이미지에 미표기 → 중립 처리
  },
};

export const STANCE_LABEL: Record<SectorStance, { ko: string; tone: 'up' | 'down' | 'neutral' }> = {
  overweight:  { ko: '비중 확대', tone: 'up' },
  neutral:     { ko: '중립',       tone: 'neutral' },
  underweight: { ko: '비중 축소', tone: 'down' },
};

/* ── 종목 → 업종 (주요 대형주 정밀 매핑) ─────────────── */
const TICKER_SECTOR: Record<string, Gics> = {
  '005930': '정보기술', '000660': '정보기술', '009150': '정보기술', '011070': '정보기술', '000990': '정보기술',
  '005380': '경기소비재', '000270': '경기소비재', '012330': '경기소비재', '161390': '경기소비재',
  '023530': '경기소비재', '139480': '경기소비재', '008770': '경기소비재', '383220': '경기소비재',
  '105560': '금융', '055550': '금융', '086790': '금융', '316140': '금융', '032830': '금융',
  '323410': '금융', '138040': '금융', '029780': '금융', '006800': '금융', '005830': '금융',
  '035420': '커뮤니케이션서비스', '035720': '커뮤니케이션서비스', '017670': '커뮤니케이션서비스',
  '030200': '커뮤니케이션서비스', '032640': '커뮤니케이션서비스', '036570': '커뮤니케이션서비스',
  '251270': '커뮤니케이션서비스', '259960': '커뮤니케이션서비스', '352820': '커뮤니케이션서비스', '293490': '커뮤니케이션서비스',
  '207940': '헬스케어', '068270': '헬스케어', '000100': '헬스케어', '326030': '헬스케어',
  '128940': '헬스케어', '196170': '헬스케어', '302440': '헬스케어',
  '051910': '소재', '005490': '소재', '003670': '소재', '011170': '소재', '010130': '소재', '004020': '소재',
  '006400': '산업재', '373220': '산업재', '012450': '산업재', '034020': '산업재', '329180': '산업재',
  '042660': '산업재', '009540': '산업재', '000720': '산업재', '028260': '산업재', '047810': '산업재', '079550': '산업재',
  '015760': '유틸리티', '036460': '유틸리티', '051600': '유틸리티',
  '010950': '에너지', '096770': '에너지', '078930': '에너지', '267250': '에너지',
  '033780': '필수소비재', '097950': '필수소비재', '004370': '필수소비재', '051900': '필수소비재',
  '090430': '필수소비재', '280360': '필수소비재', '271560': '필수소비재',
};

/* 이름 키워드 폴백 — 앞쪽일수록 우선 */
const NAME_RULES: { kw: RegExp; sector: Gics }[] = [
  { kw: /은행|금융|증권|생명|화재|손해보험|캐피탈|카드|자산운용|저축|지주.*금융|금융지주|메리츠/, sector: '금융' },
  { kw: /바이오|제약|파마|생명과학|헬스|의료|진단|팜|셀트리온|메디|백신/, sector: '헬스케어' },
  { kw: /통신|텔레콤|게임|엔터|미디어|방송|콘텐츠|웹툰|인터넷|카카오|네이버|하이브|SM|JYP|넷마블|크래프톤|엔씨/, sector: '커뮤니케이션서비스' },
  { kw: /전력|가스공사|한전|유틸|수도|열병합/, sector: '유틸리티' },
  { kw: /정유|석유|오일|에너지(?!솔루션)|가스(?!공사)|SK이노/, sector: '에너지' },
  { kw: /화학|케미칼|소재|철강|금속|시멘트|유리|비철|아연|구리|알루미늄|포스코|화섬|정밀화학/, sector: '소재' },
  { kw: /건설|중공업|조선|기계|항공|방산|에어로|전력기기|엔지니어링|플랜트|인프라|해운|물류|운송|일렉트릭|에너빌리티|배터리|2차전지|에너지솔루션|SDI/, sector: '산업재' },
  { kw: /자동차|모비스|타이어|부품|유통|백화점|면세|호텔|여행|의류|패션|화장품|뷰티|레저|엔터테인먼트(?!먼트)|리테일|쇼핑|이마트/, sector: '경기소비재' },
  { kw: /음식료|식품|제당|제분|라면|음료|주류|담배|생활건강|생필품|유가공|제과/, sector: '필수소비재' },
  { kw: /반도체|전자|전기(?!차)|디스플레이|IT|소프트웨어|시스템|칩|파운드리|하이닉스|이노텍|전기전자/, sector: '정보기술' },
];

export function resolveSector(ticker: string, name: string): Gics | null {
  if (TICKER_SECTOR[ticker]) return TICKER_SECTOR[ticker];
  for (const r of NAME_RULES) if (r.kw.test(name)) return r.sector;
  return null;
}

export interface CioView {
  sector: Gics; stance: SectorStance; label: string; tone: 'up' | 'down' | 'neutral';
  source: string; date: string;
}
export function cioViewFor(ticker: string, name: string): CioView | null {
  const sector = resolveSector(ticker, name);
  if (!sector) return null;
  const stance = MERRILL_CIO.stance[sector];
  return {
    sector, stance,
    label: STANCE_LABEL[stance].ko, tone: STANCE_LABEL[stance].tone,
    source: MERRILL_CIO.source, date: MERRILL_CIO.date,
  };
}

/* ── 반드시 봐야 하는 필수 경제 지표 ─────────────────── */
export interface MustWatchItem {
  key: string; label: string;
  why: string;              // 왜 봐야 하는지
  liveKey?: 'usdkrw' | 'jpykrw';  // /api/market 라이브 값 매핑
  eventCategory?: 'cpi';    // 캘린더 이벤트 연동
}
export const MUST_WATCH: MustWatchItem[] = [
  { key: 'us_cpi',   label: '미국 물가(CPI)', why: '연준 금리 경로의 핵심. 예상 상회 시 위험자산 조정', eventCategory: 'cpi' },
  { key: 'jpy',      label: '일본 금리·엔화', why: '엔캐리 청산 위험. 엔화 급등 시 글로벌 위험회피', liveKey: 'jpykrw' },
  { key: 'usdkrw',   label: '원-달러 환율',   why: '외국인 수급의 결정 변수. 급등(원화약세) 시 외국인 이탈', liveKey: 'usdkrw' },
  { key: 'semicon',  label: '반도체 수출 실적', why: '한국 수출·코스피 이익의 핵심. 월초 관세청 수출입 동향 확인' },
  { key: 'debt',     label: '가계부채·부동산', why: '내수·금융업 리스크. 한국은행 금융안정보고서 참고' },
];
