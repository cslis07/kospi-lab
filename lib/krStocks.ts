// 코스피·코스닥 주요 종목 로컬 리스트 (검색용)
// Yahoo Finance 검색 API를 Vercel에서 호출하면 차단되므로, 클라이언트 로컬 검색 사용
export interface KrStock {
  ticker: string; // Yahoo Finance 형식: 005930.KS / 086520.KQ
  name: string;   // 한국어 종목명
  alt?: string;   // 검색용 별칭 (영문, 약칭 등)
}

export const KR_STOCKS: KrStock[] = [
  // ── KOSPI ───────────────────────────────────────────────────────────────────
  { ticker: '005930.KS', name: '삼성전자',          alt: 'samsung' },
  { ticker: '000660.KS', name: 'SK하이닉스',        alt: 'hynix sk' },
  { ticker: '373220.KS', name: 'LG에너지솔루션',    alt: 'lges lg에너지' },
  { ticker: '207940.KS', name: '삼성바이오로직스',  alt: '삼바' },
  { ticker: '005380.KS', name: '현대차',            alt: '현대자동차 hyundai' },
  { ticker: '000270.KS', name: '기아',              alt: '기아차 kia' },
  { ticker: '051910.KS', name: 'LG화학',            alt: 'lgchem' },
  { ticker: '006400.KS', name: '삼성SDI',           alt: 'sdi' },
  { ticker: '068270.KS', name: '셀트리온',          alt: 'celltrion' },
  { ticker: '105560.KS', name: 'KB금융',            alt: 'kb' },
  { ticker: '055550.KS', name: '신한지주',          alt: '신한 shinhan' },
  { ticker: '035420.KS', name: 'NAVER',             alt: '네이버' },
  { ticker: '028260.KS', name: '삼성물산',          alt: '물산' },
  { ticker: '012330.KS', name: '현대모비스',        alt: '모비스 mobis' },
  { ticker: '086790.KS', name: '하나금융지주',      alt: '하나금융 hana' },
  { ticker: '066570.KS', name: 'LG전자',            alt: 'lge' },
  { ticker: '035720.KS', name: '카카오',            alt: 'kakao' },
  { ticker: '323410.KS', name: '카카오뱅크',        alt: 'kakaobank' },
  { ticker: '010950.KS', name: 'S-Oil',             alt: 's오일 soil' },
  { ticker: '034730.KS', name: 'SK',                alt: 'sk holdings' },
  { ticker: '032830.KS', name: '삼성생명',          alt: '생명' },
  { ticker: '003550.KS', name: 'LG',                alt: 'lg holdings' },
  { ticker: '096770.KS', name: 'SK이노베이션',      alt: 'sk이노 innovation' },
  { ticker: '017670.KS', name: 'SK텔레콤',          alt: 'skt' },
  { ticker: '030200.KS', name: 'KT',                alt: 'kt corp' },
  { ticker: '015760.KS', name: '한국전력',          alt: '한전 kepco' },
  { ticker: '009150.KS', name: '삼성전기',          alt: 'semco' },
  { ticker: '018260.KS', name: '삼성에스디에스',    alt: '삼성sds' },
  { ticker: '000810.KS', name: '삼성화재',          alt: '화재' },
  { ticker: '011200.KS', name: 'HMM',               alt: '현대상선' },
  { ticker: '009540.KS', name: '한국조선해양',      alt: 'hhi' },
  { ticker: '010140.KS', name: '삼성중공업',        alt: 'shi' },
  { ticker: '032640.KS', name: 'LG유플러스',        alt: 'lgu+' },
  { ticker: '316140.KS', name: '우리금융지주',      alt: '우리금융 woori' },
  { ticker: '138040.KS', name: '메리츠금융지주',    alt: '메리츠 meritz' },
  { ticker: '024110.KS', name: '기업은행',          alt: 'ibk' },
  { ticker: '000100.KS', name: '유한양행',          alt: '유한 yuhan' },
  { ticker: '071050.KS', name: '한국금융지주',      alt: '한국투자증권' },
  { ticker: '034020.KS', name: '두산에너빌리티',    alt: '두산중공업 doosan' },
  { ticker: '003490.KS', name: '대한항공',          alt: 'kal korean air' },
  { ticker: '010130.KS', name: '고려아연',          alt: 'kz' },
  { ticker: '005490.KS', name: 'POSCO홀딩스',       alt: '포스코 posco' },
  { ticker: '047050.KS', name: '포스코인터내셔널',  alt: 'posco인터' },
  { ticker: '051900.KS', name: 'LG생활건강',        alt: 'lgh' },
  { ticker: '161390.KS', name: '한국타이어',        alt: 'hankook' },
  { ticker: '042660.KS', name: '한화오션',          alt: '대우조선 hanwha ocean' },
  { ticker: '009830.KS', name: '한화솔루션',        alt: '한화큐셀' },
  { ticker: '064350.KS', name: '현대로템',          alt: '로템 rotem' },
  { ticker: '042700.KS', name: '한미반도체',        alt: '한미 hanmi semi' },
  { ticker: '086280.KS', name: '현대글로비스',      alt: '글로비스 glovis' },
  { ticker: '000720.KS', name: '현대건설',          alt: '현건 hdec' },
  { ticker: '047810.KS', name: '한국항공우주',      alt: 'kai kai' },
  { ticker: '002790.KS', name: '아모레G',           alt: '아모레그룹 amorepacific' },
  { ticker: '090430.KS', name: '아모레퍼시픽',      alt: 'amorepacific' },
  { ticker: '004020.KS', name: '현대제철',          alt: '현제 hyundai steel' },
  { ticker: '011780.KS', name: '금호석유화학',      alt: '금호석화' },
  { ticker: '097950.KS', name: 'CJ제일제당',        alt: 'cj' },
  { ticker: '001040.KS', name: 'CJ',                alt: 'cjcorp' },
  { ticker: '000080.KS', name: '하이트진로',        alt: '하이트 진로' },
  { ticker: '021240.KS', name: '코웨이',            alt: 'coway' },
  { ticker: '008770.KS', name: '호텔신라',          alt: '신라 shilla' },
  { ticker: '029780.KS', name: '삼성카드',          alt: '삼카' },
  { ticker: '016360.KS', name: '삼성증권',          alt: '삼증' },
  { ticker: '000120.KS', name: 'CJ대한통운',        alt: '대한통운 cj logistics' },
  { ticker: '375500.KS', name: 'DL이앤씨',          alt: 'dl e&c' },
  // ── KOSDAQ ──────────────────────────────────────────────────────────────────
  { ticker: '086520.KQ', name: '에코프로',          alt: 'ecopro' },
  { ticker: '247540.KQ', name: '에코프로비엠',      alt: 'ecoprobm' },
  { ticker: '196170.KQ', name: '알테오젠',          alt: 'alteogen' },
  { ticker: '352820.KQ', name: '하이브',            alt: 'hybe 방탄소년단 bts' },
  { ticker: '112040.KQ', name: '위메이드',          alt: 'wemade' },
  { ticker: '263750.KQ', name: '펄어비스',          alt: 'pearl abyss' },
  { ticker: '293490.KQ', name: '카카오게임즈',      alt: 'kakao games' },
  { ticker: '035900.KQ', name: 'JYP엔터',           alt: 'jyp' },
  { ticker: '122870.KQ', name: '와이지엔터',        alt: 'yg entertainment' },
  { ticker: '041510.KQ', name: 'SM엔터테인먼트',    alt: 'sm ent' },
  { ticker: '145020.KQ', name: '휴젤',              alt: 'hugel' },
  { ticker: '068760.KQ', name: '셀트리온제약',      alt: '셀제 celltrion pharma' },
  { ticker: '067160.KQ', name: '아프리카TV',        alt: 'afreeca' },
  { ticker: '357780.KQ', name: '솔브레인',          alt: 'soulbrain' },
  { ticker: '030520.KQ', name: '한글과컴퓨터',      alt: '한컴 hancom' },
  { ticker: '095340.KQ', name: 'ISC',               alt: 'isc' },
  { ticker: '240810.KQ', name: '원익IPS',           alt: 'wonik ips' },
  { ticker: '078600.KQ', name: '대주전자재료',      alt: '대주' },
  { ticker: '039130.KQ', name: '하나투어',          alt: 'hanatour' },
  { ticker: '096530.KQ', name: '씨젠',              alt: 'seegene' },
];

/** 종목명·코드·영문별칭으로 검색 (최대 6개) */
export function searchKrStocks(query: string): KrStock[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return KR_STOCKS.filter((s) => {
    const name = s.name.toLowerCase();
    const code = s.ticker.replace(/\.(KS|KQ)$/, '');
    const alt  = (s.alt ?? '').toLowerCase();
    return name.includes(q) || code.includes(q) || alt.includes(q);
  }).slice(0, 6);
}
