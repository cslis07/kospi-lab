'use client';

/**
 * 모바일 하단 탭바(md 미만) — 홈 · 시장 · 분석 · 복기 · 더보기 (2.0 기획서 §6, lib/menu BOTTOM_TABS).
 * 탭은 1차 메뉴 그룹에 연결되고, 그룹 안 이동은 상단 밑줄 탭이 맡는다. 더보기 = 전체 메뉴(/tools — 인사이트·내 자산·도구).
 * 드릴다운(종목·코인 상세, 보조 도구)은 그룹의 tabExtra 로 어느 탭에서 왔는지 강조를 유지한다.
 */
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { MENU, BOTTOM_TABS, EXTRAS, ICON, hrefIsActive } from '@/lib/menu';

function BottomNavInner() {
  const pathname = usePathname();
  const q = useSearchParams();
  const groupKey = MENU.find((g) => g.matchFn(pathname, q))?.key ?? null;
  // 그룹 밖 화면(전체 메뉴·도구 허브 항목)은 '더보기' 강조
  const inTools = pathname === '/tools' || EXTRAS.some((e) => hrefIsActive(e.href, pathname, q));
  const activeTab = BOTTOM_TABS.find((t) => (groupKey ? t.groups.includes(groupKey) : false))?.key ?? (inTools ? 'more' : null);

  return (
    <nav className="app-tabbar md:hidden" aria-label="주요 메뉴">
      {BOTTOM_TABS.map((t) => {
        const on = activeTab === t.key;
        return (
          <Link key={t.key} href={t.href} className={`app-tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
            <span className="ti">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={ICON[t.icon]} />
              </svg>
            </span>
            <span>{t.label}</span>
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
