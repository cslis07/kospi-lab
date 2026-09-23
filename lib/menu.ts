/**
 * 앱 전체 메뉴의 단일 소스(single source of truth).
 * 모바일 하단 탭(BottomNav)·상단 밑줄 탭/데스크탑 내비(NavTabs)·앱바 제목(Header)·메뉴 시트(HomeMenu)가 전부 이 정의를 쓴다.
 * ⚠ 그룹/항목을 바꾸려면 여기만 고친다.
 *
 * IA(2026-09-18 재편, 사용자 지정 5섹션 = 하단 5탭):
 *   홈(대시보드·관심종목·캘린더·뉴스) · 시장(국내·해외·코인·선물) · 분석(종목 분석·스크리너·공시·리포트)
 *   · 관리(플래너·매매일지·통합 리스크·목표 수익률) · 자산(포트폴리오·계좌·성과)
 * 탭 안의 항목 이동은 상단 밑줄 탭(가로), 탭 밖으로 들어가는 상세(종목·코인 상세·기타 도구)는 드릴다운(뒤로가기).
 */

export interface MenuItem {
  href: string; label: string; icon: string; desc?: string; external?: boolean;
  /** 같은 항목으로 취급할 다른 경로(예: 종목 분석 = 국내주식·코인선물 두 화면) */
  alias?: string[];
}
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
  return hrefIsActive(it.href, pathname, q) || !!it.alias?.some((a) => under(pathname, a));
}

const G = (key: string, label: string, color: string, qc: string, navIcon: string, items: MenuItem[], tabExtra?: string[]): MenuGroup => ({
  key, label, color, qc, navIcon, items, tabExtra,
  matchFn: (pathname, q) => items.some((it) => itemIsActive(it, pathname, q)) || !!tabExtra?.some((p) => pathname.startsWith(p)),
});

export const MENU: MenuGroup[] = [
  G('home', '홈', 'c-blue', 'qc-blue', 'home', [
    { href: '/',          icon: 'home',     label: '대시보드',    desc: '시장 요약·관심·리스크·이벤트' },
    { href: '/calendar',  icon: 'calendar', label: '경제 캘린더', desc: 'FOMC·금통위·지표·휴장' },
    { href: '/news',      icon: 'news',     label: '뉴스',        desc: '시장 소식' },
  ]),
  G('market', '시장', 'c-violet', 'qc-violet', 'domestic', [
    { href: '/domestic', icon: 'domestic', label: '국내', desc: 'KOSPI·KOSDAQ·등락 랭킹', alias: ['/krx'] },
    { href: '/overseas', icon: 'overseas', label: '해외', desc: '미국 등 글로벌' },
    { href: '/coins',    icon: 'crypto',   label: '코인', desc: '시세·거시 환경·ETF' },
    { href: '/futures',  icon: 'futures',  label: '선물', desc: 'USDT 무기한·펀딩' },
  ], ['/stock/', '/crypto/']),
  // 종목 분석(/stock-analysis·/coin-analysis)은 메뉴에서 숨김 — 시장 목록의 행별 '분석' 버튼으로 진입(자동 실행).
  // 라우트·AnalysisSwitch는 유지하고, tabExtra로 분석 탭 강조·drillTitle로 앱바 제목만 보존한다.
  G('analysis', '분석', 'c-amber', 'qc-amber', 'analysis', [
    { href: '/screener',       icon: 'screener', label: '스크리너',  desc: 'ROE·PER·성장주',            alias: ['/growth'] },
    { href: '/dart',           icon: 'dart',     label: '공시',      desc: 'DART 전자공시' },
    { href: '/report',         icon: 'report',   label: '리포트',    desc: '증권사 리포트' },
  ], ['/stock-analysis', '/coin-analysis']),
  // 관심종목 — 홈에서 분리해 독립 탭으로 승격(단일 화면, 내부 국내·해외·코인 세그먼트). 하단 탭에서 바로 진입.
  G('watch', '관심종목', 'c-rose', 'qc-rose', 'star', [
    { href: '/my-stocks', icon: 'star', label: '관심종목', desc: '국내·해외·코인 저장 목록' },
  ]),
  // 자산 — 단일 허브 한 화면(계좌 잔액 + 성과 7일 대표 노출, 청산·이체·일지는 팝업). 2026-09-23 재구성.
  // 상세 페이지(계좌/성과/매매일지)는 허브에서 진입하는 드릴다운이라 tabExtra로 탭 강조만 유지.
  G('assets', '자산', 'c-green', 'qc-green', 'portfolio', [
    { href: '/assets', icon: 'portfolio', label: '자산', desc: '계좌·성과 + 청산·이체·일지' },
  ], ['/bitget', '/performance', '/journal', '/virtual', '/invest', '/tax', '/simulate', '/brokerage']),
];

/** 5섹션 밖의 보조 도구 — 메뉴 시트 '더보기'에서만 노출(드릴다운, 뒤로가기)
 *  ※ KRX 시장(/krx)·성장주 발굴(/growth)은 중복이라 제거: KRX는 시장›국내 "전체보기"로,
 *    성장주 스크리닝은 분석›스크리너로 대체된다. */
export const EXTRAS: MenuItem[] = [
  { href: '/principles', icon: 'principles', label: '매매 대원칙', desc: '지킬 3·피할 3' },
  { href: '/virtual',   icon: 'virtual',   label: '가상투자',    desc: '모의매매·백업' },
  { href: '/invest',    icon: 'invest',    label: '투자설계',    desc: '계좌·자산 추천' },
  { href: '/tax',       icon: 'tax',       label: '세제혜택',    desc: 'ISA·IRP·연금' },
  { href: '/simulate',  icon: 'simulate',  label: '시뮬레이션',  desc: '복리 FV 계산' },
  { href: '/brokerage', icon: 'brokerage', label: '증권사 비교', desc: '수수료·CMA' },
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
  if (under(pathname, '/more')) return '전체 메뉴';
  // 자산 허브에서 진입하는 상세 페이지
  if (under(pathname, '/bitget')) return '계좌 상세';
  if (under(pathname, '/performance')) return '성과';
  if (under(pathname, '/journal')) return '매매일지';
  // 시장 목록의 '분석' 버튼으로 진입(메뉴에서 숨김)
  if (under(pathname, '/stock-analysis')) return '종목 분석';
  if (under(pathname, '/coin-analysis')) return '코인선물 분석';
  return EXTRAS.find((e) => under(pathname, e.href))?.label ?? 'KOSPI LAB';
}

/** 전체 항목 평탄화(그룹색 유지, href 중복 제거) — 메뉴 검색·자주쓰는 후보 풀 */
export type FlatMenuItem = MenuItem & { color: string; qc: string };
export const FLAT: FlatMenuItem[] = [
  ...MENU.flatMap((g) => g.items.map((it) => ({ ...it, color: g.color, qc: g.qc }))),
  ...EXTRAS.map((it) => ({ ...it, color: 'c-violet', qc: 'qc-violet' })),
].filter((it, i, arr) => arr.findIndex((x) => x.href === it.href) === i);
export const BY_HREF = new Map(FLAT.map((f) => [f.href, f]));

/** 방문 데이터 없을 때 기본 '자주 쓰는' — 손이 가는 자동 데이터 위주 */
export const DEFAULT_QUICK = ['/assets', '/my-stocks', '/journal', '/coin-analysis'];
