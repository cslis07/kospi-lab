'use client';

/**
 * 복기 대시보드 — 하단 '복기' 탭의 단일 화면. 한 화면에서 여러 정보를 훑는 대시보드형(2026-10-29 사용자 요청 2차).
 *  맨 위: 상세 화면 바로가기 5개(성적·비용 누수·규율·가정·선행 테스트)
 *  ① 비용 분석 타일 — 매매손익·수수료·펀딩비·순손익(USDT + 업비트 테더 시세 기준 원화) · 상세는 드롭다운(CostCard)
 *  ② 한 줄: 진입·매매 횟수 달력(TradeCalendar) | 월별 보고서(월마다 드롭다운)
 *  ③ 손익 분해 — 드롭다운
 * 하루 매매 횟수별·수수료 진단은 사용자 요청으로 뺌(매매일지 › 규율·비용에 그대로 있음).
 * 데이터는 매매일지와 같은 소스(Bitget 청산 이력, 읽기 전용).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import TradeCalendar from '@/components/TradeCalendar';
import BreakdownTables from '@/components/BreakdownTables';
import CostCard from '@/components/CostCard';
import { ICON } from '@/lib/menu';
import { costBreakdown, costByHoldBand, cashFlow, type CashMove } from '@/lib/tradeCosts';
import { monthlyStats } from '@/lib/tradeReport';
import type { BreakItem } from '@/lib/tradeBreakdown';
import type { ClosedPosition } from '@/app/api/bitget/history/route';

const COIN_NAME: Record<string, string> = { BTCUSDT: '비트코인', ETHUSDT: '이더리움', XRPUSDT: '리플', SOLUSDT: '솔라나' };
const coinName = (s: string) => COIN_NAME[s] ?? s.replace(/USDT$/, '');
const fmtPnl = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
const fmtUsdt = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100));
const tone = (n: number) => (n > 0 ? 'var(--warn)' : n < 0 ? 'var(--accent-ink)' : 'var(--text)');
const fetcher = (u: string) => fetch(u).then((r) => r.json());

const DETAIL: { href: string; label: string; icon: string }[] = [
  { href: '/journal', label: '성적', icon: 'journal' },
  { href: '/journal?tab=cost', label: '비용 누수', icon: 'tax' },
  { href: '/journal?tab=discipline', label: '규율', icon: 'risk' },
  { href: '/journal?tab=whatif', label: '가정', icon: 'simulate' },
  { href: '/paper', label: '선행 테스트', icon: 'target' },
];

function Icon({ name }: { name: string }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

/** 상세 드롭다운 — 접힌 상태가 기본 */
function Drop({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <details className="fin-card mb-3 overflow-hidden group">
      <summary className="cursor-pointer select-none list-none px-4 min-h-[44px] flex items-center gap-2">
        <span className="text-sm font-bold text-[var(--text)]">{title}</span>
        {sub && <span className="text-[11px] text-[var(--text-muted)] truncate">{sub}</span>}
        <span className="ml-auto text-[var(--faint)] transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="px-1 pb-1">{children}</div>
    </details>
  );
}

export default function ReviewPage() {
  const [days, setDays] = useState(30);
  const [positions, setPositions] = useState<ClosedPosition[]>([]);
  const [moves, setMoves] = useState<{ withdrawals: CashMove[]; deposits: CashMove[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { data: fx } = useSWR<{ price: number | null }>('/api/crypto/usdt-krw', fetcher, { refreshInterval: 60_000 });
  const usdtKrw = fx?.price ?? null;
  /** USDT → 원화 문자열(테더 시세 없으면 null) */
  const krw = useCallback((usdt: number) => {
    if (!usdtKrw) return null;
    const w = Math.round(usdt * usdtKrw);
    return `${w > 0 ? '+' : w < 0 ? '−' : ''}₩${Math.abs(w).toLocaleString('ko-KR')}`;
  }, [usdtKrw]);

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

  const breakItems: BreakItem[] = useMemo(() => positions.map((p) => ({
    ts: p.openTs || p.closeTs, symbol: p.symbol, label: coinName(p.symbol), value: p.netProfit,
    win: p.netProfit > 0 ? true : p.netProfit < 0 ? false : null,
    holdMs: p.openTs && p.closeTs > p.openTs ? p.closeTs - p.openTs : null,
    side: p.side, hasStop: p.stop != null, notional: p.size * p.openAvg,
  })), [positions]);
  const costs = useMemo(() => costBreakdown(positions), [positions]);
  const holdCosts = useMemo(() => costByHoldBand(positions), [positions]);
  const cash = useMemo(() => (moves ? cashFlow(moves.withdrawals, moves.deposits, costs.net) : null), [moves, costs.net]);
  const months = useMemo(() => monthlyStats(positions), [positions]);
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtUsdt(Math.abs(v))}`;

  const tiles: { label: string; v: number; hint: string }[] = [
    { label: '매매손익', v: costs.gross, hint: '수수료·펀딩 전' },
    { label: '수수료', v: costs.fees, hint: costs.avgFee != null ? `건당 ${fmtUsdt(costs.avgFee)}` : '' },
    { label: '펀딩비', v: costs.funding, hint: '+ 받음 · − 냄' },
    { label: '순손익', v: costs.net, hint: `${costs.n}건 · 실제 남은 돈` },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-5">
      <h1 className="text-lg font-bold text-[var(--text)]">복기 대시보드</h1>

      {/* 상세 화면 바로가기 */}
      <nav aria-label="복기 상세" className="grid grid-cols-5 gap-1.5 mt-2 mb-3">
        {DETAIL.map((d) => (
          <Link key={d.href} href={d.href} className="fin-card flex flex-col items-center justify-center gap-1 min-h-[56px] px-0.5 py-2 hover-lift text-[var(--accent)]">
            <Icon name={d.icon} />
            <span className="text-[11.5px] font-semibold text-[var(--text)] whitespace-nowrap">{d.label}</span>
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap" role="group" aria-label="조회 기간">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} disabled={busy} aria-pressed={days === d}
            className={`px-3 min-h-[36px] min-w-[48px] rounded-lg border text-[12px] font-semibold transition-colors disabled:opacity-50 ${
              days === d ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)]'
            }`}>{d}일</button>
        ))}
        <span className="text-[11px] text-[var(--text-muted)] ml-1 tabular-nums">
          {busy ? '불러오는 중…' : usdtKrw ? `1 USDT = ₩${usdtKrw.toLocaleString('ko-KR')} (업비트 테더)` : ''}
        </span>
      </div>

      {err && <p className="mb-3 text-[12px] text-red-400">⚠ {err} {err.includes('잠금') && <Link href="/bitget" className="underline">계좌로 이동</Link>}</p>}
      {loaded && !err && !positions.length && <p className="mb-3 text-[12px] text-[var(--text-muted)]">최근 {days}일 청산된 선물 포지션이 없습니다.</p>}
      {!loaded && <div className="skeleton h-40 rounded-xl mb-3" />}

      {positions.length > 0 && (
        <>
          {/* ① 비용 분석 — 요약 타일 + 상세 드롭다운 */}
          <section className="fin-card p-3.5 mb-3">
            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="text-sm font-bold text-[var(--text)]">비용 분석</h2>
              <span className="text-[11px] text-[var(--text-muted)]">최근 {days}일 청산 {costs.n}건</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {tiles.map((t) => (
                <div key={t.label} className={`rounded-xl p-2.5 ${t.label === '순손익' ? 'bg-[var(--accent-soft)]' : 'bg-[var(--surface-2)]'}`}>
                  <p className="text-[11px] text-[var(--text-muted)]">{t.label}</p>
                  <p className="text-[17px] font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: tone(t.v) }}>{signed(t.v)} <span className="text-[10px] font-semibold">USDT</span></p>
                  {krw(t.v) && <p className="text-[11.5px] font-semibold tabular-nums text-[var(--text)] opacity-80">{krw(t.v)}</p>}
                  <p className="text-[10px] text-[var(--faint)] mt-0.5">{t.hint}</p>
                </div>
              ))}
            </div>
            {costs.costOfGrossWinPct != null && (
              <p className="text-[11.5px] text-[var(--text-muted)] mt-2 tabular-nums">
                번 돈(이익 매매 {fmtUsdt(costs.grossWin)}) 중 <b style={{ color: 'var(--warn)' }}>{costs.costOfGrossWinPct.toFixed(0)}%</b>가 비용 · 비용 때문에 이익→손실로 바뀐 매매 {costs.flipped}건
              </p>
            )}
          </section>
          <Drop title="비용 상세" sub="보유시간대별 비용·출금·실효 수수료율">
            <CostCard c={costs} fmt={fmtUsdt} holdRows={holdCosts} cash={cash} sub={`최근 ${days}일 청산 ${costs.n}건 · 거래소 수수료·펀딩`} />
          </Drop>

          {/* ② 한 줄: 진입·매매 횟수 달력 | 월별 보고서 */}
          <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-3 mb-3 items-start">
            <TradeCalendar trades={positions} fmt={fmtUsdt} krw={krw} />
            <section className="fin-card p-3.5">
              <h2 className="text-sm font-bold text-[var(--text)]">월별 보고서 <span className="text-[10px] font-normal text-[var(--text-muted)]">청산 기준 · 눌러서 상세</span></h2>
              <ul className="mt-2 space-y-1.5">
                {months.map((m) => {
                  const gross = m.netSum - m.feeSum - m.fundingSum;
                  return (
                    <li key={m.month}>
                      <details className="rounded-lg bg-[var(--surface-2)] group">
                        <summary className="cursor-pointer select-none list-none px-3 min-h-[44px] flex items-center gap-2 tabular-nums">
                          <span className="text-[13px] font-semibold text-[var(--text)]">{Number(m.month.slice(5))}월</span>
                          <span className="text-[11px] text-[var(--text-muted)]">{m.count}건 · 승률 {m.winRate != null ? `${m.winRate.toFixed(0)}%` : '—'}</span>
                          <span className="ml-auto text-right leading-tight">
                            <span className="block text-[13px] font-bold" style={{ color: tone(m.netSum) }}>{signed(m.netSum)}</span>
                            {krw(m.netSum) && <span className="block text-[10px] text-[var(--text-muted)]">{krw(m.netSum)}</span>}
                          </span>
                          <span className="text-[var(--faint)] transition-transform group-open:rotate-180" aria-hidden>▾</span>
                        </summary>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 pb-2.5 text-[11.5px] tabular-nums">
                          <dt className="text-[var(--text-muted)]">매매손익</dt><dd className="text-right font-semibold" style={{ color: tone(gross) }}>{signed(gross)}</dd>
                          <dt className="text-[var(--text-muted)]">수수료</dt><dd className="text-right font-semibold" style={{ color: tone(m.feeSum) }}>{signed(m.feeSum)}</dd>
                          <dt className="text-[var(--text-muted)]">펀딩비</dt><dd className="text-right font-semibold" style={{ color: tone(m.fundingSum) }}>{signed(m.fundingSum)}</dd>
                          <dt className="text-[var(--text-muted)]">롱 / 숏</dt><dd className="text-right text-[var(--text)]">{m.longCount} / {m.shortCount}</dd>
                          {m.best && <><dt className="text-[var(--text-muted)]">최고</dt><dd className="text-right text-[var(--text)]">{coinName(m.best.symbol)} <b style={{ color: tone(m.best.netProfit) }}>{signed(m.best.netProfit)}</b></dd></>}
                          {m.worst && <><dt className="text-[var(--text-muted)]">최저</dt><dd className="text-right text-[var(--text)]">{coinName(m.worst.symbol)} <b style={{ color: tone(m.worst.netProfit) }}>{signed(m.worst.netProfit)}</b></dd></>}
                        </dl>
                      </details>
                    </li>
                  );
                })}
              </ul>
              {days < 90 && <button type="button" onClick={() => setDays(90)} className="mt-2 text-[12px] font-semibold text-[var(--accent-ink)] min-h-[36px]">90일로 더 보기</button>}
            </section>
          </div>

          {/* ③ 손익 분해 — 드롭다운 */}
          <Drop title="손익 분해" sub="요일·시간대·코인·롱숏·보유시간·손절·규모">
            <BreakdownTables items={breakItems} unit="USDT" valueLabel="순손익" fmt={fmtPnl}
              sub={`최근 ${days}일 청산 ${positions.length}건 · 진입 시각(KST) 기준`} />
          </Drop>
          <p className="text-[10.5px] text-[var(--faint)] px-1">원화 = 업비트 테더(KRW-USDT) 현재가로 환산한 참고 금액 · 매매 신호가 아니라 내 매매 습관을 보는 화면입니다.</p>
        </>
      )}
    </div>
  );
}
