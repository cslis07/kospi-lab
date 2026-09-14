'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

/* ══════════════════════════════════════════════════════════════
   모바일 홈 메뉴 — 세련된 라인 SVG 아이콘 그리드
   이모지 벽을 걷어내고 하나의 일관된 스트로크 아이콘 세트로 통일한다.
   구성: ① 자주 쓰는 기능(리스크 규율 도구) ② 그룹별 정돈 그리드.
   ══════════════════════════════════════════════════════════════ */

/* 라인 아이콘 path (viewBox 24, stroke=currentColor). 원은 arc 서브패스로 표현해 path 하나로 유지. */
const ICON: Record<string, string> = {
  domestic:   'M3 20h18M6 20v-5M10.5 20v-9M15 20v-6M19.5 20v-11',
  overseas:   'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18',
  crypto:     'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M10 7.5v9M10 7.5h3.2a2 2 0 0 1 0 4h-3.2M10 11.5h3.5a2 2 0 0 1 0 4H10M11.6 6v1.5M13.2 6v1.5M11.6 15.5v1.5M13.2 15.5v1.5',
  futures:    'M13 2L4 14h6l-1 8 9-12h-6l1-8Z',
  portfolio:  'M3 7a2 2 0 0 1 2-2h12v3M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2M16.5 12.5h.01',
  star:       'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
  bitget:     'M4 7a8 3 0 1 0 16 0a8 3 0 1 0-16 0M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  risk:       'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3ZM9.3 11.8l1.8 1.8 3.4-3.4',
  virtual:    'M9 3h6M10 3v5.5L5.3 17.4A2 2 0 0 0 7 20.5h10a2 2 0 0 0 1.7-3.1L14 8.5V3M7.5 14h9',
  analysis:   'M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-3.5-3.5M8 12l2.3-2.3 1.8 1.8L15.5 8.5',
  signal:     'M3 12h4l2.5 7 4-15 2.5 8h5',
  journal:    'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM9 3v18M12 8h4M12 12h4',
  growth:     'M3 17l6-6 4 4 8-8M15 7h6v6',
  screener:   'M3 5h18l-7 8.5V20l-4-2.5v-4L3 5Z',
  krx:        'M8.5 14L6 21l6-3 6 3-2.5-7M6 9a6 6 0 1 0 12 0a6 6 0 1 0-12 0',
  news:       'M4 5h13v14a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2V5ZM17 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2M8 8.5h6M8 12h6M8 15.5h4',
  dart:       'M7 2h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM14 2v4h4M9 12h6M9 15.5h6M9 8.5h2',
  report:     'M3 4h18M4 4v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4M12 14v5M9 19h6M8.5 10.5l2.5-3 2 2 3.5-4',
  calendar:   'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6ZM4 9.5h16M8 3v4M16 3v4',
  invest:     'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M15.5 8.5l-2.2 4.8L8.5 15.5l2.2-4.8 4.8-2.2Z',
  tax:        'M5 3h14v18l-2.5-1.8L14 21l-2-1.8L10 21l-2.5-1.8L5 21V3ZM9 8.5l6 7M9.3 9h.01M14.7 15h.01',
  simulate:   'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 6.5h8M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5v3.5M8 18h4',
  brokerage:  'M3 10l9-6 9 6M4 10h16M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18',
  guide:      'M12 6C10 4.7 7 4.2 4 4.7V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.7C17 4.2 14 4.7 12 6ZM12 6v14.5',
  planner:    'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 3v3M12 18v3M3 12h3M18 12h3',
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

/* ── 그룹 그리드 ── */
type Tile = { href: string; icon: string; label: string; external?: boolean };
type Group = { label: string; color: string; items: Tile[] };

const GROUPS: Group[] = [
  {
    label: '시장', color: 'c-blue', items: [
      { href: '/domestic',                icon: 'domestic', label: '국내주식' },
      { href: '/overseas',                icon: 'overseas', label: '해외주식' },
      { href: '/my-stocks?market=crypto', icon: 'crypto',   label: '코인' },
      { href: '/futures',                 icon: 'futures',  label: '선물' },
    ],
  },
  {
    label: '내 자산', color: 'c-green', items: [
      { href: '/portfolio', icon: 'portfolio', label: '통합자산' },
      { href: '/my-stocks', icon: 'star',      label: '내 주식' },
      { href: '/bitget',    icon: 'bitget',    label: '비트겟' },
      { href: '/risk',      icon: 'risk',      label: '통합리스크' },
      { href: '/virtual',   icon: 'virtual',   label: '가상투자' },
    ],
  },
  {
    label: '분석', color: 'c-violet', items: [
      { href: '/planner',        icon: 'planner',  label: '플래너' },
      { href: '/stock-analysis', icon: 'analysis', label: '국내분석' },
      { href: '/coin-analysis',  icon: 'signal',   label: '코인분석' },
      { href: '/journal',        icon: 'journal',  label: '매매일지' },
      { href: '/growth',         icon: 'growth',   label: '성장주' },
      { href: '/screener',       icon: 'screener', label: '스크리너' },
      { href: '/krx',            icon: 'krx',      label: 'KRX시장' },
      { href: '/news',           icon: 'news',     label: '뉴스' },
      { href: '/dart',           icon: 'dart',     label: '공시' },
      { href: '/report',         icon: 'report',   label: '리포트' },
      { href: '/calendar',       icon: 'calendar', label: '캘린더' },
    ],
  },
  {
    label: '설계', color: 'c-amber', items: [
      { href: '/invest',     icon: 'invest',    label: '투자설계' },
      { href: '/tax',        icon: 'tax',       label: '세제혜택' },
      { href: '/simulate',   icon: 'simulate',  label: '시뮬레이션' },
      { href: '/brokerage',  icon: 'brokerage', label: '증권사' },
      { href: '/guide.html', icon: 'guide',     label: '이용가이드', external: true },
    ],
  },
];

/* 전체 항목 평탄화(그룹색 유지, href 중복 제거) — 검색·자주쓰는 후보 풀 */
type FlatItem = Tile & { color: string };
const FLAT: FlatItem[] = GROUPS
  .flatMap((g) => g.items.map((it) => ({ ...it, color: g.color })))
  .filter((it, i, arr) => arr.findIndex((x) => x.href === it.href) === i);
const BY_HREF = new Map(FLAT.map((f) => [f.href, f]));

const COLOR_TO_QC: Record<string, string> = { 'c-blue': 'qc-blue', 'c-green': 'qc-green', 'c-violet': 'qc-violet', 'c-amber': 'qc-amber' };
/* 방문 데이터가 없을 때 기본 자주쓰는(이 앱의 본질: 손절·사이징·기록) + 예쁜 틴트 오버라이드 */
const DEFAULT_QUICK = ['/my-stocks', '/risk', '/coin-analysis', '/journal'];
const TINT_OVERRIDE: Record<string, string> = { '/my-stocks': 'qc-amber', '/risk': 'qc-blue', '/coin-analysis': 'qc-violet', '/journal': 'qc-green' };

const VISITS_KEY = 'kl:visits';
function readVisits(): Record<string, number> {
  try { const r = localStorage.getItem(VISITS_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
/** 방문 빈도 상위 4개(있으면) → 부족분은 기본값으로 채움 */
function pickQuick(visits: Record<string, number>): string[] {
  const ranked = FLAT
    .filter((f) => !f.external && (visits[f.href] ?? 0) > 0)
    .sort((a, b) => (visits[b.href] ?? 0) - (visits[a.href] ?? 0))
    .map((f) => f.href);
  const out: string[] = [];
  for (const h of [...ranked, ...DEFAULT_QUICK]) {
    if (!out.includes(h) && BY_HREF.has(h)) out.push(h);
    if (out.length >= 4) break;
  }
  return out;
}

/** href가 현재 라우트와 일치하는지(쿼리 market까지 정확 대조) */
function useIsActive() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const curMarket = searchParams.get('market');
  return (href: string) => {
    const p = href.split('?')[0];
    if (p === '/' || p.startsWith('http') || href.endsWith('.html')) return false;
    const q = href.includes('?') ? new URLSearchParams(href.split('?')[1]) : null;
    const itemMarket = q?.get('market') ?? null;
    return pathname.startsWith(p) && itemMarket === curMarket;
  };
}

function GridItem({ t, color, active, onNavigate }: { t: Tile; color: string; active: boolean; onNavigate?: () => void }) {
  const inner = (
    <>
      <span className={`hm-ic ${color}`}><Icon name={t.icon} /></span>
      <span className="hm-tx">{t.label}</span>
    </>
  );
  const cls = `hm-item ${active ? 'on' : ''}`;
  return t.external
    ? <a href={t.href} className={cls} onClick={onNavigate}>{inner}</a>
    : <Link href={t.href} className={cls} onClick={onNavigate}>{inner}</Link>;
}

/** 모바일 메뉴 콘텐츠 — 헤더의 메뉴 버튼이 여는 팝업 안에서 렌더링된다. onNavigate: 항목 탭 시 팝업 닫기. */
export default function HomeMenu({ onNavigate }: { onNavigate?: () => void }) {
  const isActive = useIsActive();

  // 자주 쓰는 기능 — 실제 방문 빈도(localStorage) 기반, 없으면 기본값
  const [visits, setVisits] = useState<Record<string, number>>({});
  useEffect(() => { setVisits(readVisits()); }, []);
  const quickItems = useMemo(
    () => pickQuick(visits).map((h) => {
      const f = BY_HREF.get(h)!;
      return { ...f, tint: TINT_OVERRIDE[h] ?? COLOR_TO_QC[f.color] ?? 'qc-blue' };
    }),
    [visits],
  );

  // 검색
  const [query, setQuery] = useState('');
  const qq = query.trim().toLowerCase();
  const results = qq ? FLAT.filter((f) => f.label.toLowerCase().includes(qq)) : null;

  return (
    <div className="space-y-6">
      {/* 검색 */}
      <div className="relative">
        <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-3.5-3.5" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="메뉴 검색"
          className="w-full pl-10 pr-9 py-3 rounded-2xl bg-[var(--surface-2)] border border-transparent focus:border-[var(--accent)] focus:bg-[var(--bg-card)] outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] transition-colors"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="지우기"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--border)]">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {results ? (
        /* 검색 결과 */
        <section>
          <h2 className="text-[11px] font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wide">검색 결과 {results.length}</h2>
          {results.length ? (
            <div className="hm-grid">
              {results.map((t) => <GridItem key={t.href} t={t} color={t.color} active={isActive(t.href)} onNavigate={onNavigate} />)}
            </div>
          ) : (
            <p className="text-center text-sm text-[var(--text-muted)] py-6">‘{query}’ 검색 결과가 없습니다</p>
          )}
        </section>
      ) : (
        <>
          {/* 자주 쓰는 기능 (자동) */}
          <section>
            <h2 className="text-[11px] font-semibold text-[var(--text-muted)] mb-2.5 uppercase tracking-wide">자주 쓰는 기능</h2>
            <div className="hm-quick">
              {quickItems.map((q) => (
                <Link key={q.href} href={q.href} className={`surface ${isActive(q.href) ? 'on' : ''}`} onClick={onNavigate}>
                  <span className={`qi ${q.tint}`}><Icon name={q.icon} /></span>
                  <span className="qt">{q.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* 전체 메뉴 */}
          <section>
            <h2 className="text-[11px] font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wide">전체 메뉴</h2>
            <div className="space-y-5">
              {GROUPS.map((g) => (
                <div key={g.label}>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-3 tracking-wide">{g.label}</p>
                  <div className="hm-grid">
                    {g.items.map((t) => <GridItem key={t.href} t={t} color={g.color} active={isActive(t.href)} onNavigate={onNavigate} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
