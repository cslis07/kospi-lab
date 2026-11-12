'use client';

/**
 * 지수·지표 카드(현재값 · 전일 대비 · 추이선) — 홈 '오늘의 시장' 레일과 코인 › 시장환경이 같이 쓴다.
 * 색: 상승=빨강(--warn) · 하락=파랑(--accent). 카드 모양은 globals.css .idx-card.
 */
export interface IndexCard {
  code: string; name: string; value: number; change: number; changeRate: number;
  live: boolean; spark: number[]; sparkLabel: string;
  week52High?: number | null; week52Low?: number | null;
  unit?: string; dec?: number; // 표기용(금리 % · 국내금 원 · 스테이블코인 시총 'B' 등) · 소수 자리
  tag?: string;      // 상태 표기 대체('일간'·'10분 지연' — 실시간/장마감이 맞지 않는 카드)
  note?: string;     // 등락 아래 한 줄(공포탐욕 구간)
  diffUnit?: string; // 있으면 등락을 '▲ 0.12%p' 처럼 차이만 표시(변화율이 뜻 없는 지표)
  signed?: boolean;  // 값 앞에 +/− 부호(0 을 오가는 지표)
}

export const colorOf = (c: number) => (c > 0 ? 'var(--warn)' : c < 0 ? 'var(--accent)' : 'var(--faint)');

/** 폭 100% 반응형 스파크 — viewBox 늘림 + non-scaling-stroke 로 선 두께 유지 */
export function Spark({ points, change, base }: { points: number[]; change: number; base?: number }) {
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

export function Card({ c, on }: { c: IndexCard; on?: boolean }) {
  const col = colorOf(c.change);
  const arrow = c.change > 0 ? '▲' : c.change < 0 ? '▼' : '·';
  const isKr = c.sparkLabel === '오늘';
  const d = c.dec ?? 2; // 금리=4자리·국내금=정수 등 시장지표 소수자리
  const f = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const suffix = c.unit === '%' || c.unit === 'B' ? c.unit : null;
  return (
    <div className={`idx-card${on ? ' on' : ''}`} title={c.week52Low != null && c.week52High != null ? `52주 ${f(c.week52Low)} ~ ${f(c.week52High)}` : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
        <span className={`idx-live${c.live ? ' on' : ''}`} style={{ marginLeft: 'auto' }}>
          <i />{c.tag ?? (c.live ? '실시간' : '장마감')}
        </span>
      </div>
      <div className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em', marginTop: 4 }}>
        {c.signed && c.value > 0 ? '+' : ''}{f(c.value)}{suffix ? <span style={{ fontSize: 12, marginLeft: 1 }}>{suffix}</span> : null}
      </div>
      <div className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: col, marginTop: 1, whiteSpace: 'nowrap' }}>
        {c.diffUnit != null
          ? <>{arrow} {f(Math.abs(c.change))}{c.diffUnit}</>
          : <>{arrow} {f(Math.abs(c.change))} ({c.changeRate >= 0 ? '+' : ''}{c.changeRate.toFixed(2)}%)</>}
      </div>
      {c.note && (
        <div className="tabular-nums" style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.note}</div>
      )}
      <div style={{ marginTop: 6 }}>
        <Spark points={c.spark} change={c.change} base={isKr ? c.value - c.change : undefined} />
      </div>
    </div>
  );
}

export function CardButton({ c, on, onClick }: { c: IndexCard; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${c.name} 상세`} className="idx-card-btn"
      style={{ display: 'block', width: '100%', minWidth: 0, padding: 0, background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
      <Card c={c} on={on} />
    </button>
  );
}
