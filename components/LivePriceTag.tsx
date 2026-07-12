'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 분석 결과(스냅샷)와 별개로 실시간 시세를 표시한다.
 * - 가격 변동 시 상승/하락 색으로 플래시
 * - 분석 시점 대비 이동폭 표시, 임계 초과 시 재분석 권장
 * 색상 규약이 페이지마다 다르다(주식 빨강=상승, 코인 초록=상승) — upClass/downClass로 주입.
 */
interface Props {
  live: number | null | undefined;
  analyzed: number;
  format: (n: number) => string;
  upClass?: string;
  downClass?: string;
  /** 분석 시점 대비 이 % 이상 이동하면 재분석 권장 배지 */
  staleThresholdPct: number;
}

export default function LivePriceTag({
  live, analyzed, format,
  upClass = 'text-emerald-400', downClass = 'text-red-400',
  staleThresholdPct,
}: Props) {
  const price = live ?? analyzed;
  const prevRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = price;
    if (prev !== null && price !== prev) {
      setFlash(price > prev ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(t);
    }
  }, [price]);

  const deltaPct = live != null && analyzed > 0 ? ((live - analyzed) / analyzed) * 100 : null;
  const stale = deltaPct !== null && Math.abs(deltaPct) >= staleThresholdPct;

  return (
    <div>
      <p className={`text-3xl font-bold tabular-nums mt-0.5 transition-colors duration-500 ${
        flash === 'up' ? upClass : flash === 'down' ? downClass : 'text-[var(--text)]'
      }`}>
        {format(price)}
      </p>
      {deltaPct !== null && (
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 tabular-nums">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1 align-middle" />
          실시간 · 분석시점({format(analyzed)}) 대비 {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%
        </p>
      )}
      {stale && (
        <p className="text-[10px] font-semibold text-amber-400 mt-1">
          ⚠ 분석 이후 가격이 {Math.abs(deltaPct!).toFixed(1)}% 이동 — 손절·목표가가 낡았습니다. 분석을 다시 실행하세요.
        </p>
      )}
    </div>
  );
}
