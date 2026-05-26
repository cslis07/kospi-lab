'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: '대시보드', href: '/' },
  { label: '뉴스 소식', href: '/news' },
];

export default function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {TABS.map((tab) => {
        const active =
          tab.href === '/'
            ? pathname === '/' || pathname.startsWith('/stock')
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              active
                ? 'text-white bg-white/10'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/5'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
