'use client';

/**
 * 종목 상세 '실적 추이' — 분기·연간 매출·영업이익·순이익 막대 + 전년 같은 기간 대비 증감 + 영업이익률·EPS·ROE 표.
 * 증권사 추정치(국내 isConsensus)는 막대를 비우고 'E'로 표시해 실적과 구분한다.
 * 참고: 네이버페이 증권 재무 탭 · 토스증권 실적 · Macrotrends/Koyfin 다년 재무 차트. 데이터 = 네이버 finance(국내·해외).
 */
import useSWR from 'swr';
import { useState } from 'react';
import Collapsible from '@/components/ui/Collapsible';
import Segmented from '@/components/ui/Segmented';
import { yoy, type StockFinance, type FinPeriod } from '@/lib/stockFinance';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
type Per = 'quarter' | 'annual';
type Metric = 'revenue' | 'op' | 'net';
const PERS: readonly (readonly [Per, string])[] = [['quarter', '분기'], ['annual', '연간']];
const METRICS: readonly (readonly [Metric, string])[] = [['revenue', '매출'], ['op', '영업이익'], ['net', '순이익']];

/** 억원 → '1.3조' '9,384억' · USD 백만 → '$109.4B' '$950M' */
function money(v: number, usd: boolean) {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (usd) return a >= 1000 ? `${s}$${(a / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B` : `${s}$${Math.round(a).toLocaleString('en-US')}M`;
  return a >= 10000 ? `${s}${(a / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}조` : `${s}${Math.round(a).toLocaleString('ko-KR')}억`;
}
const pct = (v: number | null, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}%`);

function Bars({ ps, metric, usd, annual }: { ps: FinPeriod[]; metric: Metric; usd: boolean; annual: boolean }) {
  const vals = ps.map((p) => p[metric]);
  const max = Math.max(1, ...vals.map((v) => Math.abs(v ?? 0)));
  const hasNeg = vals.some((v) => (v ?? 0) < 0);
  const H = 132; // 막대 영역 높이(px)
  const zero = hasNeg ? H * 0.75 : H; // 음수가 있으면 기준선을 위로
  return (
    <div className="flex items-end gap-1.5 sm:gap-2.5" role="img" aria-label={`${METRICS.find((m) => m[0] === metric)?.[1]} 추이: ${ps.map((p, i) => `${p.label}${p.estimate ? '(추정)' : ''} ${vals[i] != null ? money(vals[i]!, usd) : '없음'}`).join(', ')}`}>
      {ps.map((p, i) => {
        const v = vals[i];
        const h = v == null ? 0 : (Math.abs(v) / max) * (hasNeg ? H * 0.72 : H - 18);
        const g = metric !== 'net' ? yoy(ps, i, annual, metric) : null;
        const col = v != null && v < 0 ? 'var(--down)' : 'var(--accent)';
        return (
          <div key={p.key} className="flex-1 min-w-0 flex flex-col items-center">
            <div className="relative w-full" style={{ height: H }}>
              {v != null && (
                <span className="absolute left-0 right-0 text-center text-[10px] sm:text-[11px] tabular-nums font-semibold text-[var(--ink)] whitespace-nowrap"
                  style={v >= 0 ? { bottom: H - zero + h + 2 } : { top: zero + h + 2 }}>{money(v, usd)}</span>
              )}
              {v != null && (
                <span className="absolute left-1/2 -translate-x-1/2 w-[70%] max-w-[34px] rounded-[4px]"
                  style={{ ...(v >= 0 ? { bottom: H - zero } : { top: zero }), height: Math.max(2, h), background: p.estimate ? 'transparent' : col, border: p.estimate ? `1.5px dashed ${col}` : 'none' }} />
              )}
              {hasNeg && <span className="absolute left-0 right-0 border-t border-[var(--line)]" style={{ top: zero }} />}
            </div>
            <span className="mt-1.5 text-[10.5px] sm:text-[11px] tabular-nums text-[var(--text-muted)] whitespace-nowrap">{p.label}{p.estimate && <b className="text-[var(--accent)] ml-0.5">E</b>}</span>
            <span className="text-[10px] tabular-nums whitespace-nowrap" style={{ color: g == null ? 'var(--faint)' : g >= 0 ? 'var(--up)' : 'var(--down)' }}>{g == null ? ' ' : pct(g, 0)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function FinanceSection(props: { kind: 'kr'; code: string } | { kind: 'us'; symbol: string }) {
  const [per, setPer] = useState<Per>('quarter');
  const [metric, setMetric] = useState<Metric>('op');
  const url = props.kind === 'kr' ? `/api/stock/${props.code}/finance?period=${per}` : `/api/overseas/finance?symbol=${encodeURIComponent(props.symbol)}&period=${per}`;
  const { data } = useSWR<StockFinance & { error?: string }>(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  if (data && (data.error || !data.periods?.length) && per === 'quarter') return null; // 실적 자료 없는 종목(ETF 등)은 카드째 숨김
  const usd = props.kind === 'us';
  const ps = data?.periods ?? [];
  const annual = per === 'annual';
  const opName = usd ? 'EBIT' : '영업이익';
  return (
    <Collapsible title="실적 추이" sub={`${annual ? '연간' : '분기'} · 단위 ${data?.unit ?? (usd ? 'USD 백만' : '억원')}`} defaultOpen>
      <div className="flex flex-wrap gap-2 mb-4">
        <Segmented label="실적 기간" value={per} options={PERS} onChange={setPer} />
        <Segmented label="실적 항목" value={metric} options={usd ? METRICS.map(([k, l]) => [k, k === 'op' ? 'EBIT' : l] as const) : METRICS} onChange={setMetric} />
      </div>
      {!data ? <div className="skeleton" style={{ height: 180 }} /> : !ps.length ? (
        <p className="text-[12.5px] text-[var(--text-muted)] py-6 text-center">{annual ? '연간' : '분기'} 실적 자료가 없습니다.</p>
      ) : (
        <>
          <Bars ps={ps} metric={metric} usd={usd} annual={annual} />
          <p className="text-[10.5px] text-[var(--faint)] mt-1">아래 % = {annual ? '전년' : '전년 같은 분기'} 대비 증감{ps.some((p) => p.estimate) ? ' · 점선 막대·E = 증권사 추정치(실적 아님)' : ''}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12px] tabular-nums">
              <thead><tr className="text-[11px] text-[var(--text-muted)]"><th className="text-left font-medium py-1">기간</th><th className="text-right font-medium">매출</th><th className="text-right font-medium">{opName}</th><th className="text-right font-medium">이익률</th>{!usd && <th className="text-right font-medium">EPS</th>}{!usd && <th className="text-right font-medium">ROE</th>}</tr></thead>
              <tbody>
                {[...ps].reverse().map((p) => (
                  <tr key={p.key} className="border-t border-[var(--line-2)]">
                    <td className="py-1.5 text-[var(--text-muted)] whitespace-nowrap">{p.label}{p.estimate && <b className="text-[var(--accent)] ml-0.5">E</b>}</td>
                    <td className="text-right text-[var(--ink)]">{p.revenue != null ? money(p.revenue, usd) : '—'}</td>
                    <td className="text-right" style={{ color: (p.op ?? 0) < 0 ? 'var(--down)' : 'var(--ink)' }}>{p.op != null ? money(p.op, usd) : '—'}</td>
                    <td className="text-right text-[var(--text)]">{p.opMargin != null ? `${p.opMargin.toFixed(1)}%` : '—'}</td>
                    {!usd && <td className="text-right text-[var(--text)]">{p.eps != null ? p.eps.toLocaleString('ko-KR') : '—'}</td>}
                    {!usd && <td className="text-right text-[var(--text)]">{p.roe != null ? `${p.roe.toFixed(1)}%` : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[10.5px] text-[var(--faint)] mt-2">출처: 네이버페이 증권(연결 기준).</p>
    </Collapsible>
  );
}
