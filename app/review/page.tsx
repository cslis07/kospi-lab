'use client';

/**
 * 복기 대시보드 — 하단 '복기' 탭의 단일 화면. 한 화면에서 여러 정보를 훑는 대시보드형(2026-10-29 3차: 참고 이미지 스타일).
 *  맨 위: 상세 화면 바로가기 5개(성적·비용 누수·규율·가정·선행 테스트) + 기간
 *  ① KPI 타일 4개 — 매매손익·수수료·펀딩비·순손익(USDT + 업비트 테더 원화 + 누적 추세선)
 *  ② 한 줄 3카드 — 이번 주 규칙 3줄(지난주 대비) · 1시간 미만 매매를 안 했다면 · 손실 한도 게이지
 *  ③ 한 줄 — 진입·매매 횟수 달력(가드 경보 표시·날짜별 비용) | 월별 보고서(월마다 드롭다운)
 *  ④ 드롭다운 — 비용 상세 · 손익 분해
 * 계산은 lib/reviewDash(테스트 고정). 데이터는 매매일지와 같은 소스(Bitget 청산 이력, 읽기 전용).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import TradeCalendar from '@/components/TradeCalendar';
import BreakdownTables from '@/components/BreakdownTables';
import CostCard from '@/components/CostCard';
import KpiTile from '@/components/KpiTile';
import { ICON } from '@/lib/menu';
import { costBreakdown, costByHoldBand, cashFlow, type CashMove } from '@/lib/tradeCosts';
import { monthlyStats } from '@/lib/tradeReport';
import { scalpImpact, weekRules, lossGauge, cumSeries, type RuleWeek } from '@/lib/reviewDash';
import { useRiskLimits } from '@/hooks/useRiskLimits';
import type { BreakItem } from '@/lib/tradeBreakdown';
import type { GuardMark } from '@/lib/guard';
import type { ClosedPosition } from '@/app/api/bitget/history/route';

const COIN_NAME: Record<string, string> = { BTCUSDT: '비트코인', ETHUSDT: '이더리움', XRPUSDT: '리플', SOLUSDT: '솔라나' };
const coinName = (s: string) => COIN_NAME[s] ?? s.replace(/USDT$/, '');
const fmtPnl = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
const fmtUsdt = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100));
const tone = (n: number) => (n > 0 ? 'var(--warn)' : n < 0 ? 'var(--accent-ink)' : 'var(--text)');
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtUsdt(Math.abs(v))}`;
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const DAY = 86_400_000;

const DETAIL: { href: string; label: string; icon: string }[] = [
  { href: '/journal', label: '성적', icon: 'journal' },
  { href: '/journal?tab=cost', label: '비용 누수', icon: 'tax' },
  { href: '/journal?tab=discipline', label: '규율', icon: 'risk' },
  { href: '/journal?tab=whatif', label: '가정', icon: 'simulate' },
  { href: '/paper', label: '선행 테스트', icon: 'target' },
];

function Icon({ name, className = 'w-[18px] h-[18px]' }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

/** 상세 드롭다운 — 접힌 상태가 기본 */
function Drop({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <details className="fin-card mb-3 overflow-hidden group">
      <summary className="cursor-pointer select-none list-none px-4 min-h-[48px] flex items-center gap-2">
        <span className="text-[14.5px] font-extrabold text-[var(--text)]">{title}</span>
        {sub && <span className="text-[11px] text-[var(--text-muted)] truncate">{sub}</span>}
        <span className="ml-auto text-[var(--faint)] transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="px-1 pb-1">{children}</div>
    </details>
  );
}

/** 지난주 대비 — better: 값이 커야 좋은가 */
function Delta({ cur, prev, better, unit = '' }: { cur: number | null; prev: number | null; better: 'up' | 'down'; unit?: string }) {
  if (cur == null || prev == null || cur === prev) return <span className="text-[11px] text-[var(--faint)]">지난주 {prev == null ? '—' : `${prev}${unit}`}</span>;
  const good = (cur > prev) === (better === 'up');
  return (
    <span className="text-[11px] font-semibold" style={{ color: good ? 'var(--ok)' : 'var(--warn)' }}>
      {good ? '개선' : '악화'} <span className="font-normal text-[var(--faint)]">← 지난주 {prev}{unit}</span>
    </span>
  );
}

function Bar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const color = p >= 100 ? 'var(--warn)' : p >= 70 ? '#ff8833' : 'var(--accent)';
  return <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden"><div className="h-full rounded-full transition-[width]" style={{ width: `${p}%`, background: color }} /></div>;
}

export default function ReviewPage() {
  const [days, setDays] = useState(30);
  const [all, setAll] = useState<ClosedPosition[]>([]);
  const [moves, setMoves] = useState<{ withdrawals: CashMove[]; deposits: CashMove[] } | null>(null);
  const [equity, setEquity] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { limits } = useRiskLimits();
  const { data: fx } = useSWR<{ price: number | null }>('/api/crypto/usdt-krw', fetcher, { refreshInterval: 60_000 });
  const { data: gm } = useSWR<{ marks: GuardMark[] }>('/api/bitget/guard-marks', fetcher, { revalidateOnFocus: false });
  const usdtKrw = fx?.price ?? null;
  /** USDT → 원화 문자열(테더 시세 없으면 null) */
  const krw = useCallback((usdt: number) => {
    if (!usdtKrw) return null;
    const w = Math.round(usdt * usdtKrw);
    return `${w > 0 ? '+' : w < 0 ? '−' : ''}₩${Math.abs(w).toLocaleString('ko-KR')}`;
  }, [usdtKrw]);

  const load = useCallback(async (d: number) => {
    setBusy(true); setErr(null);
    // 이번 주 vs 지난주 비교에 최소 14일이 필요해 짧은 기간도 14일은 받아 온다(화면 집계는 선택 기간만)
    const span = Math.max(d, 14);
    try {
      const [hRes, tRes, pRes] = await Promise.all([
        fetch(`/api/bitget/history?days=${span}`),
        fetch(`/api/bitget/transfers?days=${d}`).catch(() => null),
        fetch('/api/bitget/positions').catch(() => null),
      ]);
      let mv: { withdrawals: CashMove[]; deposits: CashMove[] } | null = null;
      if (tRes && tRes.ok) {
        try { const tj = await tRes.json() as { withdrawals?: CashMove[]; deposits?: CashMove[]; error?: string }; if (!tj.error && Array.isArray(tj.withdrawals)) mv = { withdrawals: tj.withdrawals, deposits: tj.deposits ?? [] }; } catch { /* 무시 */ }
      }
      setMoves(mv);
      if (pRes && pRes.ok) {
        try { const pj = await pRes.json() as { account?: { equity?: number } | null }; setEquity(typeof pj.account?.equity === 'number' && pj.account.equity > 0 ? pj.account.equity : null); } catch { /* 무시 */ }
      }
      if (hRes.status === 401) { setErr('잠금 상태입니다 — 계좌 화면에서 접근 토큰을 1회 입력하세요.'); setAll([]); return; }
      const j = await hRes.json() as { configured?: boolean; error?: string; positions?: ClosedPosition[] };
      if (j.configured === false) { setErr('Bitget API 키가 서버에 설정되지 않았습니다.'); setAll([]); return; }
      if (j.error) { setErr(`거래소 조회 실패 — ${j.error}`); setAll([]); return; }
      setAll(j.positions ?? []);
      setNow(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); setLoaded(true); }
  }, []);
  // 진입 시 1회 + 기간 변경 시 재조회(타이머 콜백 — 이펙트 본문에서 바로 setState 하지 않게)
  useEffect(() => { const t = setTimeout(() => load(days), 0); return () => clearTimeout(t); }, [days, load]);

  const positions = useMemo(() => all.filter((p) => p.closeTs >= now - days * DAY), [all, days, now]);
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
  const scalp = useMemo(() => scalpImpact(positions), [positions]);
  const rules = useMemo(() => weekRules(all, now), [all, now]);
  const gauge = useMemo(() => lossGauge(all, now, limits, equity), [all, now, limits, equity]);
  const spark = useMemo(() => ({
    gross: cumSeries(positions, (p) => p.grossPnl), fee: cumSeries(positions, (p) => p.fee),
    funding: cumSeries(positions, (p) => p.funding), net: cumSeries(positions, (p) => p.netProfit),
  }), [positions]);

  const ruleRows: { label: string; key: keyof Omit<RuleWeek, 'n'>; unit: string; better: 'up' | 'down'; hint: string }[] = [
    { label: '번 돈 중 비용', key: 'costPct', unit: '%', better: 'down', hint: '이익 매매 매매손익 대비 수수료+펀딩' },
    { label: '1시간 미만 매매', key: 'scalpN', unit: '건', better: 'down', hint: '수수료가 가장 많이 새는 구간' },
    { label: '손절 주문 건 비율', key: 'slRate', unit: '%', better: 'up', hint: '거래소 손절 주문 기록이 있는 매매' },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-4">
      {/* 제목 + 상세 바로가기 */}
      <div className="flex items-end gap-3 flex-wrap mb-3">
        <div className="mr-auto">
          <h1 className="text-[20px] font-extrabold text-[var(--text)] tracking-tight">복기 대시보드</h1>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Bitget 청산 기록 · 수수료·펀딩 반영 · 읽기 전용</p>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="조회 기간">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} disabled={busy} aria-pressed={days === d}
              className={`px-3 min-h-[36px] min-w-[48px] rounded-lg border text-[12px] font-bold transition-colors disabled:opacity-50 ${
                days === d ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border)]'
              }`}>{d}일</button>
          ))}
        </div>
      </div>
      <nav aria-label="복기 상세" className="grid grid-cols-5 gap-2 mb-3">
        {DETAIL.map((d) => (
          <Link key={d.href} href={d.href} className="fin-card flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 min-h-[52px] px-1 py-2 hover-lift">
            <span className="w-8 h-8 rounded-lg grid place-items-center bg-[var(--accent-soft)] text-[var(--accent)]"><Icon name={d.icon} /></span>
            <span className="text-[11.5px] md:text-[13px] font-bold text-[var(--text)] whitespace-nowrap">{d.label}</span>
          </Link>
        ))}
      </nav>
      <p className="text-[11px] text-[var(--text-muted)] mb-3 tabular-nums px-0.5">
        {busy ? '불러오는 중…' : usdtKrw ? `원화 환산: 1 USDT = ₩${usdtKrw.toLocaleString('ko-KR')} (업비트 테더 현재가)` : ''}
      </p>

      {err && <p className="mb-3 text-[12px] text-red-400">⚠ {err} {err.includes('잠금') && <Link href="/bitget" className="underline">계좌로 이동</Link>}</p>}
      {loaded && !err && !positions.length && <p className="mb-3 text-[12px] text-[var(--text-muted)]">최근 {days}일 청산된 선물 포지션이 없습니다.</p>}
      {!loaded && <div className="skeleton h-40 rounded-xl mb-3" />}

      {positions.length > 0 && (
        <>
          {/* ① KPI 타일 — 비용 분석 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <KpiTile label="매매손익" icon="growth" value={signed(costs.gross)} unit="USDT" sub={krw(costs.gross)} foot="수수료·펀딩 빼기 전" spark={spark.gross} />
            <KpiTile label="수수료" icon="tax" value={signed(costs.fees)} unit="USDT" sub={krw(costs.fees)} foot={costs.avgFee != null ? `건당 ${fmtUsdt(costs.avgFee)} · ${costs.n}건` : undefined} spark={spark.fee} />
            <KpiTile label="펀딩비" icon="futures" value={signed(costs.funding)} unit="USDT" sub={krw(costs.funding)} foot="+ 받음 · − 냄" spark={spark.funding} />
            <KpiTile label="순손익" icon="portfolio" tone="navy" value={signed(costs.net)} unit="USDT" sub={krw(costs.net)} foot={`최근 ${days}일 · 실제 남은 돈`} spark={spark.net} />
          </div>

          {/* ② 한 줄 3카드 — 규칙 · 단타 · 한도 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <section className="fin-card p-4">
              <div className="dash-h"><h2>이번 주 규칙 3줄</h2><span className="text-[11px] text-[var(--text-muted)]">최근 7일 · {rules.cur.n}건</span></div>
              <ul className="space-y-2.5">
                {ruleRows.map((r) => {
                  const cur = rules.cur[r.key], prev = rules.prev[r.key];
                  return (
                    <li key={r.key} className="flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-[var(--text)]">{r.label}</p>
                        <p className="text-[10.5px] text-[var(--faint)] truncate">{r.hint}</p>
                      </div>
                      <div className="ml-auto text-right shrink-0">
                        <p className="text-[18px] font-extrabold tabular-nums text-[var(--text)] leading-tight">{cur == null ? '—' : `${cur}${r.unit}`}</p>
                        <Delta cur={cur} prev={prev} better={r.better} unit={r.unit} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[10px] text-[var(--faint)] mt-2">일요일 텔레그램 주간 복기와 같은 기준</p>
            </section>

            <section className="fin-card p-4">
              <div className="dash-h"><h2>1시간 미만 매매를 안 했다면</h2></div>
              <p className="text-[12px] text-[var(--text-muted)] tabular-nums">최근 {days}일 1시간 미만 <b className="text-[var(--text)]">{scalp.n}건</b> · 수수료 {signed(scalp.fee)} · 순손익 <b style={{ color: tone(scalp.net) }}>{signed(scalp.net)}</b></p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[var(--surface-2)] p-3">
                  <p className="text-[11px] text-[var(--text-muted)]">지금 순손익</p>
                  <p className="text-[18px] font-extrabold tabular-nums leading-tight" style={{ color: tone(scalp.netAll) }}>{signed(scalp.netAll)}</p>
                  {krw(scalp.netAll) && <p className="text-[11px] tabular-nums text-[var(--text-muted)]">{krw(scalp.netAll)}</p>}
                </div>
                <div className="rounded-xl p-3" style={{ background: 'var(--accent-soft)' }}>
                  <p className="text-[11px] text-[var(--text-muted)]">빼면</p>
                  <p className="text-[18px] font-extrabold tabular-nums leading-tight" style={{ color: tone(scalp.netWithout) }}>{signed(scalp.netWithout)}</p>
                  {krw(scalp.netWithout) && <p className="text-[11px] tabular-nums text-[var(--text-muted)]">{krw(scalp.netWithout)}</p>}
                </div>
              </div>
              <p className="text-[12px] font-semibold mt-2.5" style={{ color: scalp.net < 0 ? 'var(--warn)' : 'var(--text-muted)' }}>
                {scalp.n === 0 ? '1시간 미만 매매가 없습니다.' : scalp.net < 0 ? `단타가 ${signed(scalp.net)} USDT${krw(scalp.net) ? `(${krw(scalp.net)})` : ''}를 깎았습니다.` : `단타가 ${signed(scalp.net)} USDT 보탰습니다.`}
              </p>
              <p className="text-[10px] text-[var(--faint)] mt-1">가정 — 그 매매를 안 했다면의 단순 차감(다른 매매에 미친 영향은 모름)</p>
            </section>

            <section className="fin-card p-4">
              <div className="dash-h"><h2>손실 한도</h2><Link href="/coin-analysis" className="dash-more">한도 설정 →</Link></div>
              {gauge.dailyLimit != null ? (
                <div className="mb-3">
                  <div className="flex items-baseline justify-between text-[12px] tabular-nums mb-1">
                    <span className="font-semibold text-[var(--text)]">오늘</span>
                    <span className="text-[var(--text-muted)]"><b style={{ color: tone(gauge.today) }}>{signed(gauge.today)}</b> / −{fmtUsdt(gauge.dailyLimit)}</span>
                  </div>
                  <Bar pct={(Math.max(0, -gauge.today) / gauge.dailyLimit) * 100} />
                  <p className="text-[10.5px] text-[var(--faint)] mt-1 tabular-nums">
                    {gauge.today < 0 ? `한도의 ${Math.round((-gauge.today / gauge.dailyLimit) * 100)}% 사용` : '손실 없음'}
                    {krw(gauge.dailyLimit + Math.min(0, gauge.today)) && ` · 남은 여유 ${krw(Math.max(0, gauge.dailyLimit + Math.min(0, gauge.today)))?.replace('+', '')}`}
                    {gauge.dailyAssumed && ' · 한도 미설정 → 평가금 3% 가정'}
                  </p>
                </div>
              ) : <p className="text-[12px] text-[var(--text-muted)] mb-3">오늘 한도: 계좌 평가금을 못 불러와 표시하지 않습니다.</p>}
              <div>
                <div className="flex items-baseline justify-between text-[12px] tabular-nums mb-1">
                  <span className="font-semibold text-[var(--text)]">최근 7일</span>
                  <span className="text-[var(--text-muted)]"><b style={{ color: tone(gauge.week) }}>{signed(gauge.week)}</b>{gauge.weeklyLimit != null && ` / −${fmtUsdt(gauge.weeklyLimit)}`}</span>
                </div>
                {gauge.weeklyLimit != null
                  ? <Bar pct={(Math.max(0, -gauge.week) / gauge.weeklyLimit) * 100} />
                  : <p className="text-[10.5px] text-[var(--faint)]">주간 한도 미설정 — 코인 분석의 서킷브레이커에서 정할 수 있습니다.</p>}
                {krw(gauge.week) && <p className="text-[10.5px] text-[var(--faint)] mt-1 tabular-nums">{krw(gauge.week)}</p>}
              </div>
            </section>
          </div>

          {/* ③ 한 줄: 진입·매매 횟수 달력 | 월별 보고서 */}
          <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-3 mb-3 items-start">
            <TradeCalendar trades={positions} fmt={fmtUsdt} krw={krw} marks={gm?.marks ?? []} />
            <section className="fin-card p-4">
              <div className="dash-h"><h2>월별 보고서</h2><span className="text-[11px] text-[var(--text-muted)]">청산 기준 · 눌러서 상세</span></div>
              <ul className="space-y-1.5">
                {months.map((m) => {
                  const gross = m.netSum - m.feeSum - m.fundingSum;
                  return (
                    <li key={m.month}>
                      <details className="rounded-xl bg-[var(--surface-2)] group">
                        <summary className="cursor-pointer select-none list-none px-3 min-h-[48px] flex items-center gap-2 tabular-nums">
                          <span className="text-[13.5px] font-bold text-[var(--text)]">{Number(m.month.slice(5))}월</span>
                          <span className="text-[11px] text-[var(--text-muted)]">{m.count}건 · 승률 {m.winRate != null ? `${m.winRate.toFixed(0)}%` : '—'}</span>
                          <span className="ml-auto text-right leading-tight">
                            <span className="block text-[13.5px] font-extrabold" style={{ color: tone(m.netSum) }}>{signed(m.netSum)}</span>
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
              {days < 90 && <button type="button" onClick={() => setDays(90)} className="mt-2 text-[12px] font-bold text-[var(--accent-ink)] min-h-[36px]">90일로 더 보기 →</button>}
            </section>
          </div>

          {/* ④ 드롭다운 */}
          <Drop title="비용 상세" sub="보유시간대별 비용·출금·실효 수수료율">
            <CostCard c={costs} fmt={fmtUsdt} holdRows={holdCosts} cash={cash} sub={`최근 ${days}일 청산 ${costs.n}건 · 거래소 수수료·펀딩`} />
          </Drop>
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
