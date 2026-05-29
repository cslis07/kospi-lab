'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: '대시보드', href: '/' },
  { label: '가상투자', href: '/virtual' },
  { label: '스크리너', href: '/screener' },
  { label: '캘린더',   href: '/calendar' },
  { label: '공시',     href: '/dart' },
  { label: '뉴스',     href: '/news' },
];

export default function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex border-b border-[var(--border)] mb-6 overflow-x-auto no-scrollbar">
      {TABS.map((tab) => {
        const active =
          tab.href === '/'
            ? pathname === '/' || pathname.startsWith('/stock') || pathname.startsWith('/crypto')
            : pathname.startsWith(tab.href);
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
