'use client';

/** 주식 지수 카드 — KOSPI · KOSDAQ · KOSPI200 · NASDAQ. /api/market 재사용. */
import useSWR from 'swr';

interface Idx { name: string; value: number; change: number; changeRate: number; status?: string }
interface MarketResp { kospi?: Idx | null; kosdaq?: Idx | null; kpi200?: Idx | null; nasdaq?: Idx | null }

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function Card({ label, idx }: { label: string; idx: Idx | null | undefined }) {
  const up = idx ? idx.change >= 0 : false;
  const color = idx ? (up ? 'text-red-400' : 'text-blue-400') : 'text-[var(--text-muted)]';
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      {idx ? (
        <>
          <p className="text-2xl font-bold text-[var(--text)] tabular-nums leading-tight">
            {idx.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className={`text-xs mt-1 tabular-nums ${color}`}>
            {up ? '▲' : '▼'} {Math.abs(idx.change).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {' '}({idx.changeRate >= 0 ? '+' : ''}{idx.changeRate.toFixed(2)}%)
          </p>
        </>
      ) : (
        <p className="text-sm text-[var(--text-muted)] py-2">불러오는 중…</p>
      )}
    </div>
  );
}

export default function IndexCards() {
  const { data } = useSWR<MarketResp>('/api/market', fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card label="코스피" idx={data?.kospi} />
      <Card label="코스닥" idx={data?.kosdaq} />
      <Card label="코스피200" idx={data?.kpi200} />
      <Card label="나스닥" idx={data?.nasdaq} />
    </div>
  );
}
