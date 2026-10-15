'use client';

/**
 * 홈 상단 지수 카드 레일 — 코스피·코스닥·USD·S&P500·나스닥·다우존스 (네이버 실시간, 10초 갱신).
 * 모바일 = 가로 스크롤, 데스크탑(≥1024) = 6칸 그리드로 전부 노출(.idx-rail — globals.css).
 * 스파크: 국내 = 당일 분봉(점선 = 전일 종가), 해외·환율 = 최근 1개월. 장중이면 '● 실시간', 아니면 '장마감'.
 * 색: 상승=빨강(--warn) · 하락=파랑(--accent).
 */
import { useState, useEffect, type CSSProperties } from 'react';
import useSWR from 'swr';

interface IndexCard {
  code: string; name: string; value: number; change: number; changeRate: number;
  live: boolean; spark: number[]; sparkLabel: string;
}
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const colorOf = (c: number) => (c > 0 ? 'var(--warn)' : c < 0 ? 'var(--accent)' : 'var(--faint)');

// 레일 구성(표시·순서) — 이 기기 한정(cloudSync SYNC_EXCLUDE). 기본 = 기존 6종(동작 불변).
const RAIL_KEY = 'kospi-lab-rail';
const DEFAULT_RAIL = ['KOSPI', 'KOSDAQ', 'USDKRW', '.INX', '.IXIC', '.DJI'];

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

const arrowBtn = (disabled: boolean): CSSProperties => ({ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface-2)', color: disabled ? 'var(--faint)' : 'var(--ink)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, fontSize: 12 });
const chipBtn: CSSProperties = { fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '3px 8px', background: 'var(--surface-2)', border: 'none', cursor: 'pointer', color: 'var(--ink)' };

function RailEditor({ pref, hidden, nameOf, onMove, onHide, onAdd, onReset }: {
  pref: string[]; hidden: string[]; nameOf: (c: string) => string;
  onMove: (i: number, d: -1 | 1) => void; onHide: (c: string) => void; onAdd: (c: string) => void; onReset: () => void;
}) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 10, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>표시 지수 · 순서</span>
        <button type="button" onClick={onReset} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>기본값</button>
      </div>
      {pref.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--faint)', margin: '0 0 8px' }}>표시할 지수를 아래에서 추가하세요.</p>}
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 0, padding: 0, listStyle: 'none' }}>
        {pref.map((code, i) => (
          <li key={code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink)' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(code)}</span>
            <button type="button" aria-label="위로" disabled={i === 0} onClick={() => onMove(i, -1)} style={arrowBtn(i === 0)}>↑</button>
            <button type="button" aria-label="아래로" disabled={i === pref.length - 1} onClick={() => onMove(i, 1)} style={arrowBtn(i === pref.length - 1)}>↓</button>
            <button type="button" onClick={() => onHide(code)} style={{ ...chipBtn, color: 'var(--accent)' }}>숨김</button>
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--faint)', margin: '10px 0 6px' }}>추가할 지수</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {hidden.map((code) => (
              <button key={code} type="button" onClick={() => onAdd(code)} style={{ ...chipBtn, border: '1px solid var(--line)' }}>+ {nameOf(code)}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function IndexRail() {
  const { data } = useSWR<{ cards: IndexCard[] }>('/api/home/indices', fetcher, { refreshInterval: 10000, revalidateOnFocus: true });
  const cards = data?.cards ?? [];
  const byCode = new Map(cards.map((c) => [c.code, c]));
  const poolCodes = cards.map((c) => c.code);
  const nameOf = (code: string) => byCode.get(code)?.name ?? code;

  const [pref, setPref] = useState<string[]>(DEFAULT_RAIL);
  const [editing, setEditing] = useState(false);
  // 저장된 레일 구성 복원 — 마운트 후 1회(하이드레이션 안전)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RAIL_KEY);
      if (raw) { const a = JSON.parse(raw); if (Array.isArray(a) && a.every((x) => typeof x === 'string')) setPref(a); }
    } catch {}
  }, []);
  const save = (next: string[]) => { setPref(next); try { localStorage.setItem(RAIL_KEY, JSON.stringify(next)); } catch {} };

  const shown = pref.filter((c) => byCode.has(c));
  const hidden = poolCodes.filter((c) => !pref.includes(c));
  const move = (i: number, d: -1 | 1) => { const n = [...pref]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; save(n); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button type="button" onClick={() => setEditing((e) => !e)}
          style={{ fontSize: 11, fontWeight: 600, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
          {editing ? '완료' : '⚙ 지수 편집'}
        </button>
      </div>
      {editing && (
        <RailEditor pref={pref} hidden={hidden} nameOf={nameOf}
          onMove={move} onHide={(c) => save(pref.filter((x) => x !== c))} onAdd={(c) => save([...pref, c])} onReset={() => save(DEFAULT_RAIL)} />
      )}
      <div className="idx-rail">
        {cards.length === 0
          ? Array.from({ length: DEFAULT_RAIL.length }).map((_, i) => <div key={i} className="idx-card skeleton" style={{ height: 112 }} />)
          : shown.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--faint)', gridColumn: '1 / -1' }}>표시할 지수가 없습니다. ⚙ 지수 편집에서 추가하세요.</p>
            : shown.map((code, i) => <Card key={code} c={byCode.get(code)!} on={i === 0} />)}
      </div>
    </div>
  );
}
