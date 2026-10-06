'use client';

/**
 * 요일 × 시간대 교차 히트맵(참고: TraderSync 'Day & Time') — 어느 요일 어느 시간에 벌고 잃었나.
 * 색 = 한국 관행(이익 빨강 · 손실 파랑), 농도 = 칸 순손익 ÷ 최대 절댓값. 계산은 lib/tradeBreakdown(테스트 고정).
 * ⚠ 방향 예측이 아니라 '내 과거 성적' 복기 — 표본 적은 칸은 흐리게.
 */
import { WEEKDAYS, HOUR_BANDS, THIN_SAMPLE, type Heatmap, type HeatCell } from '@/lib/tradeBreakdown';

const UP = '255,68,51';    // 이익(빨강) rgb
const DOWN = '28,108,255'; // 손실(파랑) rgb

function cellStyle(c: HeatCell | undefined, maxAbs: number): React.CSSProperties {
  if (!c) return { background: 'var(--surface-2)', opacity: 0.4 };
  const inten = maxAbs > 0 ? Math.min(1, Math.abs(c.net) / maxAbs) : 0;
  const rgb = c.net > 0 ? UP : c.net < 0 ? DOWN : '120,120,120';
  const a = 0.12 + inten * 0.62;
  return { background: `rgba(${rgb},${a})`, opacity: c.n < THIN_SAMPLE ? 0.55 : 1 };
}

export default function WeekdayHourHeatmap({ h, fmt, sub }: { h: Heatmap; fmt: (n: number) => string; sub?: string }) {
  if (!h.cells.length) return null;
  const byKey = new Map(h.cells.map((c) => [`${c.wd}-${c.band}`, c]));
  const compact = (n: number) => (Math.abs(n) >= 1000 ? `${n > 0 ? '+' : '−'}${Math.round(Math.abs(n) / 1000)}k` : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.round(Math.abs(n))}`);

  return (
    <section className="fin-card p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-[var(--text)]">요일 × 시간대</h2>
        <span className="text-[10px] text-[var(--text-muted)]">{sub ?? '어느 요일·시간에 벌고 잃었나(진입 시각 KST·순손익)'}</span>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="border-separate tabular-nums" style={{ borderSpacing: 3, minWidth: 60 + h.bands.length * 58 }}>
          <thead>
            <tr>
              <th className="text-left text-[10px] text-[var(--text-muted)] font-semibold pr-1" />
              {h.bands.map((b) => (
                <th key={b} className="text-[9.5px] text-[var(--text-muted)] font-semibold text-center" style={{ minWidth: 54 }}>{HOUR_BANDS[b].label.replace(/시$/, '')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {h.weekdays.map((wd) => (
              <tr key={wd}>
                <td className="text-[11px] font-bold text-[var(--text)] pr-1 whitespace-nowrap">{WEEKDAYS[wd]}</td>
                {h.bands.map((b) => {
                  const c = byKey.get(`${wd}-${b}`);
                  return (
                    <td key={b} className="rounded-md text-center align-middle" style={{ ...cellStyle(c, h.maxAbsNet), height: 40 }}
                      title={c ? `${WEEKDAYS[wd]} ${HOUR_BANDS[b].label}: ${c.n}건 · 순손익 ${fmt(c.net)} · 승률 ${c.winRate == null ? '—' : Math.round(c.winRate) + '%'}${c.n < THIN_SAMPLE ? ' (표본 적음)' : ''}` : '매매 없음'}>
                      {c ? (
                        <div className="leading-tight">
                          <div className="text-[11px] font-bold" style={{ color: c.net > 0 ? 'var(--warn)' : c.net < 0 ? 'var(--accent-ink)' : 'var(--text-muted)' }}>{compact(c.net)}</div>
                          <div className="text-[8.5px] text-[var(--text-muted)]">{c.n}건{c.winRate != null ? ` ${Math.round(c.winRate)}%` : ''}</div>
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10.5px] text-[var(--text-muted)] mt-2 leading-relaxed">
        {h.best && h.worst && h.best !== h.worst ? (
          <>표본 {THIN_SAMPLE}건 이상 중 가장 좋았던 칸은 <b style={{ color: 'var(--warn)' }}>{WEEKDAYS[h.best.wd]} {HOUR_BANDS[h.best.band].label}</b>(순손익 {fmt(h.best.net)}),
            가장 나빴던 칸은 <b style={{ color: 'var(--accent-ink)' }}>{WEEKDAYS[h.worst.wd]} {HOUR_BANDS[h.worst.band].label}</b>({fmt(h.worst.net)}). </>
        ) : null}
        빨강=이익·파랑=손실, 진할수록 금액이 큼. 흐린 칸은 {THIN_SAMPLE}건 미만(우연일 수 있음). 과거 기록이며 다음을 보장하지 않습니다.
      </p>
    </section>
  );
}
