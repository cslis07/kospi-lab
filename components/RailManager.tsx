'use client';

/**
 * 지수 레일 구성 편집기 — 표시 지수 순서(↑/↓)·숨김·추가·기본값.
 * 홈 상단 레일(IndexRail)과 관심종목 화면이 공유하는 공용 UI. pref·save 는 useRailPref 에서 온다.
 */
import { type CSSProperties } from 'react';
import { DEFAULT_RAIL } from '@/hooks/useRailPref';

const arrowBtn = (disabled: boolean): CSSProperties => ({ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface-2)', color: disabled ? 'var(--faint)' : 'var(--ink)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, fontSize: 12 });
const chipBtn: CSSProperties = { fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '3px 8px', background: 'var(--surface-2)', border: 'none', cursor: 'pointer', color: 'var(--ink)' };

export default function RailManager({ pref, poolCodes, nameOf, save }: {
  pref: string[]; poolCodes: string[]; nameOf: (c: string) => string; save: (next: string[]) => void;
}) {
  const hidden = poolCodes.filter((c) => !pref.includes(c));
  const move = (i: number, d: -1 | 1) => { const n = [...pref]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; save(n); };
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>표시 지수 · 순서</span>
        <button type="button" onClick={() => save(DEFAULT_RAIL)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>기본값</button>
      </div>
      {pref.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--faint)', margin: '0 0 8px' }}>표시할 지수를 아래에서 추가하세요.</p>}
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 0, padding: 0, listStyle: 'none' }}>
        {pref.map((code, i) => (
          <li key={code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink)' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(code)}</span>
            <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)} style={arrowBtn(i === 0)}>↑</button>
            <button type="button" aria-label="아래로" disabled={i === pref.length - 1} onClick={() => move(i, 1)} style={arrowBtn(i === pref.length - 1)}>↓</button>
            <button type="button" onClick={() => save(pref.filter((x) => x !== code))} style={{ ...chipBtn, color: 'var(--accent)' }}>숨김</button>
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--faint)', margin: '10px 0 6px' }}>추가할 지수</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {hidden.map((code) => (
              <button key={code} type="button" onClick={() => save([...pref, code])} style={{ ...chipBtn, border: '1px solid var(--line)' }}>+ {nameOf(code)}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
