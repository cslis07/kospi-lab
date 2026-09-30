'use client';

/**
 * 홈 상단 지수 카드 레일 — 코스피·코스닥·USD·S&P500·나스닥·다우존스 (네이버 실시간, 10초 갱신).
 * 모바일 = 가로 스크롤, 데스크탑(≥1024) = 6칸 그리드로 전부 노출(.idx-rail — globals.css).
 * 스파크: 국내 = 당일 분봉(점선 = 전일 종가), 해외·환율 = 최근 1개월. 장중이면 '● 실시간', 아니면 '장마감'.
 * 색: 상승=빨강(--warn) · 하락=파랑(--accent).
 */
import useSWR from 'swr';

interface IndexCard {
  code: string; name: string; value: number; change: number; changeRate: number;
  live: boolean; spark: number[]; sparkLabel: string;
}
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const colorOf = (c: number) => (c > 0 ? 'var(--warn)' : c < 0 ? 'var(--accent)' : 'var(--faint)');

/** 폭 100% 반응형 스파크 — viewBox 늘림 + non-scaling-stroke 로 선 두께 유지 */
function Spark({ points, change, base }: { points: number[]; change: number; base?: number }) {
  const W = 100, H = 30;
  if (!points || points.length < 2) return <div style={{ height: H }} aria-hidden />;
  const lo = Math.min(...points, base ?? Infinity), hi = Math.max(...points, base ?? -Infinity);
  const span = hi - lo || 1;
  const X = (i: number) => (i / (points.length - 1)) * W;
  const Y = (v: number) => 2 + (1 - (v - lo) / span) * (H - 4);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join(' ');
  const col = colorOf(change);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden style={{ display: 'block' }}>
      {base != null && base >= lo && base <= hi && (
        <line x1={0} x2={W} y1={Y(base)} y2={Y(base)} stroke="var(--faint)" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" opacity={0.7} />
      )}
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={col} opacity={0.1} />
      <path d={d} fill="none" stroke={col} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Card({ c, on }: { c: IndexCard; on?: boolean }) {
  const col = colorOf(c.change);
  const arrow = c.change > 0 ? '▲' : c.change < 0 ? '▼' : '·';
  const isKr = c.sparkLabel === '오늘';
  return (
    <div className={`idx-card${on ? ' on' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
        <span className={`idx-live${c.live ? ' on' : ''}`} style={{ marginLeft: 'auto' }}>
          <i />{c.live ? '실시간' : '장마감'}
        </span>
      </div>
      <div className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em', marginTop: 4 }}>
        {fmt(c.value)}
      </div>
      <div className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: col, marginTop: 1, whiteSpace: 'nowrap' }}>
        {arrow} {fmt(Math.abs(c.change))} ({c.changeRate >= 0 ? '+' : ''}{c.changeRate.toFixed(2)}%)
      </div>
      <div style={{ marginTop: 6 }}>
        <Spark points={c.spark} change={c.change} base={isKr ? c.value - c.change : undefined} />
      </div>
    </div>
  );
}

export default function IndexRail() {
  const { data } = useSWR<{ cards: IndexCard[] }>('/api/home/indices', fetcher, { refreshInterval: 10000, revalidateOnFocus: true });
  const cards = data?.cards ?? [];
  return (
    <div className="idx-rail">
      {cards.length === 0
        ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="idx-card skeleton" style={{ height: 112 }} />)
        : cards.map((c, i) => <Card key={c.code} c={c} on={i === 0} />)}
    </div>
  );
}
