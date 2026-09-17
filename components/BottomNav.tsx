'use client';

/**
 * 모바일 하단 탭바 — 홈 · 매매 · [+ 플래너 FAB] · 시세 · 더보기 (md 미만).
 * 탭 그룹은 lib/menu TAB_GROUP_KEYS(단일 소스). 접힌 그룹(내 자산·정보·도구)은 '더보기' 탭이 활성 표시한다.
 * 중앙 FAB = 이 앱의 핵심 동작인 '새 매매 계획'(진입 전 손절·사이징).
 */
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { MENU, ICON, TAB_GROUP_KEYS, type MenuGroup } from '@/lib/menu';

interface TabDef { key: string; label: string; icon: string; href: string; on: boolean }

function Tab({ t }: { t: TabDef }) {
  return (
    <Link href={t.href} className={`app-tab ${t.on ? 'on' : ''}`} aria-current={t.on ? 'page' : undefined}>
      <span className="ti">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={ICON[t.icon]} />
        </svg>
      </span>
      <span>{t.label}</span>
    </Link>
  );
}

function BottomNavInner() {
  const pathname = usePathname();
  const q = useSearchParams();

  const groupTab = (g: MenuGroup): TabDef => ({
    key: g.key, label: g.label.replace(' ', ''), icon: g.navIcon, href: g.items[0].href, on: g.matchFn(pathname, q),
  });
  const byKey = (k: string) => MENU.find((g) => g.key === k)!;
  const folded = MENU.filter((g) => !TAB_GROUP_KEYS.includes(g.key));

  const left: TabDef[] = [
    { key: 'home', label: '홈', icon: 'home', href: '/', on: pathname === '/' },
    groupTab(byKey('trade')),
  ];
  const right: TabDef[] = [
    groupTab(byKey('market')),
    { key: 'more', label: '더보기', icon: 'tools', href: '/more', on: pathname.startsWith('/more') || folded.some((g) => g.matchFn(pathname, q)) },
  ];
  const fabOn = pathname.startsWith('/planner');

  return (
    <nav className="app-tabbar md:hidden" aria-label="주요 메뉴">
      {left.map((t) => <Tab key={t.key} t={t} />)}
      <div className="app-fab-slot">
        <Link href="/planner" className={`app-fab ${fabOn ? 'on' : ''}`} aria-label="새 매매 계획 (플래너)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </div>
      {right.map((t) => <Tab key={t.key} t={t} />)}
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
