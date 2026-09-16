'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState, useRef, useEffect } from 'react';
import HomeMenu from '@/components/HomeMenu';
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
  const [mobileOpen, setMobileOpen]   = useState(false);
  // 데스크탑: 사용자가 알약을 눌러 미리 펼친 그룹(라우트 변경 시 초기화)
  const [shownGroup, setShownGroup]   = useState<string | null>(null);
  // 바텀시트 스와이프-다운 닫기용 오프셋
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const ref = useRef<HTMLElement>(null);

  // ESC → 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMobileOpen(false); setShownGroup(null); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // 라우트 변경 시 자동 닫힘 / 펼친 그룹 초기화
  useEffect(() => { setMobileOpen(false); setShownGroup(null); }, [pathname, searchParams]);

  // 팝업 열림 동안 배경 스크롤 잠금 + 드래그 오프셋 초기화
  useEffect(() => {
    if (!mobileOpen) return;
    setDragY(0);
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

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
  const activeGroupKey = MENU.find((g) => g.matchFn(pathname, searchParams))?.key ?? null;

  // 데스크탑에서 서브칩으로 펼쳐 보일 그룹: 사용자가 누른 것 우선, 없으면 현재 활성 그룹
  const shown = shownGroup ?? activeGroupKey;
  const shownItems = MENU.find((g) => g.key === shown)?.items ?? null;

  return (
    <nav ref={ref} className="relative mb-6">
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

        {/* 서브칩 — 펼친(또는 활성) 그룹의 하위 메뉴 */}
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

      {/* ── 모바일: 메뉴 버튼 → 바텀시트 팝업 (md 미만) ── */}
      <div className="md:hidden">
        <button type="button" onClick={() => setMobileOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-sm active:scale-[.99] transition-transform">
          <span className="flex items-center gap-2 font-semibold text-[var(--text)]">
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            메뉴
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {dashActive ? DASHBOARD.label : (MENU.find((g) => g.key === activeGroupKey)?.label ?? '전체 메뉴')}
          </span>
        </button>
      </div>

      {/* 팝업 (바텀시트) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[100]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm mfade" onClick={() => setMobileOpen(false)} />
          <div
            className={`absolute inset-x-0 bottom-0 flex flex-col max-h-[88vh] rounded-t-3xl bg-[var(--bg-card)] border-t border-[var(--border)] shadow-[var(--shadow-card)] ${dragY === 0 ? 'msheet' : ''}`}
            style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragging.current ? 'none' : 'transform .25s cubic-bezier(.4,0,.2,1)' }}
          >
            <div
              className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3 touch-none select-none"
              onTouchStart={(e) => { startY.current = e.touches[0].clientY; dragging.current = true; }}
              onTouchMove={(e) => { if (dragging.current) setDragY(Math.max(0, e.touches[0].clientY - startY.current)); }}
              onTouchEnd={() => { dragging.current = false; if (dragY > 110) setMobileOpen(false); else setDragY(0); }}
            >
              <div className="mx-auto absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-[var(--border)]" />
              <span className="text-base font-bold text-[var(--text)]">메뉴</span>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="닫기"
                className="w-8 h-8 grid place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] active:scale-90 transition-transform">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-8 pt-1">
              <Link href={DASHBOARD.href} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 mb-5 px-4 py-3 rounded-2xl text-sm font-semibold ${
                  dashActive ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text)]'
                }`}>
                <NavIcon name={DASHBOARD.icon} className="w-5 h-5" />
                대시보드 홈
              </Link>
              <HomeMenu onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

export default function NavTabs() {
  return (
    <Suspense fallback={
      <nav className="border-b border-[var(--border)] mb-6">
        <div className="px-4 py-3 text-sm text-[var(--text-muted)]">메뉴 로딩…</div>
      </nav>
    }>
      <NavTabsInner />
    </Suspense>
  );
}
