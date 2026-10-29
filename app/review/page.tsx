'use client';

/**
 * 복기 대시보드 — 하단 '복기' 탭의 단일 화면(2026-10-29, 사용자 요청 "정말 필요한 부분만").
 *  ① 일별 진입·매매 횟수(DailyTradesCard + 하루 매매 횟수별 성적)
 *  ② 손익 분해(요일·시간대·보유·코인·방향·손절·규모)
 *  ③ 비용 분석(수수료·펀딩·보유시간대별·출금)
 *  ④ 수수료 진단(지정가 vs 시장가)
 * 나머지(성적·비용 누수·규율·가정·선행 테스트)는 더보기 › 📒 복기 상세 — 매매일지(/journal?tab=…)·/paper 그대로.
 * 데이터는 매매일지와 같은 소스(Bitget 청산 이력, 읽기 전용).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DailyTradesCard from '@/components/DailyTradesCard';
import TradesPerDayCard from '@/components/TradesPerDayCard';
import BreakdownTables from '@/components/BreakdownTables';
import CostCard from '@/components/CostCard';
import FeeDiagCard from '@/components/FeeDiagCard';
import { tradesPerDay } from '@/lib/journalAnalytics';
import { costBreakdown, costByHoldBand, cashFlow, type CashMove } from '@/lib/tradeCosts';
import type { BreakItem } from '@/lib/tradeBreakdown';
import type { ClosedPosition } from '@/app/api/bitget/history/route';

const COIN_NAME: Record<string, string> = { BTCUSDT: '비트코인', ETHUSDT: '이더리움', XRPUSDT: '리플', SOLUSDT: '솔라나' };
const coinName = (s: string) => COIN_NAME[s] ?? s.replace(/USDT$/, '');
const fmtPnl = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
const fmtUsdt = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100));

const DETAIL: { href: string; label: string }[] = [
  { href: '/journal', label: '성적' },
  { href: '/journal?tab=cost', label: '비용 누수' },
  { href: '/journal?tab=discipline', label: '규율' },
  { href: '/journal?tab=whatif', label: '가정' },
  { href: '/paper', label: '선행 테스트' },
];

export default function ReviewPage() {
  const [days, setDays] = useState(30);
  const [positions, setPositions] = useState<ClosedPosition[]>([]);
  const [moves, setMoves] = useState<{ withdrawals: CashMove[]; deposits: CashMove[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (d: number) => {
    setBusy(true); setErr(null);
    try {
      const [hRes, tRes] = await Promise.all([
        fetch(`/api/bitget/history?days=${d}`),
        fetch(`/api/bitget/transfers?days=${d}`).catch(() => null),
      ]);
      let mv: { withdrawals: CashMove[]; deposits: CashMove[] } | null = null;
      if (tRes && tRes.ok) {
        try { const tj = await tRes.json() as { withdrawals?: CashMove[]; deposits?: CashMove[]; error?: string }; if (!tj.error && Array.isArray(tj.withdrawals)) mv = { withdrawals: tj.withdrawals, deposits: tj.deposits ?? [] }; } catch { /* 무시 */ }
      }
      setMoves(mv);
      if (hRes.status === 401) { setErr('잠금 상태입니다 — 계좌 화면에서 접근 토큰을 1회 입력하세요.'); setPositions([]); return; }
      const j = await hRes.json() as { configured?: boolean; error?: string; positions?: ClosedPosition[] };
      if (j.configured === false) { setErr('Bitget API 키가 서버에 설정되지 않았습니다.'); setPositions([]); return; }
      if (j.error) { setErr(`거래소 조회 실패 — ${j.error}`); setPositions([]); return; }
      setPositions(j.positions ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); setLoaded(true); }
  }, []);
  // 진입 시 1회 + 기간 변경 시 재조회(타이머 콜백 — 이펙트 본문에서 바로 setState 하지 않게)
  useEffect(() => { const t = setTimeout(() => load(days), 0); return () => clearTimeout(t); }, [days, load]);

  // 매매일지와 같은 계산(진입 시각 기준 분해 · 수수료·펀딩 반영 netProfit)
  const breakItems: BreakItem[] = useMemo(() => positions.map((p) => ({
    ts: p.openTs || p.closeTs, symbol: p.symbol, label: coinName(p.symbol), value: p.netProfit,
    win: p.netProfit > 0 ? true : p.netProfit < 0 ? false : null,
    holdMs: p.openTs && p.closeTs > p.openTs ? p.closeTs - p.openTs : null,
    side: p.side, hasStop: p.stop != null, notional: p.size * p.openAvg,
  })), [positions]);
  const perDay = useMemo(() => tradesPerDay(positions.map((p) => ({ ts: p.openTs || p.closeTs, value: p.netProfit }))), [positions]);
  const costs = useMemo(() => costBreakdown(positions), [positions]);
  const holdCosts = useMemo(() => costByHoldBand(positions), [positions]);
  const cash = useMemo(() => (moves ? cashFlow(moves.withdrawals, moves.deposits, costs.net) : null), [moves, costs.net]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-lg font-bold text-[var(--text)]">복기 대시보드</h1>
      <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">Bitget 청산 기록 기준 · 수수료·펀딩 반영 · 읽기 전용. 매매 신호가 아니라 내 매매 습관을 보는 화면입니다.</p>

      <div className="flex items-center gap-1.5 mb-3" role="group" aria-label="조회 기간">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} disabled={busy} aria-pressed={days === d}
            className={`px-3 min-h-[36px] min-w-[48px] rounded-lg border text-[12px] font-semibold transition-colors disabled:opacity-50 ${
              days === d ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)]'
            }`}>{d}일</button>
        ))}
        {busy && <span className="text-[11px] text-[var(--text-muted)] ml-1">불러오는 중…</span>}
      </div>

      {err && <p className="mb-3 text-[12px] text-red-400">⚠ {err} {err.includes('잠금') && <Link href="/bitget" className="underline">계좌로 이동</Link>}</p>}
      {loaded && !err && !positions.length && <p className="mb-3 text-[12px] text-[var(--text-muted)]">최근 {days}일 청산된 선물 포지션이 없습니다.</p>}
      {!loaded && <div className="skeleton h-40 rounded-xl mb-3" />}

      {positions.length > 0 && (
        <>
          {/* ① 일별 진입·매매 횟수 */}
          <DailyTradesCard trades={positions} days={days} fmt={fmtUsdt} />
          <TradesPerDayCard rows={perDay} fmt={fmtUsdt} />

          {/* ② 손익 분해 */}
          <div className="mb-3">
            <BreakdownTables items={breakItems} unit="USDT" valueLabel="순손익" fmt={fmtPnl}
              sub={`최근 ${days}일 청산 ${positions.length}건 · 진입 시각(KST) 기준`} />
          </div>

          {/* ③ 비용 분석 */}
          <CostCard c={costs} fmt={fmtUsdt} holdRows={holdCosts} cash={cash} sub={`최근 ${days}일 청산 ${costs.n}건 · 거래소 수수료·펀딩`} />
        </>
      )}

      {/* ④ 수수료 진단 — 체결 내역을 직접 조회(청산 0건이어도 체결은 있을 수 있음) */}
      {loaded && !err && <FeeDiagCard days={days} fmt={fmtUsdt} />}

      <section className="mt-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-2">복기 상세 <span className="text-[10px] font-normal text-[var(--text-muted)]">더보기 › 📒 복기 상세에도 있음</span></h2>
        <div className="flex flex-wrap gap-2">
          {DETAIL.map((d) => (
            <Link key={d.href} href={d.href} className="chip min-h-[36px] inline-flex items-center">{d.label}</Link>
          ))}
        </div>
      </section>
    </div>
  );
}
