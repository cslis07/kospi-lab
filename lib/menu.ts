/**
 * 앱 전체 메뉴의 단일 소스(single source of truth).
 * 데스크탑 내비(NavTabs)·모바일 팝업(HomeMenu)·홈 바로가기(page)가 전부 이 정의를 쓴다.
 * ⚠ 그룹/항목을 바꾸려면 여기만 고친다 — 여러 곳에 흩어진 정의가 "메뉴가 여기저기" 혼란의 원인이었다.
 *
 * IA(2026-09-16 재편): 의도(할 일) 기준 4그룹. 이 앱의 정체성인 "매매 규율"을 맨 앞에.
 *   매매(핵심) → 시세 → 내 자산 → 정보·도구(자주 안 쓰는 참고/발굴/설계는 여기 모음)
 */

export interface MenuItem { href: string; label: string; icon: string; desc?: string; external?: boolean }
export interface MenuGroup {
  key: string; label: string; color: string; qc: string; navIcon: string;
  items: MenuItem[];
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
};

export const DASHBOARD: MenuItem = { href: '/', label: '대시보드', icon: 'home' };
export const GUIDE: MenuItem = { href: '/guide.html', label: '이용가이드', icon: 'guide', external: true };

/** href가 현재 라우트와 일치하는지(쿼리 market까지 정확 대조). '/'·외부·정적은 제외. */
export function hrefIsActive(href: string, pathname: string, searchParams: URLSearchParams): boolean {
  const base = href.split('?')[0];
  if (base === '/' || base.startsWith('http') || href.endsWith('.html')) return false;
  const iq = href.includes('?') ? new URLSearchParams(href.split('?')[1]) : null;
  return pathname.startsWith(base) && (!iq || iq.get('market') === searchParams.get('market'));
}
/** 그룹 매칭 = 그룹 안 아무 항목이나 현재 라우트와 일치. 항목 href로 자동 생성(손수 매칭 제거). */
function makeMatch(items: MenuItem[]) {
  return (pathname: string, q: URLSearchParams) => items.some((it) => hrefIsActive(it.href, pathname, q));
}

const G = (key: string, label: string, color: string, qc: string, navIcon: string, items: MenuItem[]): MenuGroup =>
  ({ key, label, color, qc, navIcon, items, matchFn: makeMatch(items) });

export const MENU: MenuGroup[] = [
  G('trade', '매매', 'c-blue', 'qc-blue', 'target', [
    { href: '/target',         icon: 'target',   label: '목표 수익률',   desc: '월 목표 역산·누수·규칙' },
    { href: '/planner',        icon: 'planner',  label: '플래너',        desc: '사이징·청산가·1R 계산' },
    { href: '/journal',        icon: 'journal',  label: '매매일지',      desc: '승률·기대값·심화 복기' },
    { href: '/risk',           icon: 'risk',     label: '통합 리스크',   desc: '계좌 익스포저·집중도' },
    { href: '/stock-analysis', icon: 'analysis', label: '국내주식 분석', desc: '수급·추세·재무 체크' },
    { href: '/coin-analysis',  icon: 'signal',   label: '코인선물 분석', desc: '손절·사이징 점검' },
  ]),
  G('market', '시세', 'c-violet', 'qc-violet', 'domestic', [
    { href: '/domestic',                icon: 'domestic', label: '국내주식', desc: 'KOSPI·KOSDAQ' },
    { href: '/overseas',                icon: 'overseas', label: '해외주식', desc: '미국 등 글로벌' },
    { href: '/my-stocks?market=crypto', icon: 'crypto',   label: '코인',     desc: '실시간 시세' },
    { href: '/futures',                 icon: 'futures',  label: '선물',     desc: 'USDT 무기한·펀딩' },
    { href: '/krx',                     icon: 'krx',      label: 'KRX 시장', desc: '지수·랭킹·ETF' },
  ]),
  G('assets', '내 자산', 'c-green', 'qc-green', 'portfolio', [
    { href: '/portfolio', icon: 'portfolio', label: '통합 자산', desc: '국내·해외·코인 합산' },
    { href: '/my-stocks', icon: 'star',      label: '내 주식',   desc: '관심·포트폴리오' },
    { href: '/bitget',    icon: 'bitget',    label: '비트겟',    desc: '잔고·청산 내역' },
    { href: '/virtual',   icon: 'virtual',   label: '가상투자',  desc: '모의매매·백업' },
  ]),
  G('more', '정보·도구', 'c-amber', 'qc-amber', 'tools', [
    { href: '/news',      icon: 'news',      label: '뉴스',    desc: '시장 소식' },
    { href: '/dart',      icon: 'dart',      label: '공시',    desc: 'DART 전자공시' },
    { href: '/report',    icon: 'report',    label: '리포트',  desc: '증권사 리포트' },
    { href: '/calendar',  icon: 'calendar',  label: '캘린더',  desc: '경제 이벤트' },
    { href: '/growth',    icon: 'growth',    label: '성장주',  desc: 'PER·PEG 스캔' },
    { href: '/screener',  icon: 'screener',  label: '스크리너', desc: 'ROE·PER 재무' },
    { href: '/invest',    icon: 'invest',    label: '투자설계', desc: '계좌·자산 추천' },
    { href: '/tax',       icon: 'tax',       label: '세제혜택', desc: 'ISA·IRP·연금' },
    { href: '/simulate',  icon: 'simulate',  label: '시뮬레이션', desc: '복리 FV 계산' },
    { href: '/brokerage', icon: 'brokerage', label: '증권사',  desc: '수수료·CMA' },
  ]),
];

/** 모바일 하단 탭에 직접 노출되는 그룹. 나머지(내 자산·정보·도구)는 '더보기' 탭으로 접힌다.
 *  탭바 = 홈 · 매매 · [+ 플래너 FAB] · 시세 · 더보기. BottomNav·Header(탭 루트 판정)가 함께 쓴다. */
export const TAB_GROUP_KEYS: readonly string[] = ['trade', 'market'];

/** 전체 항목 평탄화(그룹색 유지, href 중복 제거) — 검색·자주쓰는 후보 풀 */
export type FlatMenuItem = MenuItem & { color: string; qc: string };
export const FLAT: FlatMenuItem[] = MENU
  .flatMap((g) => g.items.map((it) => ({ ...it, color: g.color, qc: g.qc })))
  .filter((it, i, arr) => arr.findIndex((x) => x.href === it.href) === i);
export const BY_HREF = new Map(FLAT.map((f) => [f.href, f]));

/** 방문 데이터 없을 때 기본 '자주 쓰는' — 이 앱의 핵심(매매 규율 4종) */
export const DEFAULT_QUICK = ['/target', '/planner', '/journal', '/risk'];
