'use client';

/**
 * 홈 상단 지수 카드 레일 — 코스피·코스닥·USD·S&P500·나스닥·다우존스.
 * 가로 스크롤(모바일)·줄바꿈 없는 한 줄(데스크탑). 각 카드에 미니 스파크라인.
 * 색: 상승=빨강(--warn) · 하락=파랑(--accent) 한국 관행. 데이터 /api/home/indices(60초).
 */
import useSWR from 'swr';

interface IndexCard { code: string; name: string; value: number; change: number; changeRate: number; spark: number[] }
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dir = (c: number) => (c > 0 ? 'up' : c < 0 ? 'down' : 'flat');
const colorOf = (c: number) => (c > 0 ? 'var(--warn)' : c < 0 ? 'var(--accent)' : 'var(--faint)');

function MiniSpark({ points, change }: { points: number[]; change: number }) {
  const W = 96, H = 32, pad = 2;
  if (!points || points.length < 2) return <svg width={W} height={H} aria-hidden />;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const X = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const Y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const col = colorOf(change);
  const id = `g-${Math.abs(points[0] * 1000 | 0)}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.20" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${X(points.length - 1)},${H - pad} L${X(0)},${H - pad} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={col} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Card({ c, active }: { c: IndexCard; active?: boolean }) {
  const d = dir(c.change);
  const col = colorOf(c.change);
  const arrow = d === 'up' ? '▲' : d === 'down' ? '▼' : '·';
  return (
    <div
      className="idx-card"
      style={{
        flex: '0 0 auto', minWidth: 176, padding: '14px 16px',
        background: 'var(--surface)', border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 'var(--r-md)', boxShadow: 'var(--neo-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>
        <span style={{ color: 'var(--ink)' }}>{c.name}</span>
        <span style={{ fontSize: 10.5, color: 'var(--faint)', fontWeight: 500 }}>실시간</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{fmt(c.value)}</div>
          <div className="tabular-nums" style={{ fontSize: 12, fontWeight: 700, color: col, marginTop: 2 }}>
            {arrow} {fmt(Math.abs(c.change))} ({c.changeRate >= 0 ? '+' : ''}{c.changeRate.toFixed(2)}%)
          </div>
        </div>
        <MiniSpark points={c.spark} change={c.change} />
      </div>
    </div>
  );
}

export default function IndexRail() {
  const { data } = useSWR<{ cards: IndexCard[] }>('/api/home/indices', fetcher, { refreshInterval: 60000, revalidateOnFocus: false });
  const cards = data?.cards ?? [];
  return (
    <div className="chip-scroll" style={{ gap: 10, paddingBottom: 4 }}>
      {cards.length === 0
        ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ flex: '0 0 auto', width: 176, height: 78, borderRadius: 'var(--r-md)' }} />
          ))
        : cards.map((c, i) => <Card key={c.code} c={c} active={i === 0} />)}
    </div>
  );
}
