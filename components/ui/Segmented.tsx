'use client';

/**
 * SegmentedControl(기획서 §4.3) — 1일/1주/1개월, 국내/해외, 라인/캔들 같은 상호배타 선택.
 * 선택 칸만 톤 차이 + 얕은 그림자(.seg · .seg-i.on). 키보드: 화살표 좌우로 이동(role=tablist 아님 — radiogroup).
 */
import type { KeyboardEvent } from 'react';

export default function Segmented<T extends string>({ value, options, onChange, label, className = '' }: {
  value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string; className?: string;
}) {
  const idx = options.findIndex(([k]) => k === value);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (idx + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    onChange(options[n][0]);
  };
  return (
    <div role="radiogroup" aria-label={label} className={`seg ${className}`} onKeyDown={onKey}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={k === value} tabIndex={k === value ? 0 : -1}
          className={`seg-i ${k === value ? 'on' : ''}`} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}
