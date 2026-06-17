'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const TABS = [
  {
    label: '대시보드',
    href: '/',
    matchFn: (p: string, q: URLSearchParams) => p === '/' && !q.get('market'),
  },
  {
    label: '국내주식',
    href: '/domestic',
    matchFn: (p: string) => p.startsWith('/domestic'),
  },
  {
    label: '해외주식',
    href: '/overseas',
    matchFn: (p: string) => p.startsWith('/overseas'),
  },
  {
    label: '코인',
    href: '/my-stocks?market=crypto',
    matchFn: (p: string, q: URLSearchParams) =>
      p.startsWith('/my-stocks') && q.get('market') === 'crypto',
  },
  {
    label: '내 주식',
    href: '/my-stocks',
    matchFn: (p: string, q: URLSearchParams) =>
      p.startsWith('/my-stocks') && !q.get('market'),
  },
  {
    label: '리포트',
    href: '/report',
    matchFn: (p: string) => p.startsWith('/report'),
  },
  {
    label: '뉴스',
    href: '/news',
    matchFn: (p: string) => p.startsWith('/news'),
  },
  {
    label: '공시',
    href: '/dart',
    matchFn: (p: string) => p.startsWith('/dart'),
  },
  {
    label: '캘린더',
    href: '/calendar',
    matchFn: (p: string) => p.startsWith('/calendar'),
  },
  {
    label: '투자설계',
    href: '/invest',
    matchFn: (p: string) => p.startsWith('/invest'),
  },
  {
    label: '세제혜택',
    href: '/tax',
    matchFn: (p: string) => p.startsWith('/tax'),
  },
  {
    label: '시뮬레이션',
    href: '/simulate',
    matchFn: (p: string) => p.startsWith('/simulate'),
  },
  {
    label: '증권사비교',
    href: '/brokerage',
    matchFn: (p: string) => p.startsWith('/brokerage'),
  },
];

function NavTabsInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav className="flex border-b border-[var(--border)] mb-6 overflow-x-auto no-scrollbar">
      {TABS.map((tab) => {
        const active = tab.matchFn(pathname, searchParams);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={active ? { borderColor: 'var(--nav-active)' } : undefined}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              active
                ? 'text-[var(--text)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function NavTabs() {
  return (
    <Suspense fallback={
      <nav className="flex border-b border-[var(--border)] mb-6 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href}
            className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-[var(--text-muted)] whitespace-nowrap">
            {tab.label}
          </Link>
        ))}
      </nav>
    }>
      <NavTabsInner />
    </Suspense>
  );
}
