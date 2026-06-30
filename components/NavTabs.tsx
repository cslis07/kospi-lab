'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState, useRef, useEffect } from 'react';

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
    ],
    matchFn: (p, q) =>
      p.startsWith('/portfolio') || p.startsWith('/bitget') ||
      (p.startsWith('/my-stocks') && !q.get('market')),
  },
  {
    label: '분석',
    items: [
      { label: '버핏 스크리너', href: '/screener', desc: 'ROE·PER·재무 분석' },
      { label: '뉴스',          href: '/news',     desc: '시장 소식' },
      { label: '공시',          href: '/dart',     desc: 'DART 전자공시' },
      { label: '리포트',        href: '/report',   desc: '증권사 리포트' },
      { label: '캘린더',        href: '/calendar', desc: '경제 이벤트' },
    ],
    matchFn: (p) =>
      p.startsWith('/screener') || p.startsWith('/news') ||
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

function NavTabsInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen]               = useState<string | null>(null);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const ref = useRef<HTMLElement>(null);

  // 외부 클릭 / ESC → 닫기
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(null); setMobileOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // 라우트 변경 시 자동 닫힘
  useEffect(() => {
    setOpen(null);
    setMobileOpen(false);
  }, [pathname, searchParams]);

  const dashActive = pathname === '/' && !searchParams.get('market');
  const activeGroupLabel =
    GROUPS.find((g) => g.matchFn(pathname, searchParams))?.label ?? null;

  return (
    <nav ref={ref} className="relative mb-6 border-b border-[var(--border)]">
      {/* ── 데스크탑: 가로 탭 + 드롭다운 (md+) ── */}
      <div className="hidden md:flex">
        <Link href={DASHBOARD.href}
          style={dashActive ? { borderColor: 'var(--nav-active)' } : undefined}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
            dashActive ? 'text-[var(--text)] font-semibold' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}>
          {DASHBOARD.label}
        </Link>
        {GROUPS.map((g) => {
          const groupActive = g.matchFn(pathname, searchParams);
          const isOpen = open === g.label;
          return (
            <div key={g.label} className="relative">
              <button onClick={() => setOpen(isOpen ? null : g.label)}
                style={groupActive ? { borderColor: 'var(--nav-active)' } : undefined}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap inline-flex items-center gap-1 ${
                  groupActive ? 'text-[var(--text)] font-semibold' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}>
                {g.label}
                <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="absolute z-50 top-full left-0 mt-1 min-w-[240px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl overflow-hidden">
                  {g.items.map((it) => {
                    const itemHref = it.href.split('?')[0];
                    const itemQ = it.href.includes('?') ? new URLSearchParams(it.href.split('?')[1]) : null;
                    const itemActive = pathname.startsWith(itemHref) &&
                      (!itemQ || itemQ.get('market') === searchParams.get('market'));
                    return (
                      <Link key={it.href} href={it.href}
                        className={`block px-4 py-2.5 text-sm border-l-2 transition-colors ${
                          itemActive ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-transparent text-[var(--text)] hover:bg-white/5'
                        }`}>
                        <div className="font-medium">{it.label}</div>
                        {it.desc && <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{it.desc}</div>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {/* 이용가이드 (정적 HTML) — 우측 끝 */}
        <a href="/guide.html"
          className="ml-auto px-4 py-3 text-sm font-medium border-b-2 border-transparent text-[var(--text-muted)] hover:text-[var(--text)] transition-colors -mb-px whitespace-nowrap">
          📖 이용가이드
        </a>
      </div>

      {/* ── 모바일: 햄버거 트리거 + 펼침 패널 (md 미만) ── */}
      <div className="md:hidden">
        <button onClick={() => setMobileOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm">
          <span className="font-semibold text-[var(--text)]">
            {dashActive ? DASHBOARD.label : (activeGroupLabel ?? '메뉴')}
          </span>
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <span className="text-xs">{mobileOpen ? '닫기' : '메뉴'}</span>
            {mobileOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </div>
        </button>

        {mobileOpen && (
          <div className="border-t border-[var(--border)] bg-[var(--bg-card)] max-h-[70vh] overflow-y-auto">
            <Link href={DASHBOARD.href}
              className={`block px-4 py-3 text-sm border-l-2 ${
                dashActive ? 'border-sky-500 bg-sky-500/10 text-sky-400 font-semibold' : 'border-transparent text-[var(--text)]'
              }`}>
              🏠 대시보드
            </Link>
            {GROUPS.map((g) => (
              <div key={g.label} className="border-t border-[var(--border)]">
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {g.label}
                </p>
                {g.items.map((it) => {
                  const itemHref = it.href.split('?')[0];
                  const itemQ = it.href.includes('?') ? new URLSearchParams(it.href.split('?')[1]) : null;
                  const itemActive = pathname.startsWith(itemHref) &&
                    (!itemQ || itemQ.get('market') === searchParams.get('market'));
                  return (
                    <Link key={it.href} href={it.href}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm border-l-2 ${
                        itemActive ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-transparent text-[var(--text)]'
                      }`}>
                      <span className="font-medium">{it.label}</span>
                      {it.desc && <span className="text-[10px] text-[var(--text-muted)] ml-2 truncate">{it.desc}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
            {/* 이용가이드 (정적) */}
            <div className="border-t border-[var(--border)]">
              <a href="/guide.html"
                className="block px-4 py-3 text-sm border-l-2 border-transparent text-[var(--text)] font-medium">
                📖 이용가이드
              </a>
            </div>
          </div>
        )}
      </div>
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
