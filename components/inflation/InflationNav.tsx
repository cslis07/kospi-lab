'use client';

/**
 * /inflation 허브 공통 서브내비 — nowflation 클론의 섹션 nav 를 우리 IA(드릴다운) 안에서 재현.
 * 가로 스크롤 알약. 섹션이 늘면 SECTIONS 에만 추가한다(Stage A→F).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface InflationSection { href: string; label: string }

/** 섹션 목록(단일 소스). Stage A: 게이지·오늘 왜·CPI 격차·vs Truflation·리드 테스트 */
export const SECTIONS: InflationSection[] = [
  { href: '/inflation', label: '게이지' },
  { href: '/inflation/why', label: '오늘 왜' },
  { href: '/inflation/gap', label: 'CPI 격차' },
  { href: '/inflation/truflation', label: 'vs Truflation' },
  { href: '/inflation/lead', label: '리드 테스트' },
];

export default function InflationNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="실시간 물가 섹션" className="-mx-1 mb-4 overflow-x-auto no-scrollbar">
      <ul className="flex gap-1.5 px-1 w-max">
        {SECTIONS.map((s) => {
          const active = pathname === s.href;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-block whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold border transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent-ink)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
