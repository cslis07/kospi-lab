'use client';

/**
 * 시장 벤치마크 공용 조각 — 매매일지(/journal, 통화·원금 기준)와 성과(/performance, R 기준)가 함께 쓴다.
 * 공통: 매매 기간 지수 수익률 그리드 · 지수 선택 칩 · 월별 비교 표(내 열은 renderMine 으로 주입).
 * 데이터·순수 계산은 lib/journalAnalytics(periodReturn·monthlyPnl). 차이(통화 % vs R)는 호출부에서 renderMine 으로 흡수.
 */
import type { ReactNode } from 'react';
import useSWR from 'swr';
import { periodReturn, monthlyPnl, kstDateKey, type TradeValue, type PricePt } from '@/lib/journalAnalytics';

export type MacroDaily = { btc: PricePt[]; nasdaq: PricePt[]; kospi: PricePt[] };
export type BmIdxKey = 'btc' | 'nasdaq' | 'kospi';
export const BM_IDX: readonly (readonly [BmIdxKey, string])[] = [['btc', '비트코인'], ['nasdaq', '나스닥'], ['kospi', '코스피']];

const bmFetcher = (u: string) => fetch(u).then((r) => r.json());
/** 지수 일별 종가(비트코인·나스닥·코스피) — 느리게 변해 포커스 재검증 끔 */
export const useMacroDaily = () => useSWR<MacroDaily>('/api/macro/daily', bmFetcher, { revalidateOnFocus: false });

/** 부호 색(상승=빨강·하락=파랑, 한국 관행). 지수 %·비교 공용. */
export const bmCol = (v: number | null) => (v == null ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text-muted)]');
/** 매매 기간 [from, to] (KST). 빈 배열이면 빈 문자열. */
export function bmSpan(trades: TradeValue[]): { from: string; to: string } {
  if (!trades.length) return { from: '', to: '' };
  const ts = trades.map((t) => t.ts);
  return { from: kstDateKey(Math.min(...ts)), to: kstDateKey(Math.max(...ts)) };
}

/** 매매 기간 동안 3개 지수 수익률 카드 */
export function IndexReturnGrid({ data, from, to }: { data?: MacroDaily; from: string; to: string }) {
  const rows: [string, number | null][] = BM_IDX.map(([k, l]) => [l, data ? periodReturn(data[k], from, to) : null]);
  return (
    <div className="grid grid-cols-3 gap-2">
      {rows.map(([k, v]) => (
        <div key={k} className="rounded-xl border border-[var(--border)] p-2.5">
          <p className="text-[11px] text-[var(--text-muted)]">{k}</p>
          <p className={`text-base font-bold tabular-nums ${v == null ? 'text-[var(--text-muted)]' : bmCol(v)}`}>{v == null ? (data ? '—' : '…') : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}</p>
        </div>
      ))}
    </div>
  );
}

/** 지수 선택 칩 */
export function IndexChips({ idx, setIdx }: { idx: BmIdxKey; setIdx: (k: BmIdxKey) => void }) {
  const chip = (on: boolean) => `px-2 py-0.5 rounded-md text-[11px] font-semibold ${on ? 'bg-[var(--surface-2)] text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'}`;
  return <div className="flex gap-1">{BM_IDX.map(([k, l]) => <button key={k} type="button" className={chip(idx === k)} onClick={() => setIdx(k)}>{l}</button>)}</div>;
}

/** 월별 비교 표 — 내 열(renderMine 으로 통화/%/R 주입) vs 지수 월간 %(그 달 종가 기준) */
export function MonthlyCompare({ trades, series, idxLabel, mineHeader, renderMine }: {
  trades: TradeValue[]; series?: PricePt[]; idxLabel: string; mineHeader: string;
  renderMine: (monthSum: number) => ReactNode;
}) {
  const monPnl = monthlyPnl(trades);
  const months = [...monPnl.keys()].sort().reverse();
  if (!months.length) return null;
  const pctStr = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <table className="w-full text-[11px] tabular-nums">
        <thead>
          <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text-muted)]">
            <th className="text-left px-2.5 py-1.5 font-semibold">월</th>
            <th className="text-right px-2.5 py-1.5 font-semibold">{mineHeader}</th>
            <th className="text-right px-2.5 py-1.5 font-semibold">{idxLabel}</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const idxRet = series ? periodReturn(series, `${m}-01`, `${m}-31`) : null;
            return (
              <tr key={m} className="border-b border-[var(--border)]/50">
                <td className="px-2.5 py-1.5 text-[var(--text)]">{m}</td>
                <td className="px-2.5 py-1.5 text-right font-bold">{renderMine(monPnl.get(m) ?? 0)}</td>
                <td className={`px-2.5 py-1.5 text-right ${bmCol(idxRet)}`}>{pctStr(idxRet)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
