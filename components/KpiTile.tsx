/**
 * KPI 타일 — 2.0: 표면 카드 + 큰 숫자(그라데이션 없음). tone='navy' = 강조 타일(accent 윗선).
 * 라벨 · 큰 값 · 보조 줄(원화 등) · 바닥 설명 · 추세선(값 배열, accent). 아이콘은 lib/menu ICON 이름.
 */
import { ICON } from '@/lib/menu';

export function Sparkline({ points, className = 'kpi-spark', stroke = 'var(--accent)', fill = 'var(--accent-soft)' }: { points: number[]; className?: string; stroke?: string; fill?: string }) {
  if (points.length < 2) return <svg className={className} aria-hidden />;
  const W = 100, H = 30, min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const xy = points.map((v, i) => [(i / (points.length - 1)) * W, H - 2 - ((v - min) / span) * (H - 4)] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function KpiTile({ label, value, unit, sub, foot, icon, spark, tone = 'blue' }: {
  label: string; value: string; unit?: string; sub?: string | null; foot?: string; icon?: string; spark?: number[]; tone?: 'blue' | 'navy';
}) {
  return (
    <div className={`kpi ${tone === 'navy' ? 'kpi-navy' : ''}`}>
      {icon && (
        <span className="kpi-ic" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d={ICON[icon]} /></svg>
        </span>
      )}
      <p className="kpi-label pr-10">{label}</p>
      <p className="kpi-val">{value}{unit && <span className="kpi-unit"> {unit}</span>}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
      {foot && <p className="kpi-foot">{foot}</p>}
      {spark && <Sparkline points={spark} />}
    </div>
  );
}
