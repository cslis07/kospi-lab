'use client';

/**
 * 섹션 안 내비게이션.
 * - 모바일: 앱바 바로 아래 붙는 밑줄 탭(현재 섹션의 항목들). 스크롤해도 따라온다(sticky).
 *   ⚠ sticky 는 부모 박스 안에서만 붙으므로 래퍼 없이 콘텐츠 컨테이너의 직계 자식으로 렌더한다.
 * - 데스크탑: 섹션 알약 + 하위 칩(기존 방식).
 */
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { MENU, ICON, GUIDE, activeItem, itemIsActive } from '@/lib/menu';

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
  // 데스크탑: 사용자가 알약을 눌러 미리 펼친 섹션(라우트 변경 시 초기화)
  const [shownGroup, setShownGroup] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShownGroup(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { setShownGroup(null); }, [pathname, searchParams]);

  // 방문 빈도 기록(자주 쓰는 기능 자동화)
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

  const hit = activeItem(pathname, searchParams);
  const tabGroup = MENU.find((g) => g.matchFn(pathname, searchParams)) ?? null;
  const shown = shownGroup ?? hit?.group.key ?? tabGroup?.key ?? null;
  const shownItems = MENU.find((g) => g.key === shown)?.items ?? null;

  return (
    <>
      {/* ── 모바일: 섹션 밑줄 탭 ── */}
      {hit && hit.group.items.length > 1 && (
        <div className="u-tabs-wrap md:hidden">
          <div className="u-tabs" role="tablist" aria-label={`${hit.group.label} 메뉴`}>
            {hit.group.items.map((it) => {
              const on = itemIsActive(it, pathname, searchParams);
              return (
                <Link key={it.href} href={it.href} role="tab" aria-selected={on} className={`u-tab ${on ? 'on' : ''}`}>
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 데스크탑: 섹션 알약 + 하위 칩 (md+) ── */}
      <nav className="hidden md:block relative mb-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="topnav">
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
                className={`chip ${itemIsActive(it, pathname, searchParams) ? 'active' : ''}`}>
                {it.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </>
  );
}

export default function NavTabs() {
  return (
    <Suspense fallback={<nav className="hidden md:block border-b border-[var(--border)] mb-6"><div className="px-4 py-3 text-sm text-[var(--text-muted)]">메뉴 로딩…</div></nav>}>
      <NavTabsInner />
    </Suspense>
  );
}
