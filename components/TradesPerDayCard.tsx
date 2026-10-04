/**
 * 하루 매매 횟수별 성적 — 과매매한 날의 매매가 실제로 더 나빴나(참고: TraderSync).
 * 계산은 lib/journalAnalytics.tradesPerDay(테스트 고정). 진입 시각(KST) 기준.
 */
import type { TradesPerDayRow } from '@/lib/journalAnalytics';

const tone = (n: number) => (n > 0 ? 'var(--warn)' : n < 0 ? 'var(--accent-ink)' : 'var(--text)');

export default function TradesPerDayCard({ rows, fmt, unit = 'USDT' }: { rows: TradesPerDayRow[]; fmt: (n: number) => string; unit?: string }) {
  if (rows.length < 2) return null;
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
  const low = rows[0], high = rows[rows.length - 1];
  const worse = low.avg != null && high.avg != null && !low.thin && !high.thin && high.avg < low.avg;

  return (
    <section className="fin-card p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-[var(--text)]">하루 매매 횟수별 <span className="text-[10px] font-normal text-[var(--text-muted)]">과매매한 날이 더 나빴나</span></h2>
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[12px] tabular-nums mx-1" style={{ minWidth: 300 }}>
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-semibold py-1">빈도</th><th className="font-semibold">날</th><th className="font-semibold">매매</th>
              <th className="font-semibold">승률</th><th className="font-semibold">건당</th><th className="font-semibold">합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-[var(--line-2)] text-right" style={{ opacity: r.thin ? 0.55 : 1 }} title={r.thin ? `${r.days}일 — 5일 미만은 참고만` : undefined}>
                <td className="text-left py-1.5 font-semibold text-[var(--text)] whitespace-nowrap">{r.label}</td>
                <td className="text-[var(--text-muted)]">{r.days}</td>
                <td className="text-[var(--text-muted)]">{r.count}</td>
                <td>{r.winRate == null ? '—' : `${Math.round(r.winRate)}%`}</td>
                <td className="font-bold" style={{ color: r.avg == null ? 'var(--faint)' : tone(r.avg) }}>{r.avg == null ? '—' : signed(r.avg)}</td>
                <td style={{ color: tone(r.sum) }}>{signed(r.sum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mt-2 leading-relaxed">
        {worse
          ? <>많이 매매한 날(<b>{high.label}</b>)의 건당 기대값 <b style={{ color: tone(high.avg!) }}>{signed(high.avg!)}</b>이 적게 한 날(<b>{low.label}</b> <b style={{ color: tone(low.avg!) }}>{signed(low.avg!)}</b>)보다 낮습니다 — 과매매 신호일 수 있습니다. </>
          : '건당 = 그 빈도 날들의 매매 1건당 기대값. 빈도가 높을수록 건당이 낮아지면 과매매 신호입니다. '}
        날·매매 = 진입 시각(KST) 기준. 흐린 줄은 5일 미만.
      </p>
    </section>
  );
}
