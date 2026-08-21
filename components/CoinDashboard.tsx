'use client';

/** 홈 코인 섹션 — 시장환경 그리드 + 현물 ETF 순유입. /api/coin-env 한 번으로 로드. */
import useSWR from 'swr';
import MarketEnvGrid from './MarketEnvGrid';
import EtfInflow from './EtfInflow';
import type { CoinEnv } from '@/lib/coinDashboard';
import type { EtfFlow } from '@/lib/etfFlow';

interface Resp { env: CoinEnv | null; etf: { BTC: EtfFlow | null; ETH: EtfFlow | null } | null }
const fetcher = (u: string) => fetch(u).then((r) => r.json());

export default function CoinDashboard() {
  const { data, isLoading } = useSWR<Resp>('/api/coin-env', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });

  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] animate-pulse" />)}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {data?.env?.cards?.length ? <MarketEnvGrid cards={data.env.cards} updatedAt={data.env.updatedAt} /> : null}
      {data?.etf ? <EtfInflow etf={data.etf} /> : null}
    </div>
  );
}
