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
import { MENU, ICON, GUIDE, activeItem, itemIsActive, type MenuItem } from '@/lib/menu';
import BottomSheet from '@/components/ui/BottomSheet';

/** 모바일 밑줄 탭 최대 칸 수 — 넘으면 앞 (MAX−1)개 + '더보기' 시트(390px 폭에 4~5칸이 한 화면에 들어간다) */
const U_TAB_MAX = 5;

/** 상단 알약 = 5섹션(MENU) + '더보기' 1개(도구 대시보드 /tools 로 바로 이동, 항목 1개라 알약=링크). */
const NAV_GROUPS: { key: string; label: string; navIcon: string; items: MenuItem[] }[] = [
  ...MENU.map((g) => ({ key: g.key, label: g.label, navIcon: g.navIcon, items: g.items })),
  { key: 'more', label: '더보기', navIcon: 'tools', items: [{ href: '/tools', label: '더보기', icon: 'tools' }] },
];

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
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShownGroup(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { setShownGroup(null); setMoreOpen(false); }, [pathname, searchParams]);

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
  // 더보기 등 보조 그룹도 현재 경로가 속하면 알약 강조·칩 자동 노출
  const activeNav = NAV_GROUPS.find((g) => g.items.some((it) => itemIsActive(it, pathname, searchParams)))?.key ?? null;
  const shown = shownGroup ?? hit?.group.key ?? tabGroup?.key ?? activeNav ?? null;
  const shownItems = NAV_GROUPS.find((g) => g.key === shown)?.items ?? null;

  return (
    <>
      {/* ── 모바일: 섹션 밑줄 탭 — 항목이 많으면 앞 4개(+지금 화면) + '더보기' 시트. 페이지 이동 링크라 role=tab 대신 aria-current ── */}
      {hit && hit.group.items.length > 1 && (() => {
        const items = hit.group.items;
        const over = items.length > U_TAB_MAX;
        const head = over ? items.slice(0, U_TAB_MAX - 1) : items;
        const rest = over ? items.slice(U_TAB_MAX - 1) : [];
        const cur = rest.find((it) => itemIsActive(it, pathname, searchParams));
        const shownTabs = cur ? [...head, cur] : head;
        return (
          <div className="u-tabs-wrap md:hidden">
            <nav className="u-tabs" aria-label={`${hit.group.label} 메뉴`}>
              {shownTabs.map((it) => {
                const on = itemIsActive(it, pathname, searchParams);
                return (
                  <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined} className={`u-tab ${on ? 'on' : ''}`}>
                    {it.label}
                  </Link>
                );
              })}
              {rest.length > 0 && (
                <button type="button" className="u-tab u-tab-more" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
                  더보기 <span aria-hidden>▾</span>
                </button>
              )}
            </nav>
            {rest.length > 0 && (
              <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={`${hit.group.label} 더보기`}>
                <div className="grid grid-cols-1 gap-2">
                  {rest.map((it) => {
                    const on = itemIsActive(it, pathname, searchParams);
                    return (
                      <Link key={it.href} href={it.href} onClick={() => setMoreOpen(false)} aria-current={on ? 'page' : undefined}
                        className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border bg-[var(--bg-card)] ${on ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}>
                        <span className="w-9 h-9 rounded-xl grid place-items-center bg-[var(--accent-soft)] text-[var(--accent)] shrink-0"><NavIcon name={it.icon} /></span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold text-[var(--text)]">{it.label}</span>
                          {it.desc && <span className="block text-[12px] text-[var(--text-muted)] mt-0.5">{it.desc}</span>}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </BottomSheet>
            )}
          </div>
        );
      })()}

      {/* ── 데스크탑: 섹션 알약 + 하위 칩 (md+) ── */}
      <nav className="hidden md:block relative mb-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="topnav">
            {NAV_GROUPS.map((g) => {
              // 항목이 하나뿐인 섹션(자산)은 서브칩 단계 없이 알약을 바로 링크로 → 한 번에 진입
              if (g.items.length === 1) {
                const it = g.items[0];
                const on = itemIsActive(it, pathname, searchParams);
                return (
                  <Link key={g.key} href={it.href} className={`navlink ${on ? 'active' : ''}`}>
                    <NavIcon name={g.navIcon} />
                    {g.label}
                  </Link>
                );
              }
              const childActive = g.items.some((it) => itemIsActive(it, pathname, searchParams));
              return (
                <button key={g.key} type="button"
                  onClick={() => setShownGroup(shown === g.key ? null : g.key)}
                  className={`navlink ${shown === g.key || childActive ? 'active' : ''}`}>
                  <NavIcon name={g.navIcon} />
                  {g.label}
                  <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              );
            })}
          </div>
          <a href={GUIDE.href} className="navlink ml-auto !bg-transparent">
            <NavIcon name={GUIDE.icon} />
            {GUIDE.label}
          </a>
        </div>

        {shownItems && shownItems.length > 1 && (
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
