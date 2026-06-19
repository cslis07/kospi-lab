'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState, useRef, useEffect } from 'react';

interface NavItem  { label: string; href: string; desc?: string }
interface NavGroup {
  label: string;
  items: NavItem[];
  /** 그룹 내 어떤 항목이라도 활성이면 그룹 헤더도 활성 표시 */
  matchFn: (p: string, q: URLSearchParams) => boolean;
}

const DASHBOARD: NavItem = { label: '대시보드', href: '/' };

const GROUPS: NavGroup[] = [
  {
    label: '시장',
    items: [
      { label: '국내주식', href: '/domestic',              desc: 'KOSPI·KOSDAQ 관심·시세' },
      { label: '해외주식', href: '/overseas',              desc: '미국 등 해외 시세' },
      { label: '코인',     href: '/my-stocks?market=crypto', desc: '실시간 암호화폐 시세' },
      { label: '선물',     href: '/futures',               desc: 'USDT 무기한·펀딩비' },
    ],
    matchFn: (p, q) =>
      p.startsWith('/domestic') || p.startsWith('/overseas') || p.startsWith('/futures') ||
      p.startsWith('/crypto') ||
      (p.startsWith('/my-stocks') && q.get('market') === 'crypto'),
  },
  {
    label: '내 자산',
    items: [
      { label: '내 주식',           href: '/my-stocks', desc: '관심종목·포트폴리오·알림' },
      { label: '비트겟 포트폴리오', href: '/bitget',    desc: '코인 잔고·체결·이체' },
    ],
    matchFn: (p, q) =>
      (p.startsWith('/my-stocks') && !q.get('market')) || p.startsWith('/bitget'),
  },
  {
    label: '분석',
    items: [
      { label: '버핏 스크리너', href: '/screener', desc: 'ROE·PER·재무 7기준 분석' },
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
      { label: '세제혜택',   href: '/tax',       desc: 'ISA·IRP·연금저축 절세' },
      { label: '시뮬레이션', href: '/simulate',  desc: '복리 FV 계산기' },
      { label: '증권사비교', href: '/brokerage', desc: '수수료·CMA 비교' },
    ],
    matchFn: (p) =>
      p.startsWith('/invest') || p.startsWith('/tax') ||
      p.startsWith('/simulate') || p.startsWith('/brokerage'),
  },
];

function NavTabsInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  // 외부 클릭 / ESC → 닫기
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // 라우트가 바뀌면 자동 닫힘
  useEffect(() => { setOpen(null); }, [pathname, searchParams]);

  const dashActive = pathname === '/' && !searchParams.get('market');

  return (
    <nav ref={ref} className="relative flex border-b border-[var(--border)] mb-6 overflow-x-auto no-scrollbar">
      {/* 대시보드 (단일 링크) */}
      <Link href={DASHBOARD.href}
        style={dashActive ? { borderColor: 'var(--nav-active)' } : undefined}
        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
          dashActive ? 'text-[var(--text)] font-semibold' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
        }`}>
        {DASHBOARD.label}
      </Link>

      {/* 그룹 드롭다운 */}
      {GROUPS.map((g) => {
        const groupActive = g.matchFn(pathname, searchParams);
        const isOpen = open === g.label;
        return (
          <div key={g.label} className="relative">
            <button
              onClick={() => setOpen(isOpen ? null : g.label)}
              style={groupActive ? { borderColor: 'var(--nav-active)' } : undefined}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap inline-flex items-center gap-1 ${
                groupActive ? 'text-[var(--text)] font-semibold' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {g.label}
              <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isOpen && (
              <div className="absolute z-50 top-full left-0 mt-1 min-w-[240px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl overflow-hidden">
                {g.items.map((it) => {
                  // 항목 자체가 활성인지 (대략적: href가 현재 경로와 일치)
                  const itemHref = it.href.split('?')[0];
                  const itemQuery = it.href.includes('?') ? new URLSearchParams(it.href.split('?')[1]) : null;
                  const itemActive =
                    pathname.startsWith(itemHref) &&
                    (!itemQuery || itemQuery.get('market') === searchParams.get('market'));
                  return (
                    <Link key={it.href} href={it.href}
                      className={`block px-4 py-2.5 text-sm transition-colors border-l-2 ${
                        itemActive
                          ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                          : 'border-transparent text-[var(--text)] hover:bg-white/5'
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
    </nav>
  );
}

export default function NavTabs() {
  return (
    <Suspense fallback={
      <nav className="flex border-b border-[var(--border)] mb-6 overflow-x-auto no-scrollbar">
        <span className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-[var(--text-muted)] whitespace-nowrap">대시보드</span>
        {GROUPS.map((g) => (
          <span key={g.label} className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-[var(--text-muted)] whitespace-nowrap">
            {g.label}
          </span>
        ))}
      </nav>
    }>
      <NavTabsInner />
    </Suspense>
  );
}
