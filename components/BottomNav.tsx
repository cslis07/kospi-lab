'use client';

/**
 * 모바일 하단 탭바 — 네이티브 앱 셸의 핵심(md 미만에서만).
 * 탭은 lib/menu 4그룹 + 홈 + 더보기. 그룹 탭은 그룹의 첫 항목으로 이동하고,
 * 그룹 안 이동은 NavTabs의 서브칩(가로 스크롤)이 맡는다.
 * 활성 판정은 그룹 matchFn(단일 소스) — 라우트가 바뀌어도 여기를 손볼 일이 없다.
 */
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { MENU, ICON } from '@/lib/menu';

function TabIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

function BottomNavInner() {
  const pathname = usePathname();
  const q = useSearchParams();

  const isHome = pathname === '/';
  const isMore = pathname.startsWith('/more');
  // 정보·도구 그룹(key 'more')은 '더보기' 탭에 흡수 — 탭은 4개 그룹 중 앞 3개만
  const tabGroups = MENU.filter((g) => g.key !== 'more');
  const moreGroup = MENU.find((g) => g.key === 'more');
  const moreActive = isMore || !!moreGroup?.matchFn(pathname, q);

  const tabs = [
    { key: 'home', label: '홈', icon: 'home', href: '/', on: isHome },
    ...tabGroups.map((g) => ({
      key: g.key, label: g.label.replace(' ', ''), icon: g.navIcon,
      href: g.items[0].href, on: g.matchFn(pathname, q),
    })),
    { key: 'more', label: '더보기', icon: 'tools', href: '/more', on: moreActive },
  ];

  return (
    <nav className="app-tabbar md:hidden" aria-label="주요 메뉴">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`app-tab ${t.on ? 'on' : ''}`} aria-current={t.on ? 'page' : undefined}>
          <span className="ti"><TabIcon name={t.icon} /></span>
          <span>{t.label}</span>
        </Link>
      ))}
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
