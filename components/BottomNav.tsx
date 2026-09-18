'use client';

/**
 * 모바일 하단 탭바 — 홈 · 시장 · 분석 · 관리 · 자산 (md 미만).
 * 탭 = lib/menu MENU 5섹션(단일 소스). 탭을 누르면 섹션의 첫 화면으로, 섹션 안 이동은 상단 밑줄 탭이 맡는다.
 * 섹션 밖 드릴다운(종목·코인 상세, 보조 도구)은 그룹의 tabExtra 로 어느 탭에서 왔는지 강조를 유지한다.
 */
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { MENU, ICON } from '@/lib/menu';

function BottomNavInner() {
  const pathname = usePathname();
  const q = useSearchParams();
  const activeKey = MENU.find((g) => g.matchFn(pathname, q))?.key ?? null;

  return (
    <nav className="app-tabbar md:hidden" aria-label="주요 메뉴">
      {MENU.map((g) => {
        const on = activeKey === g.key;
        return (
          <Link key={g.key} href={g.items[0].href} className={`app-tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
            <span className="ti">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={ICON[g.navIcon]} />
              </svg>
            </span>
            <span>{g.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function BottomNav() {
  return (
    <Suspense fallback={<nav className="app-tabbar md:hidden" aria-hidden />}>
      <BottomNavInner />
    </Suspense>
  );
}
