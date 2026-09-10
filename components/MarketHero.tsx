'use client';

/** 대시보드 히어로 — 코스피를 거대 수치로, 나머지 지수를 스탯 타일로 (토스/myzipplan 스타일). /api/market 재사용. */
import useSWR from 'swr';

interface Idx { name: string; value: number; change: number; changeRate: number }
interface MarketResp { kospi?: Idx | null; kosdaq?: Idx | null; kpi200?: Idx | null; nasdaq?: Idx | null }

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 한국 관행: 상승=빨강, 하락=파랑 */
function dir(idx?: Idx | null) {
  if (!idx || idx.change === 0) return 'flat' as const;
  return idx.change > 0 ? ('up' as const) : ('down' as const);
}
const arrow = (d: 'up' | 'down' | 'flat') => (d === 'up' ? '▲' : d === 'down' ? '▼' : '·');

function StatTile({ label, idx }: { label: string; idx?: Idx | null }) {
  const d = dir(idx);
  const color = d === 'up' ? 'var(--warn)' : d === 'down' ? 'var(--accent)' : 'var(--muted)';
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{idx ? fmt(idx.value) : '—'}</div>
      {idx && (
        <div className="text-[11px] font-semibold tabular-nums mt-0.5" style={{ color }}>
          {arrow(d)} {idx.changeRate >= 0 ? '+' : ''}{idx.changeRate.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

export default function MarketHero() {
  const { data } = useSWR<MarketResp>('/api/market', fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  const kospi = data?.kospi;
  const d = dir(kospi);

  return (
    <div className="hero">
      <div className="min-w-0">
        <div className="hero-label">코스피 (KOSPI)</div>
        <div className="hero-amount">{kospi ? fmt(kospi.value) : '불러오는 중…'}</div>
        {kospi && (
          <span className={`hero-pill ${d}`}>
            {arrow(d)} {kospi.change >= 0 ? '+' : ''}{fmt(kospi.change)} ({kospi.changeRate >= 0 ? '+' : ''}{kospi.changeRate.toFixed(2)}%)
          </span>
        )}
      </div>
      <div className="hero-stats">
        <StatTile label="코스닥" idx={data?.kosdaq} />
        <StatTile label="코스피200" idx={data?.kpi200} />
        <StatTile label="나스닥" idx={data?.nasdaq} />
      </div>
    </div>
  );
}
