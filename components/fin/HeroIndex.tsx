'use client';

/**
 * 모바일 홈 히어로 — 그라디언트 카드(코스피 큰 수치 + 등락칩 + 1개월 스파크라인)
 * + 하단에 겹쳐 앉는 흰 3분할 스탯 바(코스닥·코스피200·나스닥).
 * 색은 한국 관행(상승=빨강, 하락=파랑). 데이터: /api/market(30초) · /api/index-spark(5분).
 */
import useSWR from 'swr';
import Sparkline from './Sparkline';

interface Idx { name: string; value: number; change: number; changeRate: number }
interface MarketResp { kospi?: Idx | null; kosdaq?: Idx | null; kpi200?: Idx | null; nasdaq?: Idx | null }
interface SparkResp { points: number[]; asOf: string | null }

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dirOf = (idx?: Idx | null) => (!idx || idx.change === 0 ? 'flat' : idx.change > 0 ? 'up' : 'down');

function Stat({ k, idx }: { k: string; idx?: Idx | null }) {
  const d = dirOf(idx);
  const color = d === 'up' ? 'var(--warn)' : d === 'down' ? 'var(--accent)' : 'var(--faint)';
  return (
    <div>
      <div className="k">{k}</div>
      <div className="v tabular-nums">{idx ? fmt(idx.value) : '—'}</div>
      <div className="c tabular-nums" style={{ color }}>
        {idx ? `${d === 'up' ? '▲' : d === 'down' ? '▼' : ''} ${Math.abs(idx.changeRate).toFixed(2)}%` : ' '}
      </div>
    </div>
  );
}

export default function HeroIndex() {
  const { data } = useSWR<MarketResp>('/api/market', fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  const { data: spark } = useSWR<SparkResp>('/api/index-spark', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const k = data?.kospi;
  const d = dirOf(k);

  return (
    <div>
      <div className="fin-hero">
        <div className="relative z-[1] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="lbl">코스피 KOSPI</div>
            <div className="amt tabular-nums">{k ? fmt(k.value) : <span className="skeleton h-9 w-44 mt-1" aria-label="불러오는 중" />}</div>
            {k && (
              <span className="hchip tabular-nums">
                {d === 'up' ? '▲' : d === 'down' ? '▼' : '·'} {fmt(Math.abs(k.change))} ({k.changeRate >= 0 ? '+' : ''}{k.changeRate.toFixed(2)}%)
              </span>
            )}
          </div>
          <span className="sel">
            1개월
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </div>
        <div className="relative z-[1] mt-2 -mx-1">
          <Sparkline points={spark?.points} />
        </div>
      </div>
      <div className="fin-stat3">
        <Stat k="코스닥" idx={data?.kosdaq} />
        <Stat k="코스피200" idx={data?.kpi200} />
        <Stat k="나스닥" idx={data?.nasdaq} />
      </div>
    </div>
  );
}
