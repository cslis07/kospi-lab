'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { MENU, ICON, DASHBOARD, GUIDE, hrefIsActive } from '@/lib/menu';

/* 작은 라인 아이콘 */
function NavIcon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

function NavTabsInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  // 데스크탑: 사용자가 알약을 눌러 미리 펼친 그룹(라우트 변경 시 초기화)
  const [shownGroup, setShownGroup] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShownGroup(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { setShownGroup(null); }, [pathname, searchParams]);

  // 방문 빈도 기록(자주 쓰는 기능 자동화) — 라우트 바뀔 때 현재 경로 카운트 +1
  useEffect(() => {
    try {
      const market = searchParams.get('market');
      const key = pathname + (market ? `?market=${market}` : '');
      if (key === '/') return;
      const raw = localStorage.getItem('kl:visits');
      const map: Record<string, number> = raw ? JSON.parse(raw) : {};
      map[key] = (map[key] ?? 0) + 1;
      localStorage.setItem('kl:visits', JSON.stringify(map));
    } catch { /* localStorage 불가 환경 무시 */ }
  }, [pathname, searchParams]);

  const dashActive = pathname === '/' && !searchParams.get('market');
  const activeGroup = MENU.find((g) => g.matchFn(pathname, searchParams)) ?? null;

  // 데스크탑에서 서브칩으로 펼쳐 보일 그룹: 사용자가 누른 것 우선, 없으면 현재 활성 그룹
  const shown = shownGroup ?? activeGroup?.key ?? null;
  const shownItems = MENU.find((g) => g.key === shown)?.items ?? null;

  // 모바일: 하단 탭바가 그룹 이동을 맡으므로 여기선 활성 그룹의 하위 항목만 가로 칩으로.
  // '정보·도구'는 항목이 많아 더보기 탭이 대신하므로 칩을 내지 않는다.
  const mobileItems = activeGroup && activeGroup.key !== 'more' ? activeGroup.items : null;

  return (
    <nav className={`relative ${mobileItems ? 'mb-3' : 'mb-0'} md:mb-6`}>
      {/* ── 데스크탑: 알약 세그먼트 탭 + 서브칩 (md+) ── */}
      <div className="hidden md:block space-y-3">
        <div className="flex items-center gap-3">
          <div className="topnav">
            <Link href={DASHBOARD.href} className={`navlink ${dashActive ? 'active' : ''}`}>
              <NavIcon name={DASHBOARD.icon} />
              {DASHBOARD.label}
            </Link>
            {MENU.map((g) => (
              <button key={g.key} type="button"
                onClick={() => setShownGroup(shown === g.key ? null : g.key)}
                className={`navlink ${shown === g.key ? 'active' : ''}`}>
                <NavIcon name={g.navIcon} />
                {g.label}
                <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            ))}
          </div>
          <a href={GUIDE.href} className="navlink ml-auto !bg-transparent">
            <NavIcon name={GUIDE.icon} />
            {GUIDE.label}
          </a>
        </div>

        {shownItems && (
          <div className="chip-row">
            {shownItems.map((it) => (
              <Link key={it.href} href={it.href} title={it.desc}
                className={`chip ${hrefIsActive(it.href, pathname, searchParams) ? 'active' : ''}`}>
                {it.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── 모바일: 활성 그룹 서브칩 가로 스크롤 (md 미만) ── */}
      {mobileItems && (
        <div className="md:hidden chip-scroll" role="tablist" aria-label={`${activeGroup!.label} 하위 메뉴`}>
          {mobileItems.map((it) => (
            <Link key={it.href} href={it.href} role="tab"
              aria-selected={hrefIsActive(it.href, pathname, searchParams)}
              className={`chip ${hrefIsActive(it.href, pathname, searchParams) ? 'active' : ''}`}>
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

export default function NavTabs() {
  return (
    <Suspense fallback={<nav className="hidden md:block border-b border-[var(--border)] mb-6"><div className="px-4 py-3 text-sm text-[var(--text-muted)]">메뉴 로딩…</div></nav>}>
      <NavTabsInner />
    </Suspense>
  );
}
