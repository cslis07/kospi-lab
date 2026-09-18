'use client';

/**
 * 모바일 메뉴 콘텐츠 — 헤더의 '메뉴' 버튼이 여는 팝업 안에서 렌더링된다.
 * 그룹·항목·아이콘은 전부 lib/menu.ts(단일 소스)에서 가져온다.
 * ① 검색 ② 자주 쓰는 기능(실제 방문 빈도) ③ 전체 메뉴(5섹션) ④ 더보기 도구.
 */
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ICON, MENU, EXTRAS, FLAT, BY_HREF, DEFAULT_QUICK, itemIsActive, type MenuItem } from '@/lib/menu';

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

const VISITS_KEY = 'kl:visits';
function readVisits(): Record<string, number> {
  try { const r = localStorage.getItem(VISITS_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
/** 방문 빈도 상위 4개(있으면) → 부족분은 기본값(매매 핵심)으로 채움 */
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

function GridItem({ t, color, active, onNavigate }: { t: MenuItem; color: string; active: boolean; onNavigate?: () => void }) {
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

export default function HomeMenu({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isActive = (href: string) => { const it = BY_HREF.get(href); return it ? itemIsActive(it, pathname, searchParams) : false; };

  // 자주 쓰는 기능 — 실제 방문 빈도(localStorage) 기반, 없으면 기본값
  const [visits, setVisits] = useState<Record<string, number>>({});
  useEffect(() => { setVisits(readVisits()); }, []);
  const quickItems = useMemo(() => pickQuick(visits).map((h) => BY_HREF.get(h)!).filter(Boolean), [visits]);

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
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="메뉴 검색"
          className="w-full pl-10 pr-9 py-3 rounded-2xl bg-[var(--surface-2)] border border-transparent focus:border-[var(--accent)] focus:bg-[var(--bg-card)] outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] transition-colors" />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="지우기"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--border)]">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {results ? (
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
                  <span className={`qi ${q.qc}`}><Icon name={q.icon} /></span>
                  <span className="qt">{q.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* 전체 메뉴 — 5섹션 */}
          <section>
            <h2 className="text-[11px] font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wide">전체 메뉴</h2>
            <div className="space-y-5">
              {MENU.map((g) => (
                <div key={g.key}>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-3 tracking-wide">{g.label}</p>
                  <div className="hm-grid">
                    {g.items.map((t) => <GridItem key={t.href} t={t} color={g.color} active={isActive(t.href)} onNavigate={onNavigate} />)}
                  </div>
                </div>
              ))}
              {/* 5섹션 밖 보조 도구 */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-3 tracking-wide">더보기 도구</p>
                <div className="hm-grid">
                  {EXTRAS.map((t) => <GridItem key={t.href} t={t} color="c-violet" active={isActive(t.href)} onNavigate={onNavigate} />)}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
