'use client';

/**
 * /inflation 허브 공통 서브내비 — nowflation 클론의 섹션 nav 를 우리 IA(드릴다운) 안에서 재현.
 * 가로 스크롤 알약, 그룹 바뀌는 지점에 세로 구분선. 섹션이 늘면 SECTIONS 에만 추가한다(Stage A→F).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface InflationSection { href: string; label: string; group: string }

/** 섹션 목록(단일 소스). A: 게이지 그룹 · B: 예측·Fed 그룹 */
export const SECTIONS: InflationSection[] = [
  { href: '/inflation', label: '게이지', group: 'gauge' },
  { href: '/inflation/why', label: '오늘 왜', group: 'gauge' },
  { href: '/inflation/gap', label: 'CPI 격차', group: 'gauge' },
  { href: '/inflation/truflation', label: 'vs Truflation', group: 'gauge' },
  { href: '/inflation/lead', label: '리드 테스트', group: 'gauge' },
  { href: '/inflation/scoreboard', label: '스코어보드', group: 'forecast' },
  { href: '/inflation/calendar', label: '발표 일정', group: 'forecast' },
  { href: '/inflation/markets', label: '예측시장', group: 'forecast' },
  { href: '/inflation/fed', label: 'Fed watch', group: 'forecast' },
  { href: '/inflation/brief', label: '데일리 브리핑', group: 'brief' },
  { href: '/inflation/analysis', label: '발표일 분석', group: 'brief' },
  { href: '/inflation/articles', label: '경제 기사', group: 'brief' },
  { href: '/inflation/prices', label: '품목별 가격', group: 'prices' },
  { href: '/inflation/cart', label: '장바구니', group: 'prices' },
  { href: '/inflation/jobs', label: '고용', group: 'economy' },
  { href: '/inflation/heatcheck', label: '경기 열지수', group: 'economy' },
  { href: '/inflation/quilt', label: '인플레 히트맵', group: 'economy' },
];

export default function InflationNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="실시간 물가 섹션" className="-mx-1 mb-4 overflow-x-auto no-scrollbar">
      <ul className="flex items-center gap-1.5 px-1 w-max">
        {SECTIONS.map((s, i) => {
          const active = pathname === s.href;
          const newGroup = i > 0 && SECTIONS[i - 1].group !== s.group;
          return (
            <li key={s.href} className="flex items-center gap-1.5">
              {newGroup && <span aria-hidden className="h-4 w-px bg-[var(--border)] mx-0.5" />}
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
