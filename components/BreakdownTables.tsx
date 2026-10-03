'use client';

/**
 * 손익 분해 표 — 요일 · 시간대(KST 4시간) · 종목 탭. 참고: Edgewonk·TraderSync 의 분해 리포트.
 * 매매일지(거래소 실현손익, USDT)·성과(기록 R) 공용. 계산은 lib/tradeBreakdown(테스트 고정).
 * 표본 5건 미만 칸은 흐리게 — 몇 건짜리 '요일 효과'를 패턴으로 읽지 않게. 방향 예측이 아니라 복기용.
 */
import { useMemo, useState } from 'react';
import { byWeekday, byHourBand, bySymbol, byHoldBand, bySide, THIN_SAMPLE, type BreakItem, type BreakRow } from '@/lib/tradeBreakdown';

type Tab = 'wd' | 'hour' | 'sym' | 'side' | 'hold';
const TABS: [Tab, string][] = [['wd', '요일'], ['hour', '시간대'], ['sym', '종목'], ['side', '롱/숏'], ['hold', '보유시간']];
const HEAD: Record<Tab, string> = { wd: '요일', hour: '진입 시간(KST)', sym: '종목', side: '방향', hold: '보유 시간' };

const color = (n: number) => (n > 0 ? 'var(--warn)' : n < 0 ? 'var(--accent)' : 'var(--faint)');

export default function BreakdownTables({ items, unit, valueLabel, fmt, title = '손익 분해', sub }: {
  items: BreakItem[];
  unit: string;                       // 'USDT' · 'R'
  valueLabel: string;                 // '순손익' · 'R'
  fmt: (n: number) => string;         // 부호 포함 표시
  title?: string;
  sub?: string;
}) {
  const [picked, setTab] = useState<Tab>('wd');
  // 보유시간 탭은 진입·청산 시각을 아는 매매가 있을 때만(성과의 기록 R 에는 청산 시각이 없다)
  const hasHold = useMemo(() => items.some((i) => i.holdMs != null && i.holdMs > 0), [items]);
  // 롱/숏 탭은 방향을 아는 매매가 있을 때만(주식 매수·축소, 코인 관망 기록은 방향 없음)
  const hasSide = useMemo(() => items.some((i) => i.side === 'long' || i.side === 'short'), [items]);
  const tab: Tab = (picked === 'hold' && !hasHold) || (picked === 'side' && !hasSide) ? 'wd' : picked;
  const tabs = TABS.filter(([k]) => (k !== 'hold' || hasHold) && (k !== 'side' || hasSide));
  const rows: BreakRow[] = useMemo(() => (
    tab === 'wd' ? byWeekday(items) : tab === 'hour' ? byHourBand(items) : tab === 'hold' ? byHoldBand(items) : tab === 'side' ? bySide(items) : bySymbol(items)
  ), [items, tab]);
  const maxAbs = Math.max(1e-9, ...rows.map((r) => Math.abs(r.sum)));
  const best = rows.filter((r) => !r.thin && r.valued).sort((a, b) => b.sum - a.sum)[0];
  const worst = rows.filter((r) => !r.thin && r.valued).sort((a, b) => a.sum - b.sum)[0];

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-[var(--text)]">{title}</h2>
        {sub && <span className="text-[10px] text-[var(--text-muted)]">{sub}</span>}
        {/* 탭이 5개라 좁은 화면에선 잘리지 않고 이 안에서 가로 스크롤 */}
        <div className="ml-auto max-w-full overflow-x-auto">
          <div className="seg w-max" role="tablist" aria-label="분해 기준">
            {tabs.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`seg-i !px-2.5 whitespace-nowrap ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-xs text-[var(--text-muted)]">결과가 확정된 매매가 아직 없습니다.</p>
        ) : (
          <table className="w-full text-[12.5px] tabular-nums" style={{ minWidth: 440 }}>
            <thead>
              <tr className="text-[11px] text-[var(--text-muted)] border-b border-[var(--border)]">
                <th className="text-left font-semibold px-3 py-2">{HEAD[tab]}</th>
                <th className="text-right font-semibold px-2 py-2">건수</th>
                <th className="text-right font-semibold px-2 py-2">승률</th>
                <th className="text-left font-semibold px-2 py-2 w-[34%]">{valueLabel} 합계</th>
                <th className="text-right font-semibold px-3 py-2">평균</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-[var(--border)] last:border-0" style={{ opacity: r.thin ? 0.55 : 1 }}
                  title={r.thin ? `표본 ${r.count}건 — ${THIN_SAMPLE}건 미만은 참고만` : undefined}>
                  <td className="px-3 py-2 font-semibold text-[var(--text)] whitespace-nowrap max-w-[140px] truncate">{r.label}</td>
                  <td className="px-2 py-2 text-right text-[var(--text-muted)]">{r.count}</td>
                  <td className="px-2 py-2 text-right">{r.winRate == null ? '—' : `${r.winRate.toFixed(0)}%`}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold whitespace-nowrap" style={{ color: color(r.sum) }}>{r.valued ? fmt(r.sum) : '—'}</span>
                      {r.valued > 0 && (
                        <span aria-hidden className="h-1.5 rounded-full" style={{ width: `${Math.max(4, (Math.abs(r.sum) / maxAbs) * 100)}%`, maxWidth: 90, background: color(r.sum), opacity: 0.55 }} />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: r.avg == null ? 'var(--faint)' : color(r.avg) }}>{r.avg == null ? '—' : fmt(r.avg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(best || worst) && rows.length > 1 && (
        <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
          {best && best.sum > 0 && <>가장 잘 된 {tab === 'sym' ? '종목' : tab === 'side' ? '방향' : '구간'}: <b className="text-[var(--text)]">{best.label}</b>({fmt(best.sum)} {unit}) · </>}
          {worst && worst.sum < 0 && <>가장 깎인 {tab === 'sym' ? '종목' : tab === 'side' ? '방향' : '구간'}: <b className="text-[var(--text)]">{worst.label}</b>({fmt(worst.sum)} {unit}) · </>}
          {tab === 'hold' && <>보유 시간 = 청산 − 진입 · 평균 = 건당 기대값 · </>}
          흐린 칸은 {THIN_SAMPLE}건 미만이라 우연일 수 있습니다.
        </p>
      )}
    </section>
  );
}
