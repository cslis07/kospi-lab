'use client';

/**
 * 공포·탐욕 반원 게이지 — 5구간 색 띠(극단적 공포 → 극단적 탐욕) + 바늘 + 가운데 숫자.
 * full: 상세 시트용(구간 표정·눈금 숫자 포함) / 기본: 카드용 작은 게이지(띠·바늘만).
 * 띠 색은 구간 뜻이 고정된 색이라 테마와 무관하게 같은 값(lib/fearGreed FNG_BANDS).
 */
import { FNG_BANDS, fngBand } from '@/lib/fearGreed';

const CX = 100, CY = 100;
/** 0~100 → 반원 위 좌표(0 = 왼쪽 끝, 100 = 오른쪽 끝) */
function pt(v: number, r: number): [number, number] {
  const a = Math.PI * (1 - v / 100);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}
/** 도넛 조각(바깥 반지름 ro · 안쪽 ri) */
function arc(from: number, to: number, ro: number, ri: number): string {
  const [x1, y1] = pt(from, ro), [x2, y2] = pt(to, ro), [x3, y3] = pt(to, ri), [x4, y4] = pt(from, ri);
  const f = (n: number) => n.toFixed(2);
  return `M${f(x1)},${f(y1)} A${ro},${ro} 0 0 1 ${f(x2)},${f(y2)} L${f(x3)},${f(y3)} A${ri},${ri} 0 0 0 ${f(x4)},${f(y4)} Z`;
}

export default function FearGreedGauge({ value, full }: { value: number; full?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const band = fngBand(v);
  const RO = 96, RI = full ? 62 : 70;
  const [nx, ny] = pt(v, RO + 2), [bx, by] = pt(v, full ? 52 : 30);
  return (
    <svg viewBox="0 0 200 108" width="100%" role="img" aria-label={`공포·탐욕 지수 ${Math.round(v)} — ${band.label}`} style={{ display: 'block' }}>
      {FNG_BANDS.map((b) => (
        <path key={b.en} d={arc(b.from + 0.4, b.to - 0.4, RO, RI)} fill={b.color} opacity={b === band ? 1 : full ? 0.9 : 0.55} />
      ))}
      {full && FNG_BANDS.map((b) => {
        const [x, y] = pt((b.from + b.to) / 2, (RO + RI) / 2);
        return <text key={b.en} x={x} y={y + 5} textAnchor="middle" fontSize={14}>{b.face}</text>;
      })}
      {full && Array.from({ length: 11 }, (_, i) => i * 10).map((t) => {
        const [x1, y1] = pt(t, 56), [x2, y2] = pt(t, 51), [tx, ty] = pt(t, 43);
        return (
          <g key={t}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--faint)" strokeWidth={0.8} />
            <text x={tx} y={ty + 2.5} textAnchor="middle" fontSize={6.5} fill="var(--faint)">{t}</text>
          </g>
        );
      })}
      <line x1={bx} y1={by} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth={full ? 2.4 : 3.2} strokeLinecap="round" />
      {full
        ? <text x={CX} y={CY - 6} textAnchor="middle" fontSize={22} fontWeight={600} fill={band.color} className="tabular-nums">{Number.isInteger(v) ? v : v.toFixed(1)}</text>
        : <circle cx={CX} cy={CY} r={5} fill="var(--ink)" />}
    </svg>
  );
}
