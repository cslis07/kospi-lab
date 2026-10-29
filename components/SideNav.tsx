'use client';

/**
 * 왼쪽 사이드바(lg+) — KOSPI LAB 2.0(기획서 §3.3). 펼침 236px · 접힘 72px(아이콘만, 이 기기에만 기억 'kl-side').
 * 메뉴는 lib/menu 단일 소스: 1차 메뉴 6개(MENU) — 그룹은 한 번에 하나만 펼치고(지금 화면이 속한 그룹 자동), 그룹 안 소제목(sub).
 * 아래 '도구'(TOOL_SECTIONS) · 하단 전체 도구(/tools) · 도움말(이용가이드) · 실시간 시세(BTC·ETH·테더 원화).
 * 모바일·태블릿(<1024)은 하단 탭·앱바 그대로.
 */
import Link from 'next/link';
import useSWR from 'swr';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { MENU, EXTRAS, TOOL_SECTIONS, ICON, GUIDE, itemIsActive, type MenuItem } from '@/lib/menu';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const COLLAPSE_KEY = 'kl-side'; // 'min' = 접힘. kospi-lab- 접두어가 아니라 클라우드 동기화 대상 아님(기기별)

function Ic({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

function Group({ gkey, label, icon, items, open, onToggle, pathname, q }: {
  gkey: string; label: string; icon: string; items: MenuItem[]; open: boolean; onToggle: (k: string) => void; pathname: string; q: URLSearchParams;
}) {
  const active = items.some((it) => itemIsActive(it, pathname, q));
  if (items.length === 1) {
    const it = items[0];
    return (
      <Link href={it.href} className={`sn-item ${active ? 'on' : ''}`} aria-current={active ? 'page' : undefined} title={label}>
        <Ic name={icon} /><span className="sn-t">{label}</span>
      </Link>
    );
  }
  return (
    <div className="sn-group">
      <button type="button" onClick={() => onToggle(gkey)} aria-expanded={open} title={label} className={`sn-item ${active ? 'in' : ''}`}>
        <Ic name={icon} /><span className="sn-t">{label}</span>
        <svg className="sn-chev" style={{ transform: open ? 'rotate(90deg)' : 'none' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {open && (
        <div className="sn-sub">
          {items.map((it) => {
            const on = itemIsActive(it, pathname, q);
            return (
              <div key={it.href}>
                {it.sub && <p className="sn-subhead">{it.sub}</p>}
                <Link href={it.href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>{it.label}</Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Live() {
  const { data: c } = useSWR<Record<string, { price: number; changeRate: number }>>('/api/crypto/batch?symbols=BTC,ETH', fetcher, { refreshInterval: 30_000 });
  const { data: fx } = useSWR<{ price: number | null }>('/api/crypto/usdt-krw', fetcher, { refreshInterval: 60_000 });
  const row = (label: string, v: string, ch?: number) => (
    <div className="flex items-center justify-between text-[12px] tabular-nums py-0.5">
      <span className="text-[var(--sn-muted)]">{label}</span>
      <span className="text-[var(--sn-ink)] font-semibold">{v}{ch != null && <span className="ml-1.5 text-[11px]" style={{ color: ch >= 0 ? 'var(--up)' : 'var(--down)' }}>{ch >= 0 ? '▲' : '▼'}{Math.abs(ch).toFixed(2)}%</span>}</span>
    </div>
  );
  return (
    <div className="sn-live">
      <p className="text-[11px] font-semibold text-[var(--sn-muted)] mb-1.5 flex items-center gap-1.5"><i className="sn-dot" aria-hidden />실시간 시세</p>
      {c?.BTC ? row('BTC', `$${Math.round(c.BTC.price).toLocaleString('en-US')}`, c.BTC.changeRate) : row('BTC', '—')}
      {c?.ETH ? row('ETH', `$${c.ETH.price.toLocaleString('en-US', { maximumFractionDigits: 1 })}`, c.ETH.changeRate) : row('ETH', '—')}
      {row('USDT', fx?.price ? `₩${fx.price.toLocaleString('ko-KR')}` : '—')}
    </div>
  );
}

function SideNavInner() {
  const pathname = usePathname();
  const q = useSearchParams();
  const activeKey = MENU.find((g) => g.items.some((it) => itemIsActive(it, pathname, q)))?.key
    ?? EXTRAS.find((it) => itemIsActive(it, pathname, q))?.section ?? null;
  // 펼친 그룹 하나 — 이 화면에서 누른 그룹(경로가 바뀌면 무효 → 지금 화면의 그룹). 다른 그룹을 누르면 그것만 펼친다(한 번에 하나)
  const [picked, setPicked] = useState<{ path: string; key: string } | null>(null);
  const openKey = picked && picked.path === pathname ? picked.key : null;
  const setOpenKey = (key: string) => setPicked({ path: pathname, key });
  // 접힘은 html.side-min 클래스가 진실원(layout 인라인 스크립트가 페인트 전에 복원) — React 상태로 들고 있지 않는다
  const shownKey = openKey ?? activeKey;
  const toggle = (k: string) => setOpenKey(shownKey === k ? '' : k);
  const flip = () => {
    const v = !document.documentElement.classList.contains('side-min');
    document.documentElement.classList.toggle('side-min', v);
    try { localStorage.setItem(COLLAPSE_KEY, v ? 'min' : ''); } catch {}
  };

  return (
    <aside className="side-nav" aria-label="사이드 메뉴">
      <div className="sn-top">
        <Link href="/" className="sn-logo" aria-label="KOSPI LAB 홈으로">
          <span aria-hidden className="sn-mark">K</span>
          <span className="sn-t leading-tight">
            <span className="block text-[15px] font-bold tracking-tight text-[var(--sn-ink)]">KOSPI LAB</span>
            <span className="block text-[10.5px] text-[var(--sn-muted)]">투자 리스크 관리</span>
          </span>
        </Link>
        <button type="button" onClick={flip} className="sn-collapse" aria-label="사이드바 접기·펼치기" title="접기·펼치기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 5h16v14H4zM9 5v14M16 10l-2 2 2 2" />
          </svg>
        </button>
      </div>
      <nav className="sn-scroll">
        {MENU.map((g) => (
          <Group key={g.key} gkey={g.key} label={g.label} icon={g.navIcon} items={g.items} open={shownKey === g.key} onToggle={(k) => { if (document.documentElement.classList.contains('side-min')) { flip(); setOpenKey(k); } else toggle(k); }} pathname={pathname} q={q} />
        ))}
        <p className="sn-label">도구</p>
        {TOOL_SECTIONS.map((s) => {
          const items = EXTRAS.filter((x) => !x.hidden && x.section === s.key);
          return items.length ? <Group key={s.key} gkey={s.key} label={s.label} icon={items[0].icon} items={items} open={shownKey === s.key} onToggle={(k) => { if (document.documentElement.classList.contains('side-min')) { flip(); setOpenKey(k); } else toggle(k); }} pathname={pathname} q={q} /> : null;
        })}
      </nav>
      <div className="sn-foot">
        <Link href="/tools" className={`sn-item ${pathname === '/tools' ? 'on' : ''}`} title="전체 도구"><Ic name="tools" /><span className="sn-t">전체 도구</span></Link>
        <a href={GUIDE.href} className="sn-item" title="도움말"><Ic name={GUIDE.icon} /><span className="sn-t">도움말</span></a>
      </div>
      <Live />
    </aside>
  );
}

export default function SideNav() {
  return (
    <Suspense fallback={<aside className="side-nav" aria-hidden />}>
      <SideNavInner />
    </Suspense>
  );
}
