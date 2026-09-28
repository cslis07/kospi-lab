'use client';

/**
 * 비트겟 USDT 선물 청산 내역 — 거래소가 아는 사실을 그대로 표로.
 * 진입가·청산가·순손익(수수료·펀딩 반영)·진입/청산 시각 + SL 주문에서 복구한 손절가.
 * 읽기 전용 조회. /api/bitget/history (게이트 뒤, 선물 읽기 권한 필요).
 * 정렬: 종목·순손익·청산시각(헤더 클릭 토글). 요약에 플러스 합계·마이너스 합계 분리 표시.
 */
import { useState, useMemo } from 'react';
import useSWR from 'swr';

interface ClosedPosition {
  positionId: string; symbol: string; side: 'long' | 'short';
  openAvg: number; closeAvg: number; size: number;
  netProfit: number; grossPnl: number; fee: number; funding: number;
  openTs: number; closeTs: number; stop?: number;
}
interface Resp { configured?: boolean; error?: string; positions?: ClosedPosition[]; slRecovered?: number; days?: number }

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const fnum = (n: number, d = 2) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const fdt = (ts: number) => { const d = new Date(ts); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

type SortKey = 'time' | 'symbol' | 'pnl';

export default function ClosedTrades() {
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [asc, setAsc] = useState(false);
  const { data, isLoading } = useSWR<Resp>(`/api/bitget/history?days=${days}`, fetcher, { revalidateOnFocus: false });

  const pos = useMemo(() => data?.positions ?? [], [data]);
  const sorted = useMemo(() => {
    const arr = [...pos];
    arr.sort((a, b) => {
      let d: number;
      if (sortKey === 'symbol') d = a.symbol.localeCompare(b.symbol) || a.closeTs - b.closeTs;
      else if (sortKey === 'pnl') d = a.netProfit - b.netProfit;
      else d = a.closeTs - b.closeTs;
      return asc ? d : -d;
    });
    return arr;
  }, [pos, sortKey, asc]);
  // 순손익 플러스/마이너스 각각의 합계·건수
  const tot = useMemo(() => {
    let plus = 0, minus = 0, winN = 0, lossN = 0;
    for (const p of pos) {
      if (p.netProfit > 0) { plus += p.netProfit; winN++; }
      else if (p.netProfit < 0) { minus += p.netProfit; lossN++; }
    }
    return { plus, minus, winN, lossN };
  }, [pos]);

  if (data && data.configured === false) return null;         // 키 미설정은 상위 안내로 충분
  const total = pos.reduce((a, p) => a + p.netProfit, 0);
  const wins = pos.filter((p) => p.netProfit > 0).length;
  const decided = pos.filter((p) => p.netProfit !== 0).length;

  const toggle = (k: SortKey) => { if (sortKey === k) setAsc((v) => !v); else { setSortKey(k); setAsc(k === 'symbol'); } };
  const arrow = (k: SortKey) => (sortKey === k ? (asc ? ' ▲' : ' ▼') : '');
  const thSort = 'cursor-pointer select-none hover:text-[var(--text)]';

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-[var(--text)]">선물 청산 내역 <span className="text-[10px] font-normal text-[var(--text-muted)]">거래소 자동</span></h2>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-[11px] px-2 py-1 rounded-lg font-semibold ${days === d ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>{d}일</button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-xs text-[var(--text-muted)] py-6 text-center animate-pulse">거래소 이력 불러오는 중…</p>}
      {data?.error && (
        <p className="text-xs text-amber-600 py-4">청산 내역 조회 실패 — API 키에 <strong>선물 읽기</strong> 권한이 필요합니다. (현물은 별개)</p>
      )}
      {data && !data.error && pos.length === 0 && (
        <p className="text-xs text-[var(--text-muted)] py-6 text-center">최근 {days}일 청산된 선물 포지션이 없습니다.</p>
      )}

      {pos.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2 text-center">
            <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
              <p className="text-[10px] text-[var(--text-muted)]">순손익 합계</p>
              <p className={`text-base font-bold tabular-nums ${total >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{total >= 0 ? '+' : ''}{fnum(total)}</p>
            </div>
            <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
              <p className="text-[10px] text-[var(--text-muted)]">건수 · 승률</p>
              <p className="text-base font-bold tabular-nums text-[var(--text)]">{pos.length}건 · {decided ? Math.round((wins / decided) * 100) : 0}%</p>
            </div>
            <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
              <p className="text-[10px] text-[var(--text-muted)]">손절가 복구</p>
              <p className="text-base font-bold tabular-nums text-[var(--text)]">{data?.slRecovered ?? 0}건</p>
            </div>
          </div>

          {/* 플러스·마이너스 합계 분리 */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-2.5 text-center">
              <p className="text-[10px] text-[var(--text-muted)]">플러스 합계 <span className="text-emerald-600">{tot.winN}건</span></p>
              <p className="text-base font-bold tabular-nums text-emerald-500">+{fnum(tot.plus)}</p>
            </div>
            <div className="rounded-xl border border-red-500/25 bg-red-500/[0.05] p-2.5 text-center">
              <p className="text-[10px] text-[var(--text-muted)]">마이너스 합계 <span className="text-red-600">{tot.lossN}건</span></p>
              <p className="text-base font-bold tabular-nums text-red-500">{fnum(tot.minus)}</p>
            </div>
          </div>

          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-[11px] min-w-[560px]">
              <thead>
                <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border)]">
                  <th className={`font-normal py-1.5 ${thSort}`} onClick={() => toggle('symbol')}>종목{arrow('symbol')}</th>
                  <th className="font-normal text-right">진입가</th>
                  <th className="font-normal text-right">청산가</th>
                  <th className="font-normal text-right">손절가</th>
                  <th className={`font-normal text-right ${thSort}`} onClick={() => toggle('pnl')}>순손익{arrow('pnl')}</th>
                  <th className="font-normal text-right">진입</th>
                  <th className={`font-normal text-right ${thSort}`} onClick={() => toggle('time')}>청산{arrow('time')}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {sorted.map((p) => (
                  <tr key={p.positionId} className="border-b border-[var(--border)]/50">
                    <td className="py-1.5">
                      <span className="font-semibold text-[var(--text)]">{p.symbol.replace('USDT', '')}</span>
                      <span className={`ml-1.5 text-[9px] px-1 py-0.5 rounded ${p.side === 'long' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>{p.side === 'long' ? '롱' : '숏'}</span>
                    </td>
                    <td className="text-right text-[var(--text)]">{fnum(p.openAvg, 4)}</td>
                    <td className="text-right text-[var(--text)]">{fnum(p.closeAvg, 4)}</td>
                    <td className="text-right text-[var(--text-muted)]">{p.stop != null && p.stop > 0 ? fnum(p.stop, 4) : '—'}</td>
                    <td className={`text-right font-semibold ${p.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{p.netProfit >= 0 ? '+' : ''}{fnum(p.netProfit)}</td>
                    <td className="text-right text-[var(--text-muted)]">{fdt(p.openTs)}</td>
                    <td className="text-right text-[var(--text-muted)]">{fdt(p.closeTs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
            순손익 = 실현손익 − 수수료 + 펀딩. 손절가는 거래소에 <strong>SL 주문을 걸어둔 매매</strong>에서만 복구됩니다(계획 손절은 지어내지 않음).
            헤더의 <strong>종목·순손익·청산</strong>을 눌러 정렬할 수 있습니다.
          </p>
        </>
      )}
    </div>
  );
}
