'use client';

/**
 * 시장 › 코인 — 관심 코인 시세(고밀도 목록) + 코인 거시 환경(금리·유가·심리) + 현물 ETF 순유입.
 * 관심 코인만 노출한다(추가·편집은 관심종목 탭 또는 검색 ☆). 행을 누르면 코인 상세(차트)로 드릴다운.
 */
import Link from 'next/link';
import useSWR from 'swr';
import WatchRow from '@/components/WatchRow';
import CoinDashboard from '@/components/CoinDashboard';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';
import { COINS, fmtCoinPrice } from '@/lib/coins';
import type { CryptoData } from '@/lib/types';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
// 코인선물 분석 엔진 지원 종목(그 외는 분석 버튼 없음)
const ANALYZABLE = ['BTC', 'ETH', 'XRP', 'SOL'];
const openSearch = () => window.dispatchEvent(new Event('kl:open-search'));

export default function CoinsPage() {
  const { watchlist, mounted } = useCryptoWatchlist();
  const symbols = watchlist.map((w) => w.symbol).join(',');
  const { data, error } = useSWR<Record<string, CryptoData>>(
    symbols ? `/api/crypto/batch?symbols=${symbols}` : null, fetcher, { refreshInterval: 15000 });

  return (
    <div className="space-y-7 pb-6">
      <section>
        <div className="fin-sec">
          <h3>관심 코인 시세 <span className="ml-1 text-[11px] font-semibold text-[var(--faint)] align-middle">USDT · 24시간 변동</span></h3>
          <Link href="/my-stocks?market=crypto" className="fin-more">추가·편집</Link>
        </div>

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
            {watchlist.map((w) => {
              const meta = COINS.find((c) => c.symbol === w.symbol);
              const d = data?.[w.symbol];
              return (
                <WatchRow key={w.symbol} href={`/crypto/${w.symbol}`} title={meta?.ko ?? w.name} sub={`${w.base} · ${meta?.name ?? w.name}`} badge={w.base.slice(0, 3)}
                  price={fmtCoinPrice(d?.price)} changeRate={d?.changeRate} loading={!data && !error}
                  analyzeHref={ANALYZABLE.includes(w.base) ? `/coin-analysis?symbol=${w.symbol}&run=1` : undefined} />
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
