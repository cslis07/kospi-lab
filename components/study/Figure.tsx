/**
 * 공부법 그림 엔진 — 패널(가격·보조지표)을 세로로 쌓은 정적 SVG. 서버에서 그려 클라이언트 JS 0.
 * 차트 라이브러리 없이 직접 그린다(공부 페이지 번들을 늘리지 않게 — HoldingsConcentration·CalendarHeatmap 과 같은 원칙).
 * 색은 테마 토큰 + 한국 관행(상승=빨강 --warn · 하락=파랑 --accent).
 */
import type { ReactNode } from 'react';
import type { Candle } from '@/lib/studyData';

type Series = (number | null)[];

export type El =
  | { kind: 'candles'; data: Candle[] }
  | { kind: 'line'; data: Series; color: string; width?: number; dash?: string }
  | { kind: 'bars'; data: Series; color: (v: number, i: number) => string; base?: number }
  | { kind: 'hline'; y: number; color: string; dash?: string; label?: string; width?: number }
  | { kind: 'zone'; y1: number; y2: number; color: string; label?: string }
  | { kind: 'vzone'; x1: number; x2: number; color: string; label?: string }
  | { kind: 'seg'; x1: number; y1: number; x2: number; y2: number; color: string; dash?: string; width?: number; label?: string }
  | { kind: 'mark'; x: number; y: number; label: string; color: string; dir?: 'up' | 'down' }
  | { kind: 'dot'; x: number; y: number; label?: string; color: string; pos?: 'above' | 'below' | 'left' | 'right' };

export interface Panel {
  height: number;
  els: El[];
  /** y 범위 고정(RSI 0~100 등). 없으면 요소들로 자동 */
  domain?: [number, number];
  /** 왼쪽 위 패널 이름 */
  title?: string;
  /** 오른쪽 축 눈금 */
  ticks?: number[];
  /** 패널 이름 위치(그래프와 겹치면 아래로) */
  titlePos?: 'top' | 'bottom';
}

export const UP = 'var(--warn)';
export const DOWN = 'var(--accent)';

const W = 360;
const PL = 6;   // 왼쪽 여백
const PR_DEFAULT = 46;  // 오른쪽(라벨·축)
const GAP = 10;

function autoDomain(els: El[]): [number, number] {
  const vs: number[] = [];
  for (const e of els) {
    if (e.kind === 'candles') e.data.forEach((c) => { vs.push(c.h, c.l); });
    else if (e.kind === 'line' || e.kind === 'bars') e.data.forEach((v) => { if (v != null) vs.push(v); });
    else if (e.kind === 'hline') vs.push(e.y);
    else if (e.kind === 'zone') vs.push(e.y1, e.y2);
    else if (e.kind === 'seg') vs.push(e.y1, e.y2);
  }
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const pad = (hi - lo || 1) * 0.08;
  return [lo - pad, hi + pad];
}

/** 데이터 인덱스 범위 */
function xRange(els: El[]): number {
  let n = 0;
  for (const e of els) if (e.kind === 'candles' || e.kind === 'line' || e.kind === 'bars') n = Math.max(n, e.data.length);
  return n;
}

const fmtTick = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) < 10 ? 1 : 0));

export default function Figure({ panels, from = 0, to, caption, label, padRight = PR_DEFAULT }: {
  panels: Panel[];
  /** 보여 줄 인덱스 구간(지표 워밍업 구간 숨김) */
  from?: number;
  to?: number;
  caption?: ReactNode;
  /** 스크린리더용 그림 설명 */
  label: string;
  /** 오른쪽 라벨 영역 폭(긴 가격 라벨이 잘리면 늘림) */
  padRight?: number;
}) {
  const PR = padRight;
  const n = Math.max(...panels.map((p) => xRange(p.els)));
  const x1 = to ?? n - 1;
  const span = Math.max(1, x1 - from);
  const plotW = W - PL - PR;
  const X = (i: number) => PL + ((i - from) / span) * plotW;
  const cw = Math.max(1.2, Math.min(7, (plotW / (span + 1)) * 0.62)); // 캔들 몸통 폭
  const totalH = panels.reduce((a, p) => a + p.height, 0) + GAP * (panels.length - 1) + 4;

  let top = 2;
  const groups = panels.map((p, pi) => {
    const [d0, d1] = p.domain ?? autoDomain(p.els.map((e) =>
      e.kind === 'candles' ? { ...e, data: e.data.slice(from, x1 + 1) }
        : e.kind === 'line' || e.kind === 'bars' ? { ...e, data: e.data.slice(from, x1 + 1) } : e) as El[]);
    const y0 = top;
    const Y = (v: number) => y0 + (1 - (v - d0) / (d1 - d0 || 1)) * p.height;
    top += p.height + GAP;
    const inView = (i: number) => i >= from && i <= x1;

    const items: ReactNode[] = [];
    // 테두리·격자
    items.push(<rect key="bg" x={PL} y={y0} width={plotW} height={p.height} fill="none" stroke="var(--line)" strokeWidth={0.6} rx={3} />);
    (p.ticks ?? []).forEach((t, ti) => {
      items.push(<line key={`gt${ti}`} x1={PL} x2={PL + plotW} y1={Y(t)} y2={Y(t)} stroke="var(--line)" strokeWidth={0.5} strokeDasharray="2 3" />);
      items.push(<text key={`tt${ti}`} x={W - PR + 4} y={Y(t) + 3} fontSize={8.5} fill="var(--faint)">{fmtTick(t)}</text>);
    });

    p.els.forEach((e, ei) => {
      const k = `${pi}-${ei}`;
      if (e.kind === 'zone') {
        items.push(<rect key={k} x={PL} width={plotW} y={Y(Math.max(e.y1, e.y2))} height={Math.abs(Y(e.y1) - Y(e.y2))} fill={e.color} opacity={0.16} />);
        if (e.label) items.push(<text key={k + 't'} x={PL + 4} y={Y(Math.max(e.y1, e.y2)) + 10} fontSize={9} fontWeight={700} fill={e.color}>{e.label}</text>);
      } else if (e.kind === 'vzone') {
        items.push(<rect key={k} x={X(e.x1)} width={Math.max(1, X(e.x2) - X(e.x1))} y={y0} height={p.height} fill={e.color} opacity={0.12} />);
        if (e.label) items.push(<text key={k + 't'} x={(X(e.x1) + X(e.x2)) / 2} y={y0 + 11} fontSize={9} fontWeight={700} textAnchor="middle" fill={e.color}>{e.label}</text>);
      } else if (e.kind === 'hline') {
        items.push(<line key={k} x1={PL} x2={PL + plotW} y1={Y(e.y)} y2={Y(e.y)} stroke={e.color} strokeWidth={e.width ?? 1} strokeDasharray={e.dash} />);
        if (e.label) items.push(<text key={k + 't'} x={W - PR + 4} y={Y(e.y) + 3} fontSize={8.5} fontWeight={700} fill={e.color}>{e.label}</text>);
      } else if (e.kind === 'bars') {
        const base = e.base ?? 0;
        e.data.forEach((v, i) => {
          if (v == null || !inView(i)) return;
          const ya = Y(Math.max(v, base)), yb = Y(Math.min(v, base));
          items.push(<rect key={`${k}-${i}`} x={X(i) - cw / 2} width={cw} y={ya} height={Math.max(0.6, yb - ya)} fill={e.color(v, i)} />);
        });
      } else if (e.kind === 'candles') {
        e.data.forEach((c, i) => {
          if (!inView(i)) return;
          const col = c.c >= c.o ? UP : DOWN;
          const yt = Y(Math.max(c.o, c.c)), yb = Y(Math.min(c.o, c.c));
          items.push(<line key={`${k}-w${i}`} x1={X(i)} x2={X(i)} y1={Y(c.h)} y2={Y(c.l)} stroke={col} strokeWidth={0.8} />);
          items.push(<rect key={`${k}-b${i}`} x={X(i) - cw / 2} width={cw} y={yt} height={Math.max(0.8, yb - yt)} fill={col} />);
        });
      } else if (e.kind === 'line') {
        let d = '';
        e.data.forEach((v, i) => {
          if (v == null || !inView(i)) return;
          d += `${d ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
        });
        if (d) items.push(<path key={k} d={d} fill="none" stroke={e.color} strokeWidth={e.width ?? 1.4} strokeDasharray={e.dash} strokeLinejoin="round" />);
      } else if (e.kind === 'seg') {
        items.push(<line key={k} x1={X(e.x1)} y1={Y(e.y1)} x2={X(e.x2)} y2={Y(e.y2)} stroke={e.color} strokeWidth={e.width ?? 1.4} strokeDasharray={e.dash} />);
        if (e.label) items.push(<text key={k + 't'} x={X(e.x2) + 3} y={Y(e.y2) - 3} fontSize={9} fontWeight={700} fill={e.color}>{e.label}</text>);
      } else if (e.kind === 'mark') {
        const up = (e.dir ?? 'up') === 'up';          // up = 아래에서 위를 가리킴(바닥 표시)
        const yy = Y(e.y);
        const tip = up ? yy + 4 : yy - 4;
        const tail = up ? yy + 13 : yy - 13;
        items.push(<path key={k} d={`M${X(e.x)},${tip} l-3.5,${up ? 5 : -5} h7 Z M${X(e.x)},${up ? tip + 5 : tip - 5} V${tail}`} fill={e.color} stroke={e.color} strokeWidth={1.2} />);
        items.push(<text key={k + 't'} x={X(e.x)} y={up ? tail + 10 : tail - 4} fontSize={9} fontWeight={700} textAnchor="middle" fill={e.color}>{e.label}</text>);
      } else if (e.kind === 'dot') {
        items.push(<circle key={k} cx={X(e.x)} cy={Y(e.y)} r={2.6} fill={e.color} stroke="var(--bg-card)" strokeWidth={0.8} />);
        if (e.label) {
          const pos = e.pos ?? 'above';
          const tx = pos === 'left' ? X(e.x) - 5 : pos === 'right' ? X(e.x) + 5 : X(e.x);
          const ty = pos === 'above' ? Y(e.y) - 6 : pos === 'below' ? Y(e.y) + 12 : Y(e.y) + 3;
          items.push(<text key={k + 't'} x={tx} y={ty} fontSize={9} fontWeight={700} fill={e.color}
            textAnchor={pos === 'left' ? 'end' : pos === 'right' ? 'start' : 'middle'}>{e.label}</text>);
        }
      }
    });
    if (p.title) items.push(<text key="title" x={PL + 5} y={p.titlePos === 'bottom' ? y0 + p.height - 5 : y0 + 11} fontSize={9} fontWeight={700} fill="var(--ink-2)">{p.title}</text>);
    return <g key={pi}>{items}</g>;
  });

  return (
    <figure className="my-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2">
        <svg viewBox={`0 0 ${W} ${totalH}`} width="100%" role="img" aria-label={label} style={{ display: 'block' }}>
          {groups}
        </svg>
      </div>
      <figcaption className="text-[11.5px] leading-relaxed text-[var(--text-muted)] mt-1.5 px-0.5">
        {caption}
        <span className="text-[10px] text-[var(--faint)] ml-1">(설명용 가상 데이터 · 지표는 실제 공식으로 계산)</span>
      </figcaption>
    </figure>
  );
}
