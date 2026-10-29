'use client';

/**
 * 왼쪽 사이드바(lg+, 2026-10-29 대시보드형 디자인) — 참고 이미지의 남색 사이드 메뉴.
 * 메뉴는 lib/menu 단일 소스: 5섹션(MENU) + 더보기 묶음(TOOL_SECTIONS·EXTRAS). 항목이 여럿인 섹션은 펼침(지금 화면이 속하면 자동 펼침).
 * 맨 아래 '실시간 시세'(BTC·ETH·테더 원화) — 참고 이미지의 Live Gold Rate 자리. 모바일은 기존 하단 탭·앱바 그대로.
 */
import Link from 'next/link';
import useSWR from 'swr';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { MENU, EXTRAS, TOOL_SECTIONS, ICON, GUIDE, itemIsActive, type MenuItem } from '@/lib/menu';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function Ic({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

function Group({ label, icon, items, href, pathname, q }: { label: string; icon: string; items: MenuItem[]; href?: string; pathname: string; q: URLSearchParams }) {
  const active = items.some((it) => itemIsActive(it, pathname, q));
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? active;
  if (items.length === 1 || href) {
    const it = items[0];
    return (
      <Link href={href ?? it.href} className={`sn-item ${active ? 'on' : ''}`} aria-current={active ? 'page' : undefined}>
        <Ic name={icon} />{label}
      </Link>
    );
  }
  return (
    <div>
      <button type="button" onClick={() => setOpen(!shown)} aria-expanded={shown} className={`sn-item ${active && !shown ? 'on' : ''}`}>
        <Ic name={icon} />{label}
        <svg className="ml-auto !w-3.5 !h-3.5 opacity-60 transition-transform" style={{ transform: shown ? 'rotate(90deg)' : 'none' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {shown && (
        <div className="sn-sub">
          {items.map((it) => {
            const on = itemIsActive(it, pathname, q);
            return <Link key={it.href} href={it.href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>{it.label}</Link>;
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
      <span className="text-[#9fabcf]">{label}</span>
      <span className="text-white font-semibold">{v}{ch != null && <span className="ml-1.5 text-[11px]" style={{ color: ch >= 0 ? '#ff7a6b' : '#7fa8ff' }}>{ch >= 0 ? '▲' : '▼'}{Math.abs(ch).toFixed(2)}%</span>}</span>
    </div>
  );
  return (
    <div className="sn-live">
      <p className="text-[12px] font-bold text-white mb-1.5">실시간 시세</p>
      {c?.BTC ? row('BTC', `$${Math.round(c.BTC.price).toLocaleString('en-US')}`, c.BTC.changeRate) : row('BTC', '—')}
      {c?.ETH ? row('ETH', `$${c.ETH.price.toLocaleString('en-US', { maximumFractionDigits: 1 })}`, c.ETH.changeRate) : row('ETH', '—')}
      {row('USDT', fx?.price ? `₩${fx.price.toLocaleString('ko-KR')}` : '—')}
    </div>
  );
}

function SideNavInner() {
  const pathname = usePathname();
  const q = useSearchParams();
  return (
    <aside className="side-nav" aria-label="사이드 메뉴">
      <Link href="/" className="sn-logo" aria-label="홈으로">
        <span aria-hidden className="grid place-items-center w-9 h-9 rounded-xl text-[15px] font-black text-white" style={{ background: 'linear-gradient(135deg,#3b74ff,#2453e0)' }}>K</span>
        <span className="leading-tight">
          <span className="block font-display text-[15px] font-extrabold tracking-tight">KOSPI LAB</span>
          <span className="block text-[10.5px] text-[#9fabcf]">투자 리스크 관리</span>
        </span>
      </Link>
      <nav className="sn-scroll">
        {MENU.map((g) => (
          <Group key={g.key} label={g.key === 'home' ? '대시보드' : g.label} icon={g.navIcon} items={g.items} pathname={pathname} q={q} />
        ))}
        <p className="sn-label">도구</p>
        {TOOL_SECTIONS.map((s) => {
          const items = EXTRAS.filter((x) => !x.hidden && x.section === s.key);
          return items.length ? <Group key={s.key} label={s.label.replace(/^\S+\s/, '')} icon={items[0].icon} items={items} pathname={pathname} q={q} /> : null;
        })}
        <Link href="/tools" className={`sn-item ${pathname === '/tools' ? 'on' : ''}`}><Ic name="tools" />더보기 전체</Link>
        <a href={GUIDE.href} className="sn-item"><Ic name={GUIDE.icon} />{GUIDE.label}</a>
      </nav>
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
