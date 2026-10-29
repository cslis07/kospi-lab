'use client';

/**
 * 시장 › 코인 — 관심 코인 시세(고밀도 목록) + 코인 거시 환경(금리·유가·심리) + 현물 ETF 순유입.
 * 관심 코인만 노출한다(추가·편집은 관심종목 탭 또는 검색 ☆). 행을 누르면 코인 상세(차트)로 드릴다운.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import WatchRow from '@/components/WatchRow';
import Mini52 from '@/components/Mini52';
import CoinDashboard from '@/components/CoinDashboard';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';
import { COINS, fmtCoinPrice } from '@/lib/coins';
import type { CryptoData } from '@/lib/types';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
// 코인선물 분석 엔진 지원 종목(그 외는 분석 버튼 없음)
const ANALYZABLE = ['BTC', 'ETH', 'XRP', 'SOL'];
// 52주 위치는 주요 코인만(주봉 소스). 그 외는 52주 소스가 마땅치 않아 생략.
const MAJOR_BASES = ['BTC', 'ETH', 'XRP', 'SOL', 'BNB', 'DOGE', 'ADA', 'TRX', 'LINK', 'AVAX'];
const openSearch = () => window.dispatchEvent(new Event('kl:open-search'));

type SortKey = 'default' | 'changeDesc' | 'changeAsc' | 'pos52Asc' | 'pos52Desc';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default',    label: '기본순'        },
  { key: 'changeDesc', label: '등락률 높은순'  },
  { key: 'changeAsc',  label: '등락률 낮은순'  },
  { key: 'pos52Asc',   label: '52주 저점 근접' },
  { key: 'pos52Desc',  label: '52주 고점 근접' },
];

export default function CoinsPage() {
  const { watchlist, mounted } = useCryptoWatchlist();
  const [sort, setSort] = useState<SortKey>('default');
  const symbols = watchlist.map((w) => w.symbol).join(',');
  const { data, error } = useSWR<Record<string, CryptoData>>(
    symbols ? `/api/crypto/batch?symbols=${symbols}` : null, fetcher, { refreshInterval: 15000 });
  // 주요 코인 52주(주봉) — 느리게 변해 길게 캐시
  const w52syms = watchlist.filter((w) => MAJOR_BASES.includes(w.base)).map((w) => w.symbol).join(',');
  const { data: w52 } = useSWR<Record<string, { high52w: number; low52w: number }>>(
    w52syms ? `/api/crypto/week52?symbols=${w52syms}` : null, fetcher, { revalidateOnFocus: false });

  // 정렬 — 등락률(배치)·52주 위치(주요 코인만, 없으면 뒤로). 기본순은 관심목록 순서 유지.
  const sorted = useMemo(() => {
    if (sort === 'default') return watchlist;
    const cr = (s: string) => data?.[s]?.changeRate ?? null;
    const pos = (s: string) => {
      const w = w52?.[s], px = data?.[s]?.price;
      if (!w || px == null || w.high52w <= w.low52w) return null;
      return (px - w.low52w) / (w.high52w - w.low52w);
    };
    const by = (f: (s: string) => number | null, dir: 1 | -1) =>
      [...watchlist].sort((a, b) => { const va = f(a.symbol), vb = f(b.symbol); if (va == null) return 1; if (vb == null) return -1; return dir * (va - vb); });
    if (sort === 'changeDesc') return by(cr, -1);
    if (sort === 'changeAsc') return by(cr, 1);
    if (sort === 'pos52Asc') return by(pos, 1);
    if (sort === 'pos52Desc') return by(pos, -1);
    return watchlist;
  }, [watchlist, data, w52, sort]);

  return (
    <div className="space-y-7 pb-6">
      <Link href="/eth" className="flex items-center justify-between fin-card px-4 py-3 hover:border-[var(--text-muted)]">
        <div>
          <p className="text-sm font-bold text-[var(--text)]">ETH 체제 보드 <span className="text-[10px] font-normal text-[var(--accent)] align-middle">NEW</span></p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">공급·수요·포지셔닝·거시 4층 · 예측 아님</p>
        </div>
        <span className="text-[var(--accent)] text-lg">→</span>
      </Link>
      <section>
        <div className="fin-sec">
          <h3>관심 코인 시세 <span className="ml-1 text-[11px] font-semibold text-[var(--faint)] align-middle">USDT · 24시간 변동</span></h3>
          <Link href="/my-stocks?market=crypto" className="fin-more">추가·편집</Link>
        </div>

        {mounted && watchlist.length > 1 && (
          <div className="flex justify-end mb-2">
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="코인 정렬"
              className="px-2.5 py-1 text-[11px] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] outline-none">
              {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        )}

        {!mounted ? (
          <div className="fin-card overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="wl-row">
                <span className="skeleton w-9 h-9 rounded-full shrink-0" />
                <span className="flex-1 space-y-1.5"><span className="skeleton h-3.5 w-24" /><span className="skeleton h-2.5 w-16" /></span>
              </div>
            ))}
          </div>
        ) : watchlist.length === 0 ? (
          <div className="fin-card px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[var(--text)]">관심 코인이 없어요</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">검색에서 ☆를 누르면 여기 모입니다</p>
            <button type="button" onClick={openSearch} className="kl-cta mt-4 px-4 py-2 text-sm">코인 검색</button>
          </div>
        ) : (
          <div className="fin-card overflow-hidden md:grid md:grid-cols-2">
            {sorted.map((w) => {
              const meta = COINS.find((c) => c.symbol === w.symbol);
              const d = data?.[w.symbol];
              return (
                <WatchRow key={w.symbol} href={`/crypto/${w.symbol}`} title={meta?.ko ?? w.name} sub={`${w.base} · ${meta?.name ?? w.name}`} badge={w.base.slice(0, 3)}
                  price={fmtCoinPrice(d?.price)} changeRate={d?.changeRate} loading={!data && !error}
                  analyzeHref={ANALYZABLE.includes(w.base) ? `/coin-analysis?symbol=${w.symbol}&run=1` : undefined}
                  below={d?.price && w52?.[w.symbol] ? <Mini52 price={d.price} high={w52[w.symbol].high52w} low={w52[w.symbol].low52w} /> : undefined} />
              );
            })}
          </div>
        )}
        {error && <p className="text-xs text-[var(--warn)] mt-2">시세를 불러오지 못했습니다. 잠시 후 다시 시도됩니다.</p>}
      </section>

      <CoinDashboard />
    </div>
  );
}
