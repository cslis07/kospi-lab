'use client';

/**
 * 경제지표(FRED) 단일 지표 상세 — 요약 카드 + 히스토리 차트 + 발표 내역 표 + 설명/영향.
 * /macro 페이지와 시장지표 페이지의 바텀시트가 공용으로 쓴다(표현 한 곳 유지).
 */
import Link from 'next/link';
import MacroChartLazy from '@/components/MacroChartLazy';
import type { MacroIndicator } from '@/lib/macroData';

export const FLAG: Record<string, string> = { US: '🇺🇸', KR: '🇰🇷' };
// FRED 지표 → 인베스팅 발표 이력(결과·예측) 연결
export const RELEASES_LINK: Record<string, { id: string; label: string }> = {
  cpi: { id: 'cpi-733', label: 'CPI 발표 이력·예측' },
  ppi: { id: 'core-ppi-62', label: '근원 PPI 발표 이력·예측' },
};

function fmtNum(v: number | null | undefined, dec: number) {
  return v == null ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(v: number | null) {
  return v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
// 상승=빨강 / 하락=파랑 (국내 관행)
function chgClass(v: number | null) {
  if (v == null || v === 0) return 'text-[var(--text-muted)]';
  return v > 0 ? 'text-red-400' : 'text-blue-400';
}
function fmtPeriod(d: string, monthly: boolean) {
  const [y, m, day] = d.split('-');
  return monthly ? `${y}.${m}` : `${y.slice(2)}.${m}.${day}`;
}

export default function MacroDetail({ cur }: { cur: MacroIndicator }) {
  if (!cur.latest) {
    return (
      <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">
        FRED 응답이 비었습니다(키 미설정 또는 일시 오류). 잠시 후 다시 시도하세요.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {/* 현재값 요약 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">{FLAG[cur.country]} {cur.label}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">기준일 {cur.latest.date} · {cur.schedule}</p>
            {RELEASES_LINK[cur.id] && (
              <Link href={`/releases?id=${RELEASES_LINK[cur.id].id}`} className="inline-block mt-1 text-[11px] font-semibold text-[var(--accent-ink)]">{RELEASES_LINK[cur.id].label} →</Link>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold tabular-nums text-[var(--text)]">{fmtNum(cur.latest.value, cur.decimals)}<span className="text-xs font-normal text-[var(--text-muted)] ml-1">{cur.unit}</span></p>
            <p className={`text-xs font-semibold tabular-nums ${chgClass(cur.changePct)}`}>
              {cur.periodicity === 'monthly' ? '전월대비' : '전일대비'} {fmtPct(cur.changePct)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="rounded-xl border border-[var(--border)] bg-white/3 p-2.5">
            <p className="text-[10px] text-[var(--text-muted)]">이전</p>
            <p className="text-sm font-bold tabular-nums text-[var(--text)] mt-0.5">{fmtNum(cur.prev?.value, cur.decimals)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-white/3 p-2.5">
            <p className="text-[10px] text-[var(--text-muted)]">{cur.periodicity === 'monthly' ? '전월대비' : '전일대비'}</p>
            <p className={`text-sm font-bold tabular-nums mt-0.5 ${chgClass(cur.changePct)}`}>{fmtPct(cur.changePct)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-white/3 p-2.5">
            <p className="text-[10px] text-[var(--text-muted)]">{cur.periodicity === 'monthly' ? '전년동월대비(YoY)' : '추세'}</p>
            <p className={`text-sm font-bold tabular-nums mt-0.5 ${cur.periodicity === 'monthly' ? chgClass(cur.yoyPct) : 'text-[var(--text-muted)]'}`}>
              {cur.periodicity === 'monthly' ? fmtPct(cur.yoyPct) : '아래 차트'}
            </p>
          </div>
        </div>
      </div>

      {/* 차트 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">히스토리 <span className="text-[10px] font-normal text-[var(--text-muted)]">{cur.periodicity === 'monthly' ? '최근 24개월' : '최근 60영업일'}</span></h2>
        <MacroChartLazy data={cur.history} decimals={cur.decimals} monthly={cur.periodicity === 'monthly'} unit={cur.unit} />
      </div>

      {/* 발표 내역 표 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">발표 내역</h2>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                <th className="text-left px-3 py-2 text-[var(--text-muted)] font-medium">기간</th>
                <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">실제</th>
                <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">{cur.periodicity === 'monthly' ? '전월대비' : '전일대비'}</th>
              </tr>
            </thead>
            <tbody>
              {[...cur.history].reverse().slice(0, 12).map((p, i, arr) => {
                const next = arr[i + 1];
                const ch = next && next.value !== 0 ? ((p.value - next.value) / next.value) * 100 : null;
                return (
                  <tr key={p.date} className={i % 2 === 1 ? 'bg-[var(--bg)]/30' : ''}>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{fmtPeriod(p.date, cur.periodicity === 'monthly')}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--text)]">{fmtNum(p.value, cur.decimals)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${chgClass(ch)}`}>{ch == null ? '-' : fmtPct(ch)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 설명·영향 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
        <div>
          <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">지표 설명</p>
          <p className="text-[13px] text-[var(--text)] leading-relaxed">{cur.desc}</p>
        </div>
        <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-semibold text-[var(--accent-ink)] mb-1">코인·주식에 주는 영향</p>
          <p className="text-[13px] text-[var(--text)] leading-relaxed">{cur.impact}</p>
        </div>
      </div>
    </div>
  );
}
