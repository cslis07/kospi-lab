'use client';

/**
 * 지난 발표 — 실제 vs 컨센서스 서프라이즈 (Nowflation 'Past releases' 참고).
 * econcal_window.json(미국 High/Medium 영향, actual·estimate·previous 있는 과거 발표)에서
 * 최근순으로. 서프라이즈=실제−컨센서스(상회 빨강/하회 파랑).
 */
import type { EconCalWindow } from '@/lib/inflation';

const num = (v?: number | null) => (v == null ? '—' : (+v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const unitSuffix = (u?: string | null) => (u && u !== 'K' && u !== 'B' && u !== 'M' ? u : '');
const fx = (v?: number | null, u?: string | null) => (v == null ? '—' : `${num(v)}${unitSuffix(u)}`);

export default function PastReleases({ ec, limit = 10 }: { ec?: EconCalWindow; limit?: number }) {
  const rows = (ec?.events ?? [])
    .filter((e) => e.country === 'US' && e.actual != null && e.estimate != null && (e.impact === 'High' || e.impact === 'Medium'))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit);
  if (!rows.length) return null;

  return (
    <div className="fin-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums min-w-[460px]">
          <thead>
            <tr className="text-[var(--text-muted)] text-left border-b border-[var(--line-2)]">
              <th className="font-medium px-3 py-2">지표</th>
              <th className="font-medium">날짜</th>
              <th className="font-medium text-right">실제</th>
              <th className="font-medium text-right">컨센서스</th>
              <th className="font-medium text-right">서프라이즈</th>
              <th className="font-medium text-right px-3">직전</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => {
              const sur = e.actual != null && e.estimate != null ? e.actual - e.estimate : null;
              const sc = sur == null || Math.abs(sur) < 1e-9 ? 'text-[var(--text-muted)]' : sur > 0 ? 'text-red-400' : 'text-blue-400';
              return (
                <tr key={`${e.event}-${e.date}-${i}`} className="border-b border-[var(--line-2)] last:border-0">
                  <td className="px-3 py-2 text-[var(--text)] max-w-[180px] truncate" title={e.event}>{e.event}{e.unit && (e.unit === 'K' || e.unit === 'B' || e.unit === 'M') ? <span className="text-[9px] text-[var(--text-muted)] ml-1">{e.unit}</span> : null}</td>
                  <td className="text-[var(--text-muted)]">{String(e.date).slice(5, 10).replace('-', '/')}</td>
                  <td className="text-right font-bold text-[var(--text)]">{fx(e.actual, e.unit)}</td>
                  <td className="text-right text-[var(--text-muted)]">{fx(e.estimate, e.unit)}</td>
                  <td className={`text-right font-semibold ${sc}`}>{sur == null ? '—' : Math.abs(sur) < 1e-9 ? '0' : `${sur > 0 ? '+' : ''}${(+sur).toFixed(Math.abs(sur) >= 10 ? 1 : 2)}`}</td>
                  <td className="text-right text-[var(--text-muted)] px-3">{fx(e.previous, e.unit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] px-3 py-2 leading-snug">미국 영향 높음·보통 지표만. 서프라이즈=실제−컨센서스(상회 <span className="text-red-400">빨강</span>·하회 <span className="text-blue-400">파랑</span>). 출처 Nowflation·FMP 경제 캘린더. 매매 신호 아님.</p>
    </div>
  );
}
