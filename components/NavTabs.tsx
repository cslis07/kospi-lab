'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState, useRef, useEffect } from 'react';
import HomeMenu from '@/components/HomeMenu';

interface NavItem  { label: string; href: string; desc?: string }
interface NavGroup {
  label: string;
  items: NavItem[];
  matchFn: (p: string, q: URLSearchParams) => boolean;
}

const DASHBOARD: NavItem = { label: '대시보드', href: '/' };

const GROUPS: NavGroup[] = [
  {
    label: '시장',
    items: [
      { label: '국내주식', href: '/domestic',                desc: 'KOSPI·KOSDAQ' },
      { label: '해외주식', href: '/overseas',                desc: '미국 등 글로벌' },
      { label: '코인',     href: '/my-stocks?market=crypto', desc: '실시간 암호화폐' },
      { label: '선물',     href: '/futures',                 desc: 'USDT 무기한·펀딩비' },
    ],
    matchFn: (p, q) =>
      p.startsWith('/domestic') || p.startsWith('/overseas') || p.startsWith('/futures') ||
      p.startsWith('/crypto') ||
      (p.startsWith('/my-stocks') && q.get('market') === 'crypto'),
  },
  {
    label: '내 자산',
    items: [
      { label: '통합 자산',          href: '/portfolio', desc: '국내·해외·코인 합산' },
      { label: '내 주식',            href: '/my-stocks', desc: '관심·포트폴리오·알림' },
      { label: '비트겟 포트폴리오',   href: '/bitget',    desc: '코인 잔고·체결·이체' },
      { label: '통합 리스크',        href: '/risk',      desc: '계좌 전체 익스포저·집중도·최대손실' },
      { label: '가상투자·백업',       href: '/virtual',   desc: '모의매매 · 데이터 백업/복원' },
    ],
    matchFn: (p, q) =>
      p.startsWith('/portfolio') || p.startsWith('/bitget') || p.startsWith('/virtual') || p.startsWith('/risk') ||
      (p.startsWith('/my-stocks') && !q.get('market')),
  },
  {
    label: '분석',
    items: [
      { label: '국내주식 분석', href: '/stock-analysis', desc: '수급·추세·재무 체크리스트' },
      { label: '코인선물 분석', href: '/coin-analysis', desc: '손절·사이징·리스크 점검' },
      { label: '매매일지 성적', href: '/journal', desc: '내 실제 승률·기대값 실측' },
      { label: '성장주 발굴',   href: '/growth', desc: 'PER·PEG·컨센서스 성장 스캔' },
      { label: '버핏 스크리너', href: '/screener', desc: 'ROE·PER·재무 분석' },
      { label: 'KRX 시장',      href: '/krx',      desc: '지수·전종목 랭킹·ETF·상품' },
      { label: '뉴스',          href: '/news',     desc: '시장 소식' },
      { label: '공시',          href: '/dart',     desc: 'DART 전자공시' },
      { label: '리포트',        href: '/report',   desc: '증권사 리포트' },
      { label: '캘린더',        href: '/calendar', desc: '경제 이벤트' },
    ],
    matchFn: (p) =>
      p.startsWith('/stock-analysis') || p.startsWith('/coin-analysis') ||
      p.startsWith('/journal') || p.startsWith('/growth') ||
      p.startsWith('/screener') || p.startsWith('/krx') || p.startsWith('/news') ||
      p.startsWith('/dart')     || p.startsWith('/report') ||
      p.startsWith('/calendar'),
  },
  {
    label: '설계',
    items: [
      { label: '투자설계',   href: '/invest',    desc: '계좌·자산 추천' },
      { label: '세제혜택',   href: '/tax',       desc: 'ISA·IRP·연금저축' },
      { label: '시뮬레이션', href: '/simulate',  desc: '복리 FV 계산' },
      { label: '증권사비교', href: '/brokerage', desc: '수수료·CMA' },
    ],
    matchFn: (p) =>
      p.startsWith('/invest') || p.startsWith('/tax') ||
      p.startsWith('/simulate') || p.startsWith('/brokerage'),
  },
];

// href 문자열이 현재 라우트와 일치하는지
function itemIsActive(href: string, pathname: string, searchParams: URLSearchParams) {
  const itemHref = href.split('?')[0];
  const itemQ = href.includes('?') ? new URLSearchParams(href.split('?')[1]) : null;
  return pathname.startsWith(itemHref) && (!itemQ || itemQ.get('market') === searchParams.get('market'));
}

function NavTabsInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen]   = useState(false);
  // 데스크탑: 사용자가 알약을 눌러 미리 펼친 그룹(라우트 변경 시 초기화)
  const [shownGroup, setShownGroup]   = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  // ESC → 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMobileOpen(false); setShownGroup(null); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // 라우트 변경 시 자동 닫힘 / 펼친 그룹 초기화
  useEffect(() => {
    setMobileOpen(false);
    setShownGroup(null);
  }, [pathname, searchParams]);

  // 팝업 열림 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const dashActive = pathname === '/' && !searchParams.get('market');
  const activeGroupLabel =
    GROUPS.find((g) => g.matchFn(pathname, searchParams))?.label ?? null;

  // 데스크탑에서 서브칩으로 펼쳐 보일 그룹: 사용자가 누른 것 우선, 없으면 현재 활성 그룹
  const shown = shownGroup ?? activeGroupLabel;
  const shownItems = GROUPS.find((g) => g.label === shown)?.items ?? null;

  return (
    <nav ref={ref} className="relative mb-6">
      {/* ── 데스크탑: 알약 세그먼트 탭 + 서브칩 (md+) ── */}
      <div className="hidden md:block space-y-3">
        <div className="flex items-center gap-3">
          <div className="topnav">
            <Link href={DASHBOARD.href}
              className={`navlink ${dashActive ? 'active' : ''}`}>
              {DASHBOARD.label}
            </Link>
            {GROUPS.map((g) => (
              <button key={g.label} type="button"
                onClick={() => setShownGroup(shown === g.label ? null : g.label)}
                className={`navlink ${shown === g.label ? 'active' : ''}`}>
                {g.label}
                <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            ))}
          </div>
          <a href="/guide.html" className="navlink ml-auto !bg-transparent">📖 이용가이드</a>
        </div>

        {/* 서브칩 — 펼친(또는 활성) 그룹의 하위 메뉴 */}
        {shownItems && (
          <div className="chip-row">
            {shownItems.map((it) => {
              const active = itemIsActive(it.href, pathname, searchParams);
              return (
                <Link key={it.href} href={it.href} title={it.desc}
                  className={`chip ${active ? 'active' : ''}`}>
                  {it.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 모바일: 메뉴 버튼 → 바텀시트 팝업 (md 미만) ── */}
      <div className="md:hidden">
        <button type="button" onClick={() => setMobileOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-sm active:scale-[.99] transition-transform">
          <span className="flex items-center gap-2 font-semibold text-[var(--text)]">
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            메뉴
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {dashActive ? DASHBOARD.label : (activeGroupLabel ?? '전체 메뉴')}
          </span>
        </button>
      </div>

      {/* 팝업 (바텀시트) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[100]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm mfade" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex flex-col max-h-[88vh] rounded-t-3xl bg-[var(--bg-card)] border-t border-[var(--border)] shadow-[var(--shadow-card)] msheet">
            <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3">
              <div className="mx-auto absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-[var(--border)]" />
              <span className="text-base font-bold text-[var(--text)]">메뉴</span>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="닫기"
                className="w-8 h-8 grid place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] active:scale-90 transition-transform">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-8 pt-1">
              <Link href={DASHBOARD.href} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 mb-5 px-4 py-3 rounded-2xl text-sm font-semibold ${
                  dashActive ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text)]'
                }`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11l9-8 9 8M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
                </svg>
                대시보드 홈
              </Link>
              <HomeMenu onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

export default function NavTabs() {
  return (
    <Suspense fallback={
      <nav className="border-b border-[var(--border)] mb-6">
        <div className="px-4 py-3 text-sm text-[var(--text-muted)]">메뉴 로딩…</div>
      </nav>
    }>
      <NavTabsInner />
    </Suspense>
  );
}
