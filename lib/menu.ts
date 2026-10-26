/**
 * 앱 전체 메뉴의 단일 소스(single source of truth).
 * 모바일 하단 탭(BottomNav)·상단 밑줄 탭/데스크탑 내비(NavTabs)·앱바 제목(Header)·메뉴 시트(HomeMenu)가 전부 이 정의를 쓴다.
 * ⚠ 그룹/항목을 바꾸려면 여기만 고친다.
 *
 * 2026-10-26 오후 1단계 정리: 시장지표 → 더보기 '거시'(지표 4종 한 묶음), 이름 구분(모의 테스트→선행 테스트·가상투자→가상 계좌·시뮬레이션→계산기),
 *   시장 탭은 밑줄 탭 4개 + '더보기' 시트(components/NavTabs), /more 는 /tools 로 합침.
 * IA(2026-10-26 재편 — "직관적·편리" 요청, 실제 매매 흐름 순서 = 하단 5탭):
 *   홈(대시보드 + 지금 내 상태) · 시장(국내·해외·코인·선물·산업·랭킹·지표·ETF·리서치)
 *   · 트레이딩(코인 분석·ETH 체제·알림 — 들어가도 되나·얼마나·어디서 끊나) · 복기(매매일지·성과·모의 테스트 — 규칙을 지켰나)
 *   · 자산(계좌·보유). 나머지 보조 도구는 '더보기'(/tools)에서 5묶음(EXTRAS.section)으로.
 * 탭 안의 항목 이동은 상단 밑줄 탭(가로), 탭 밖으로 들어가는 상세(종목·코인 상세·기타 도구)는 드릴다운(뒤로가기).
 */

export interface MenuItem {
  href: string; label: string; icon: string; desc?: string; external?: boolean;
  /** 같은 항목으로 취급할 다른 경로(예: 종목 분석 = 국내주식·코인선물 두 화면) */
  alias?: string[];
  /** 메뉴·검색에서 숨김(페이지·경로는 유지, 목록에만 노출 안 함) */
  hidden?: boolean;
  /** 더보기(EXTRAS) 묶음 키 — TOOL_SECTIONS */
  section?: ToolSection;
  /** 같은 경로 안 하위 탭 구분 — 이 쿼리 값이어야 활성(null = 그 키가 없어야 함). 예: 매매일지 성적 { tab: null } · 비용 { tab: 'cost' } */
  query?: Record<string, string | null>;
}
export type ToolSection = 'morning' | 'macro' | 'study' | 'stocks' | 'calc';
/** 더보기 묶음 — 순서대로 노출 */
export const TOOL_SECTIONS: { key: ToolSection; label: string; desc: string }[] = [
  { key: 'morning', label: '📰 아침 정보', desc: '브리핑·뉴스·일정' },
  { key: 'macro', label: '🌐 거시', desc: '시장지표·경제지표·실시간 물가·발표 이력' },
  { key: 'study', label: '📚 매매 교본', desc: '원칙·공부법·체크리스트·폭락 대응' },
  { key: 'stocks', label: '🔎 종목 도구', desc: '관심종목·종목 비교' },
  { key: 'calc', label: '🧮 계산·장기투자', desc: '계산기·가상 계좌·투자설계·세제·증권사' },
];
export interface MenuGroup {
  key: string; label: string; color: string; qc: string; navIcon: string;
  items: MenuItem[];
  /** 하단 탭 강조에만 쓰는 추가 경로 접두어(드릴다운 상세·기타 도구). 상단 탭·앱바 루트 판정엔 쓰지 않는다 */
  tabExtra?: string[];
  /** 하단 탭 강조 여부 */
  matchFn: (pathname: string, q: URLSearchParams) => boolean;
}

/* 라인 아이콘 path (viewBox 24, stroke=currentColor). 원은 arc 서브패스로 표현해 path 하나로 유지. */
export const ICON: Record<string, string> = {
  home:       'M3 11l9-8 9 8M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  target:     'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 3v3M12 18v3M3 12h3M18 12h3',
  planner:    'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM9 7h6M9 11h6M9 15h4',
  journal:    'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM9 3v18M12 8h4M12 12h4',
  risk:       'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3ZM9.3 11.8l1.8 1.8 3.4-3.4',
  bell:       'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  analysis:   'M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-3.5-3.5M8 12l2.3-2.3 1.8 1.8L15.5 8.5',
  signal:     'M3 12h4l2.5 7 4-15 2.5 8h5',
  domestic:   'M3 20h18M6 20v-5M10.5 20v-9M15 20v-6M19.5 20v-11',
  overseas:   'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18',
  crypto:     'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M10 7.5v9M10 7.5h3.2a2 2 0 0 1 0 4h-3.2M10 11.5h3.5a2 2 0 0 1 0 4H10M11.6 6v1.5M13.2 6v1.5M11.6 15.5v1.5M13.2 15.5v1.5',
  futures:    'M13 2L4 14h6l-1 8 9-12h-6l1-8Z',
  krx:        'M8.5 14L6 21l6-3 6 3-2.5-7M6 9a6 6 0 1 0 12 0a6 6 0 1 0-12 0',
  portfolio:  'M3 7a2 2 0 0 1 2-2h12v3M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2M16.5 12.5h.01',
  star:       'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
  bitget:     'M4 7a8 3 0 1 0 16 0a8 3 0 1 0-16 0M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  virtual:    'M9 3h6M10 3v5.5L5.3 17.4A2 2 0 0 0 7 20.5h10a2 2 0 0 0 1.7-3.1L14 8.5V3M7.5 14h9',
  news:       'M4 5h13v14a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2V5ZM17 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2M8 8.5h6M8 12h6M8 15.5h4',
  dart:       'M7 2h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM14 2v4h4M9 12h6M9 15.5h6M9 8.5h2',
  report:     'M3 4h18M4 4v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4M12 14v5M9 19h6M8.5 10.5l2.5-3 2 2 3.5-4',
  calendar:   'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6ZM4 9.5h16M8 3v4M16 3v4',
  growth:     'M3 17l6-6 4 4 8-8M15 7h6v6',
  screener:   'M3 5h18l-7 8.5V20l-4-2.5v-4L3 5Z',
  invest:     'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M15.5 8.5l-2.2 4.8L8.5 15.5l2.2-4.8 4.8-2.2Z',
  tax:        'M5 3h14v18l-2.5-1.8L14 21l-2-1.8L10 21l-2.5-1.8L5 21V3ZM9 8.5l6 7M9.3 9h.01M14.7 15h.01',
  simulate:   'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 6.5h8M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5v3.5M8 18h4',
  brokerage:  'M3 10l9-6 9 6M4 10h16M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18',
  tools:      'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  guide:      'M12 6C10 4.7 7 4.2 4 4.7V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.7C17 4.2 14 4.7 12 6ZM12 6v14.5',
  principles: 'M7 3h8l3 3v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M15 3v3h3M8.5 11.5l1.5 1.5 3-3M8.5 16.5l1.5 1.5 3-3',
  insight:    'M9 18h6M10 21h4M8.5 14a5.5 5.5 0 1 1 7 0c-.8.7-1.5 1.4-1.5 2.5h-4c0-1.1-.7-1.8-1.5-2.5Z',
  sunrise:    'M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 4.5v2M5.2 7.7l1.4 1.4M18.8 7.7l-1.4 1.4M2.5 13.5h2M19.5 13.5h2',
};

export const DASHBOARD: MenuItem = { href: '/', label: '대시보드', icon: 'home' };
export const GUIDE: MenuItem = { href: '/guide.html', label: '이용가이드', icon: 'guide', external: true };

/** 경로가 base 와 같거나 그 하위인가('/stock' 이 '/stock-analysis' 에 걸리는 접두어 오탐 방지) */
const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + '/');

/** href가 현재 라우트와 일치하는지(쿼리 market까지 정확 대조). '/'는 정확히 홈일 때만, 외부·정적은 제외. */
export function hrefIsActive(href: string, pathname: string, searchParams: URLSearchParams): boolean {
  if (href.startsWith('http') || href.endsWith('.html')) return false;
  const base = href.split('?')[0];
  if (base === '/') return pathname === '/';
  const iq = href.includes('?') ? new URLSearchParams(href.split('?')[1]) : null;
  return under(pathname, base) && (!iq || iq.get('market') === searchParams.get('market'));
}
/** 항목 일치 = href 또는 alias 경로 */
export function itemIsActive(it: MenuItem, pathname: string, q: URLSearchParams): boolean {
  if (it.query && hrefIsActive(it.href, pathname, q)) return Object.entries(it.query).every(([k, v]) => q.get(k) === v);
  return hrefIsActive(it.href, pathname, q) || !!it.alias?.some((a) => under(pathname, a));
}

const G = (key: string, label: string, color: string, qc: string, navIcon: string, items: MenuItem[], tabExtra?: string[]): MenuGroup => ({
  key, label, color, qc, navIcon, items, tabExtra,
  matchFn: (pathname, q) => items.some((it) => itemIsActive(it, pathname, q)) || !!tabExtra?.some((p) => pathname.startsWith(p)),
});

export const MENU: MenuGroup[] = [
  // 홈 = 대시보드 단독(항목 1개 → 서브탭 없이 바로 진입). 오늘의 리스크는 삭제, 뉴스·매매 대원칙은 '더보기 도구'(EXTRAS)로 이동.
  // 경제 캘린더(/calendar)는 '더보기 도구'(EXTRAS) — 진입점이던 홈 '주요 이벤트' 위젯이 09-30 홈 개편으로 빠져 길이 끊겼었다(10-01).
  G('home', '홈', 'c-blue', 'qc-blue', 'home', [
    { href: '/', icon: 'home', label: '대시보드', desc: '시장 요약·관심·이벤트' },
  ]),
  G('market', '시장', 'c-violet', 'qc-violet', 'domestic', [
    { href: '/domestic', icon: 'domestic', label: '국내', desc: 'KOSPI·KOSDAQ·등락 랭킹', alias: ['/krx'] },
    { href: '/overseas', icon: 'overseas', label: '해외', desc: '미국 등 글로벌' },
    { href: '/coins',    icon: 'crypto',   label: '코인', desc: '시세·거시 환경·ETF' },
    { href: '/futures',  icon: 'futures',  label: '선물', desc: 'USDT 무기한·펀딩' },
    // 2026-09-30 네이버페이 증권 홈 위젯 기반 5종(데이터: stock.naver.com, lib/naverStock.ts)
    { href: '/industry',   icon: 'growth',  label: '산업 트렌드', desc: '업종·테마·섹터 등락 순위' },
    { href: '/ranking',    icon: 'krx',     label: '실시간 랭킹', desc: '거래대금·인기·상승·하락' },
    { href: '/theme-etf',  icon: 'tools',   label: '테마 ETF',   desc: '테마별 상위 ETF' },
    { href: '/research',   icon: 'report',  label: '리서치',     desc: '애널리스트 산업·목표주가' },
  ], ['/stock/', '/crypto/']),
  // 트레이딩 — 매매 직전·도중에 보는 화면(2026-10-26 하단 탭 승격, 예전엔 시장 목록 '분석' 버튼 드릴다운이라 찾기 어려웠음)
  G('trading', '트레이딩', 'c-amber', 'qc-amber', 'futures', [
    { href: '/coin-analysis', icon: 'analysis', label: '코인 분석', desc: '진입 판단·급변 계기판·폭락 경보·내 포지션' },
    { href: '/eth',           icon: 'risk',     label: 'ETH 체제',  desc: '공급·수요·포지셔닝·거시 4층(예측 아님)' },
    { href: '/alerts',        icon: 'bell',     label: '알림',      desc: '가격·코인 알림 한 화면 관리' },
  ], ['/stock-analysis', '/overseas-analysis']),
  // 복기 — 규칙을 지켰나. 매매일지 하위 탭을 상단 밑줄 탭으로 올려 2단계(하단 복기 → 밑줄 탭)로(2026-10-26 메뉴 2단계).
  // 옛 '성과'(/performance, 계획 매매 R 기준)는 성적 탭 맨 아래 접힘 섹션으로 흡수 — 주소는 드릴다운으로 유지.
  G('review', '복기', 'c-rose', 'qc-rose', 'journal', [
    { href: '/journal',               icon: 'journal',  label: '성적',       desc: '매매일지 — 요약·자산 곡선·달력·월별·계획 매매 성과', query: { tab: null } },
    { href: '/journal?tab=cost',       icon: 'tax',      label: '비용',       desc: '매매일지 — 수수료·펀딩·비용 누수', query: { tab: 'cost' } },
    { href: '/journal?tab=discipline', icon: 'risk',     label: '규율',       desc: '매매일지 — 손절·손실 크기·과매매·규율 점수', query: { tab: 'discipline' } },
    { href: '/journal?tab=whatif',     icon: 'simulate', label: '가정',       desc: '매매일지 — 규칙대로였다면·손절 배수 비교', query: { tab: 'whatif' } },
    { href: '/paper',                  icon: 'target',   label: '선행 테스트', desc: '규칙 사전 기록 30건(R30) 진행·자동 판정' },
  ], ['/performance']),
  // 자산 — 계좌·보유 한 화면. 계산·장기투자 도구는 더보기로.
  G('assets', '자산', 'c-green', 'qc-green', 'portfolio', [
    { href: '/assets', icon: 'portfolio', label: '자산', desc: '계좌·보유·청산·이체' },
  ], ['/bitget']),
];

/** 5섹션 밖의 보조 도구 — 메뉴 시트 '더보기'에서만 노출(드릴다운, 뒤로가기)
 *  ※ KRX 시장(/krx)·성장주 발굴(/growth)은 중복이라 제거: KRX는 시장›국내 "전체보기"로,
 *    성장주 스크리닝은 분석›스크리너로 대체된다. */
export const EXTRAS: MenuItem[] = [
  { href: '/brief',      icon: 'sunrise',    label: '모닝 브리핑',  desc: '증시별 거시·금리·유가·뉴스 아침 정리', section: 'morning' },
  { href: '/news',       icon: 'news',       label: '뉴스',        desc: '시장 소식', section: 'morning' },
  { href: '/calendar',   icon: 'calendar',   label: '경제 캘린더', desc: 'FOMC·CPI·실적 등 주요 일정', section: 'morning' },
  { href: '/indicators', icon: 'signal',     label: '시장지표',    desc: '환율·금리·원자재 실시간(네이버)', section: 'macro' },
  { href: '/macro',      icon: 'signal',     label: '경제지표',    desc: '미국 CPI·PPI·달러지수·유가·원달러(FRED)', section: 'macro' },
  { href: '/releases',   icon: 'calendar',   label: '지표 발표 이력', desc: '인베스팅 결과·예측·이전(2021~)', section: 'macro' },
  { href: '/inflation',  icon: 'signal',     label: '실시간 물가',   desc: '나우캐스트 인플레이션·공식 CPI 대비', section: 'macro' },
  { href: '/study/crash', icon: 'risk',      label: '폭락 대응 교본', desc: '3단계·30초 체크리스트·측정 결과', section: 'study' },
  { href: '/principles', icon: 'principles', label: '매매 대원칙', desc: '지킬 3·피할 3', section: 'study' },
  { href: '/study/reentry', icon: 'principles', label: '진입·재진입 체크리스트', desc: '진입 전 7문항·손절 후 60분 프로토콜', section: 'study' },
  { href: '/study/entry-signals', icon: 'insight', label: '롱·숏 진입 신호 가이드', desc: '신호 평가·가격대·RSI/MACD 해석', section: 'study' },
  { href: '/study',      icon: 'insight',    label: '코인 기초 공부법', desc: '차트·RSI·MACD·피보나치·금리·유가', section: 'study' },
  { href: '/my-stocks',  icon: 'star',       label: '관심종목',    desc: '국내·해외·코인 저장 목록', section: 'stocks' },
  { href: '/screener',   icon: 'screener',   label: '종목 비교',   desc: '여러 종목 재무 비교', alias: ['/growth'], section: 'stocks' },
  { href: '/report',     icon: 'report',     label: '리포트',      desc: '증권사 리포트', hidden: true, section: 'stocks' },
  { href: '/simulate',  icon: 'simulate',  label: '계산기',      desc: '복리·선물 손익·익절 규칙 시뮬레이션', section: 'calc' },
  { href: '/virtual',   icon: 'virtual',   label: '가상 계좌',   desc: '가상 돈으로 사고팔기·백업', section: 'calc' },
  { href: '/invest',    icon: 'invest',    label: '투자설계',    desc: '계좌·자산 추천', section: 'calc' },
  { href: '/tax',       icon: 'tax',       label: '세제혜택',    desc: 'ISA·IRP·연금', section: 'calc' },
  { href: '/brokerage', icon: 'brokerage', label: '증권사 비교', desc: '수수료·CMA', section: 'calc' },
];

/** 실시간 물가(/inflation) 허브의 하위 섹션 — 메뉴 '실시간 물가 허브'·검색에 노출(InflationNav SECTIONS 와 동일 구성).
 *  허브 루트(/inflation)는 EXTRAS 의 '실시간 물가' 항목이 담당하고, 여기는 그 하위 페이지들. */
export const INFLATION_SECTIONS: MenuItem[] = [
  { href: '/inflation/why',         icon: 'signal', label: '오늘 왜',       desc: '게이지가 움직인 이유' },
  { href: '/inflation/gap',         icon: 'signal', label: 'CPI 격차',      desc: '공식 BLS 전지표 대비' },
  { href: '/inflation/truflation',  icon: 'signal', label: 'vs Truflation', desc: '민간 실시간 추정 비교' },
  { href: '/inflation/lead',        icon: 'signal', label: '리드 테스트',    desc: '발표 전 적중 통계' },
  { href: '/inflation/scoreboard',  icon: 'report', label: '예측 스코어보드', desc: '예측자 적중·백테스트' },
  { href: '/inflation/calendar',    icon: 'calendar', label: '발표 일정',     desc: '미국 주요 지표·예측' },
  { href: '/inflation/markets',     icon: 'invest', label: '예측시장',       desc: 'Polymarket·Kalshi 확률' },
  { href: '/inflation/fed',         icon: 'target', label: 'Fed watch',     desc: '다음 FOMC 시장 확률' },
  { href: '/inflation/brief',       icon: 'sunrise', label: '데일리 브리핑',  desc: '하루치 인플레 요약' },
  { href: '/inflation/analysis',    icon: 'report', label: '발표일 분석',    desc: '예측 대 실제' },
  { href: '/inflation/articles',    icon: 'news',   label: '경제 기사',      desc: 'Nowflation 해설' },
  { href: '/inflation/prices',      icon: 'krx',    label: '품목별 가격',    desc: '식료품·연료 추이', hidden: true },
  { href: '/inflation/cart',        icon: 'tools',  label: '장바구니',       desc: '월 비용·전년대비', hidden: true },
  { href: '/inflation/jobs',        icon: 'growth', label: '고용',          desc: 'NFP·실업·임금' },
  { href: '/inflation/heatcheck',   icon: 'risk',   label: '경기 열지수',    desc: '침체 신호 점검', hidden: true },
  { href: '/inflation/quilt',       icon: 'analysis', label: '인플레 히트맵', desc: '품목×월 YoY' },
  { href: '/inflation/calculator',  icon: 'simulate', label: '인플레 계산기', desc: '구매력 환산', hidden: true },
  { href: '/inflation/my',          icon: 'portfolio', label: '내 물가',     desc: '내 소비 가중 체감', hidden: true },
  { href: '/inflation/methodology', icon: 'principles', label: '방법론',     desc: '구성·현황·소스', hidden: true },
];

/** 종목·코인 상세 — 섹션 항목 하위 경로여도 드릴다운(뒤로가기)으로 취급 */
const DETAIL_PREFIXES = ['/stock/', '/crypto/', '/overseas/'];

/** 현재 경로가 속한 섹션 항목(상단 탭·앱바 루트 판정용). 드릴다운 상세면 null */
export function activeItem(pathname: string, q: URLSearchParams): { group: MenuGroup; item: MenuItem } | null {
  if (DETAIL_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  for (const group of MENU) {
    const item = group.items.find((it) => itemIsActive(it, pathname, q));
    if (item) return { group, item };
  }
  return null;
}
/** 드릴다운 화면 제목(섹션 밖 경로) */
export function drillTitle(pathname: string): string {
  if (pathname.startsWith('/stock/')) return '종목 상세';
  if (pathname.startsWith('/crypto/')) return '코인 상세';
  if (pathname.startsWith('/overseas/')) return '해외 상세';
  if (under(pathname, '/tools')) return '더보기 도구';
  // 자산 허브에서 진입하는 상세 페이지
  if (under(pathname, '/bitget')) return '계좌 상세';
  if (under(pathname, '/performance')) return '계획 매매 성과';
  // 시장 목록의 '분석' 버튼으로 진입(트레이딩 탭 강조만 유지)
  if (under(pathname, '/stock-analysis')) return '종목 분석';
  if (under(pathname, '/overseas-analysis')) return '해외 분석';
  return EXTRAS.find((e) => under(pathname, e.href))?.label ?? 'KOSPI LAB';
}

/**
 * 페이지 본문이 자체 <h1>을 가진 경로(예: 종목 상세의 종목명). 여기 있으면 헤더는 h1을 만들지 않고,
 * 없으면 헤더가 화면 제목을 sr-only <h1>로 넣는다 → 모든 화면 h1 정확히 1개.
 * '/'로 끝나는 항목은 접두사(동적 경로). tests/headings.test.ts 가 app/ 의 실제 <h1>과 대조한다.
 */
export const OWN_H1_ROUTES = [
  '/bitget', '/brokerage', '/crypto/', '/futures', '/growth', '/invest', '/journal', '/krx',
  '/overseas/', '/overseas-analysis', '/macro', '/inflation', '/principles', '/releases', '/screener', '/simulate', '/stock/', '/study', '/tax', '/tools', '/virtual', '/eth',
];
export const pageOwnsH1 = (pathname: string) =>
  OWN_H1_ROUTES.some((r) => (r.endsWith('/') ? pathname.startsWith(r) : under(pathname, r)));

/** 전체 항목 평탄화(그룹색 유지, href 중복 제거) — 메뉴 검색·자주쓰는 후보 풀 */
export type FlatMenuItem = MenuItem & { color: string; qc: string };
export const FLAT: FlatMenuItem[] = [
  ...MENU.flatMap((g) => g.items.map((it) => ({ ...it, color: g.color, qc: g.qc }))),
  ...EXTRAS.map((it) => ({ ...it, color: 'c-violet', qc: 'qc-violet' })),
  ...INFLATION_SECTIONS.map((it) => ({ ...it, color: 'c-violet', qc: 'qc-violet' })),
]
  .filter((it) => !it.hidden) // 숨김 항목은 검색·자주쓰는 후보에서도 제외
  .filter((it, i, arr) => arr.findIndex((x) => x.href === it.href) === i);
export const BY_HREF = new Map(FLAT.map((f) => [f.href, f]));

/** 방문 데이터 없을 때 기본 '자주 쓰는' — 손이 가는 자동 데이터 위주 */
export const DEFAULT_QUICK = ['/brief', '/coin-analysis', '/journal', '/paper', '/alerts'];
