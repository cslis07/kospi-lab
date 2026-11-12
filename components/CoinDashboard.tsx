'use client';

/** 코인 화면 — 시장환경(실시간 카드, MarketEnvRail 이 따로 받음) + 현물 ETF 순유입(/api/coin-env). */
import useSWR from 'swr';
import MarketEnvRail from './MarketEnvRail';
import EtfInflow from './EtfInflow';
import type { EtfFlow } from '@/lib/etfFlow';

interface Resp { etf: { BTC: EtfFlow | null; ETH: EtfFlow | null } | null }
const fetcher = (u: string) => fetch(u).then((r) => r.json());

export default function CoinDashboard() {
  const { data } = useSWR<Resp>('/api/coin-env', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });

  return (
    <div className="space-y-6">
      <MarketEnvRail />
      {data?.etf ? <EtfInflow etf={data.etf} /> : null}
    </div>
  );
}
