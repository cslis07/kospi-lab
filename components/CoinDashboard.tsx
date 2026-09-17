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
        {/* 모바일: 헤더 + 실제 카드 모양 시머(콜드 로드 때 빈 박스만 덩그러니 보이지 않게) */}
        <div className="md:hidden">
          <div className="fin-sec"><h3>시장환경</h3></div>
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="fin-card fin-mini">
                <span className="skeleton w-[38px] h-[38px] rounded-xl" />
                <span className="skeleton h-3 w-16 mt-3" />
                <span className="skeleton h-5 w-24 mt-2" />
                <span className="skeleton h-4 w-14 mt-2 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden md:grid grid-cols-4 gap-3">
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
