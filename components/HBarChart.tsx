'use client';

/**
 * 경량 수평 막대 차트 (CSS 전용, Recharts 불필요).
 *  - mode 'magnitude': 0→최대값 왼쪽 정렬 (거래대금·거래량·시총 등)
 *  - mode 'divergent' : 0을 가운데 두고 좌(음)/우(양) (등락률 등)
 */
export interface BarItem {
  label: string;
  value: number;      // 정렬·스케일용 실제값
  display: string;    // 오른쪽에 보일 포맷 문자열
}

export default function HBarChart({
  items, mode = 'magnitude', posColor = 'bg-red-400/70', negColor = 'bg-blue-400/70',
}: {
  items: BarItem[];
  mode?: 'magnitude' | 'divergent';
  posColor?: string;
  negColor?: string;
}) {
  if (!items.length) return <p className="text-xs text-[var(--text-muted)] py-3 text-center">데이터 없음</p>;
  const maxAbs = Math.max(1e-9, ...items.map((i) => Math.abs(i.value)));

  return (
    <div className="space-y-1.5">
      {items.map((it, idx) => {
        const w = (Math.abs(it.value) / maxAbs) * 100;
        const pos = it.value >= 0;
        if (mode === 'divergent') {
          return (
            <div key={idx} className="flex items-center gap-2 text-[11px]">
              <span className="w-20 shrink-0 truncate text-[var(--text)]" title={it.label}>{it.label}</span>
              <div className="flex-1 flex items-center h-3">
                <div className="w-1/2 flex justify-end">
                  {!pos && <div className={`h-3 rounded-l-sm ${negColor}`} style={{ width: `${w}%` }} />}
                </div>
                <div className="w-px h-3 bg-[var(--border)]" />
                <div className="w-1/2">
                  {pos && <div className={`h-3 rounded-r-sm ${posColor}`} style={{ width: `${w}%` }} />}
                </div>
              </div>
              <span className={`w-16 shrink-0 text-right tabular-nums ${pos ? 'text-red-400' : 'text-blue-400'}`}>{it.display}</span>
            </div>
          );
        }
        return (
          <div key={idx} className="flex items-center gap-2 text-[11px]">
            <span className="w-24 shrink-0 truncate text-[var(--text)]" title={it.label}>{it.label}</span>
            <div className="flex-1 h-3 rounded-sm bg-white/5 overflow-hidden">
              <div className={`h-full rounded-sm ${posColor}`} style={{ width: `${w}%` }} />
            </div>
            <span className="w-16 shrink-0 text-right tabular-nums text-[var(--text-muted)]">{it.display}</span>
          </div>
        );
      })}
    </div>
  );
}
