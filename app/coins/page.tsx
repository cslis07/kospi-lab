'use client';

/**
 * 시장 › 코인 — 주요 코인 시세(고밀도 목록) + 코인 거시 환경(금리·유가·심리) + 현물 ETF 순유입.
 * 행을 누르면 코인 상세(차트)로 드릴다운. 관심 코인 관리는 홈 › 관심종목.
 */
import Link from 'next/link';
import useSWR from 'swr';
import WatchRow from '@/components/WatchRow';
import CoinDashboard from '@/components/CoinDashboard';
import { COINS, fmtCoinPrice } from '@/lib/coins';
import type { CryptoData } from '@/lib/types';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const SYMBOLS = COINS.map((c) => c.symbol).join(',');
// 코인선물 분석 엔진 지원 종목(그 외는 분석 버튼 없음)
const ANALYZABLE = ['BTC', 'ETH', 'XRP', 'SOL'];

export default function CoinsPage() {
  const { data, error } = useSWR<Record<string, CryptoData>>(`/api/crypto/batch?symbols=${SYMBOLS}`, fetcher, { refreshInterval: 15000 });

  return (
    <div className="space-y-7 pb-6">
      <section>
        <div className="fin-sec">
          <h3>코인 시세 <span className="ml-1 text-[11px] font-semibold text-[var(--faint)] align-middle">USDT · 24시간 변동</span></h3>
          <Link href="/my-stocks?market=crypto" className="fin-more">관심 코인</Link>
        </div>
        <div className="fin-card overflow-hidden md:grid md:grid-cols-2">
          {COINS.map((c) => {
            const d = data?.[c.symbol];
            return (
              <WatchRow key={c.symbol} href={`/crypto/${c.symbol}`} title={c.ko} sub={`${c.base} · ${c.name}`} badge={c.base.slice(0, 3)}
                price={fmtCoinPrice(d?.price)} changeRate={d?.changeRate} loading={!data && !error}
                analyzeHref={ANALYZABLE.includes(c.base) ? `/coin-analysis?symbol=${c.symbol}&run=1` : undefined} />
            );
          })}
        </div>
        {error && <p className="text-xs text-[var(--warn)] mt-2">시세를 불러오지 못했습니다. 잠시 후 다시 시도됩니다.</p>}
      </section>

      <CoinDashboard />
    </div>
  );
}
