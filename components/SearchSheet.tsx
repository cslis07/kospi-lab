'use client';

/**
 * 통합 검색 시트(전체 화면) — 검색 → 관심종목 → 상세로 이어지는 흐름의 입구.
 * - 시장 필터 칩(전체·국내·해외·코인) + 시장별 섹션 결과 + 최근 검색·많이 찾는 종목
 * - 행의 ☆로 바로 관심종목 추가/해제(시장별 워치리스트에 저장)
 * - 국내 /api/search · 해외 /api/overseas/search(한글 질의는 건너뜀) · 코인 로컬 카탈로그
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { COINS, searchCoins, type CoinMeta } from '@/lib/coins';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';
import { badgeTint } from './WatchRow';

type Mkt = 'kr' | 'us' | 'coin';
type Filter = 'all' | Mkt;
interface Row { mkt: Mkt; code: string; title: string; sub: string; href: string; meta: Record<string, string> }

const RECENT_KEY = 'kl:recent-search';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' }, { key: 'kr', label: '국내 주식' }, { key: 'us', label: '해외 주식' }, { key: 'coin', label: '코인' },
];
const SECTION: Record<Mkt, string> = { kr: '국내 주식', us: '해외 주식', coin: '코인' };
const MK: Record<Mkt, string> = { kr: '국내', us: '해외', coin: '코인' };

const krRow = (h: { ticker: string; name: string; market?: string }): Row => {
  const code = h.ticker.replace(/\.(KS|KQ)$/, '');
  return { mkt: 'kr', code, title: h.name, sub: `${code} · ${h.market ?? '국내'}`, href: `/stock/${code}`, meta: { market: h.market ?? 'KOSPI' } };
};
const usRow = (h: { symbol: string; name: string; exchange?: string }): Row => ({
  mkt: 'us', code: h.symbol, title: h.name, sub: `${h.symbol} · ${h.exchange ?? ''}`,
  href: `/overseas/${encodeURIComponent(h.symbol)}`,
  meta: { exchange: h.exchange ?? '' },
});
const coinRow = (c: CoinMeta): Row => ({
  mkt: 'coin', code: c.symbol, title: c.ko, sub: `${c.base} · ${c.name}`, href: `/crypto/${c.symbol}`, meta: { base: c.base, name: c.name },
});
const badgeText = (r: Row) => (r.mkt === 'kr' ? r.title.slice(0, 1) : r.mkt === 'us' ? r.code.slice(0, 2) : (r.meta.base ?? r.code).slice(0, 3));

const POPULAR: Row[] = [
  krRow({ ticker: '005930', name: '삼성전자', market: 'KOSPI' }),
  krRow({ ticker: '000660', name: 'SK하이닉스', market: 'KOSPI' }),
  usRow({ symbol: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ' }),
  usRow({ symbol: 'TSLA', name: 'Tesla', exchange: 'NASDAQ' }),
  coinRow(COINS[0]),
  coinRow(COINS[1]),
];

export default function SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [res, setRes] = useState<{ kr: Row[]; us: Row[] }>({ kr: [], us: [] });
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<Row[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const wlKr = useWatchlist();
  const wlUs = useOverseasWatchlist();
  const wlCoin = useCryptoWatchlist();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')); } catch { setRecent([]); }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open]);

  // 디바운스 250ms · 늦게 도착한 이전 응답은 버린다
  useEffect(() => {
    const t = q.trim();
    if (!t) { setRes({ kr: [], us: [] }); setLoading(false); return; }
    setLoading(true);
    const my = ++seq.current;
    const timer = setTimeout(async () => {
      const get = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      const [kr, us] = await Promise.all([
        get(`/api/search?q=${encodeURIComponent(t)}`),
        /[가-힣]/.test(t) ? Promise.resolve([]) : get(`/api/overseas/search?q=${encodeURIComponent(t)}`),
      ]);
      if (my !== seq.current) return;
      setRes({ kr: (Array.isArray(kr) ? kr : []).map(krRow), us: (Array.isArray(us) ? us : []).map(usRow) });
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const coinRows = useMemo(() => searchCoins(q).map(coinRow), [q]);

  const isWatched = (r: Row) =>
    r.mkt === 'kr' ? wlKr.watchlist.some((w) => w.ticker === r.code)
    : r.mkt === 'us' ? wlUs.watchlist.some((w) => w.symbol === r.code)
    : wlCoin.watchlist.some((w) => w.symbol === r.code);
  const toggleWatch = (r: Row) => {
    const on = isWatched(r);
    if (r.mkt === 'kr') { if (on) wlKr.remove(r.code); else wlKr.add({ ticker: r.code, name: r.title, market: r.meta.market ?? 'KOSPI' }); }
    else if (r.mkt === 'us') { if (on) wlUs.remove(r.code); else wlUs.add({ symbol: r.code, name: r.title, exchange: r.meta.exchange ?? '' }); }
    else if (on) wlCoin.remove(r.code);
    else wlCoin.add({ symbol: r.code, base: r.meta.base ?? r.code.replace(/USDT$/, ''), name: r.meta.name ?? r.title });
  };

  const saveRecent = (r: Row) => {
    const next = [r, ...recent.filter((x) => !(x.mkt === r.mkt && x.code === r.code))].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* 저장 불가 환경 무시 */ }
  };
  const clearRecent = () => { setRecent([]); try { localStorage.removeItem(RECENT_KEY); } catch { /* 무시 */ } };
  const go = (r: Row) => { saveRecent(r); router.push(r.href); closeRef.current(); };

  if (!open || !mounted) return null;

  const t = q.trim();
  const pass = (m: Mkt) => filter === 'all' || filter === m;
  const visible = ([['kr', res.kr], ['us', res.us], ['coin', coinRows]] as [Mkt, Row[]][])
    .filter(([m]) => pass(m))
    .map(([m, rows]) => [m, rows.slice(0, filter === 'all' ? 5 : 30)] as [Mkt, Row[]])
    .filter(([, rows]) => rows.length > 0);

  // ⚠ 컴포넌트가 아니라 함수로 렌더 — 내부 정의 컴포넌트는 매 렌더 재마운트된다(플래너 입력 버그와 같은 원인)
  const rowView = (r: Row, key: string) => {
    const on = isWatched(r);
    return (
      <div key={key} className="srch-row">
        <button type="button" className="srch-go" onClick={() => go(r)}>
          <span className={`wl-badge ${badgeTint(r.title + r.sub)}`} aria-hidden>{badgeText(r)}</span>
          <span className="wl-name">
            <b className="truncate">{r.title}</b>
            <small className="truncate">{r.sub}</small>
          </span>
          <span className="srch-mk">{MK[r.mkt]}</span>
        </button>
        <button type="button" className={`srch-star ${on ? 'on' : ''}`} onClick={() => toggleWatch(r)}
          aria-pressed={on} aria-label={on ? `${r.title} 관심종목 해제` : `${r.title} 관심종목 추가`}>
          <svg viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
          </svg>
        </button>
      </div>
    );
  };

  return createPortal(
    <div className="srch mfade" role="dialog" aria-modal="true" aria-label="종목 검색">
      <div className="srch-bar">
        <button type="button" className="appbar-ic" onClick={() => closeRef.current()} aria-label="검색 닫기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <div className="srch-in">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" /></svg>
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="종목명 · 코드 · 티커 · 코인" enterKeyHint="search" aria-label="검색어"
            onKeyDown={(e) => { if (e.key === 'Enter' && visible[0]?.[1][0]) go(visible[0][1][0]); }}
          />
          {q && (
            <button type="button" className="sheet-x !w-6 !h-6" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="검색어 지우기">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="srch-chips" role="tablist" aria-label="시장 필터">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key}
            className={`chip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="srch-body">
        {!t ? (
          <>
            {recent.filter((r) => pass(r.mkt)).length > 0 && (
              <>
                <div className="srch-sec">
                  최근 검색
                  <span className="flex-1" />
                  <button type="button" onClick={clearRecent} className="text-[12px] font-semibold text-[var(--faint)]">전체 삭제</button>
                </div>
                {recent.filter((r) => pass(r.mkt)).map((r) => rowView(r, `r-${r.mkt}-${r.code}`))}
              </>
            )}
            <div className="srch-sec">많이 찾는 종목</div>
            {POPULAR.filter((r) => pass(r.mkt)).map((r) => rowView(r, `p-${r.mkt}-${r.code}`))}
          </>
        ) : loading && visible.length === 0 ? (
          [0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="srch-row">
              <span className="skeleton w-9 h-9 rounded-full shrink-0" />
              <span className="flex-1 space-y-1.5"><span className="skeleton h-3.5 w-32" /><span className="skeleton h-2.5 w-20" /></span>
            </div>
          ))
        ) : visible.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-[var(--text-muted)]">
            ‘{t}’ 검색 결과가 없습니다<br /><span className="text-xs">종목명·6자리 코드·영문 티커·코인 이름으로 찾아보세요</span>
          </p>
        ) : (
          visible.map(([m, rows]) => (
            <section key={m}>
              <div className="srch-sec">{SECTION[m]} <small>{rows.length}</small></div>
              {rows.map((r) => rowView(r, `${m}-${r.code}`))}
            </section>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
