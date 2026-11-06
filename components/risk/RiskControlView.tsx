'use client';

/**
 * 위험관리 컨트롤(/risk-control) — 손절 기준 포지션 크기 + 진입 가능 여부(ALLOW/WAIT/BLOCK) + 판정 기록·복기.
 * 계산은 전부 lib/riskControl·lib/riskReview(순수 함수·테스트 고정). 이 화면은 읽기 전용이다:
 * 거래소에 주문·청산을 보내는 코드는 없다(자동매매 없음). 기존 화면·컴포넌트·저장 키는 수정하지 않는다.
 */
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';
import {
  evaluateEntry, openRiskUsdt, CHECK_LABEL, HARD_MAX_LEVERAGE, DEFAULT_RISK_SETTINGS,
  type MarketContext, type AccountContext, type OpenRisk, type CheckGroup, type ReasonLevel, type Verdict, type RiskSettings, type Direction,
} from '@/lib/riskControl';
import { fmtKst, humanMin, nextEvent, type MacroEvent } from '@/lib/macroSchedule';
import { rowFromDecision, rowFromJournal, matchClosed, summarizeReview, type RiskDecisionRecord, type ClosedLite, type GroupStat } from '@/lib/riskReview';
import type { BreakerEntry } from '@/lib/circuitBreaker';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { useRiskSettings, useRiskDecisions } from '@/hooks/useRiskControl';

type Sym = 'BTCUSDT' | 'ETHUSDT';
interface PosRow { symbol: string; side: Direction; size: number; openAvg: number; markPrice: number; leverage: number; slStop?: number | null }
interface PosResp { configured?: boolean; positions?: PosRow[]; account?: { equity: number } | null; error?: string }
interface HistResp { configured?: boolean; positions?: ClosedLite[]; error?: string }
interface EventsResp { events: MacroEvent[]; missing: string[]; note: string }

const silent = { shouldRetryOnError: false, revalidateOnFocus: false } as const;
const num = (s: string) => { const v = Number(s.replace(/,/g, '')); return s.trim() !== '' && Number.isFinite(v) ? v : null; };
const usd = (v: number | null | undefined, d = 2) => (v == null ? '—' : `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) })}`);
const pxFmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: v >= 1000 ? 1 : 4 });

const VERDICT_UI: Record<Verdict, { chip: string; label: string; desc: string }> = {
  ALLOW: { chip: 'good', label: 'ALLOW · 진입 가능', desc: '설정한 위험관리 조건 충족 — 수익 신호 아님' },
  WAIT: { chip: 'warn', label: 'WAIT · 관망', desc: '데이터나 조건이 부족 — 기다리기' },
  BLOCK: { chip: 'bad', label: 'BLOCK · 진입 제한', desc: '위험관리 규칙 위반 — 신규 진입하지 않기' },
};
const LEVEL_ICON: Record<ReasonLevel, string> = { block: '⛔', wait: '⏸', note: 'ⓘ', ok: '✓' };
const LEVEL_COLOR: Record<ReasonLevel, string> = { block: 'var(--warn)', wait: 'var(--amber)', note: 'var(--text-muted)', ok: 'var(--ok)' };
const GROUP_ORDER: CheckGroup[] = ['plan', 'daily', 'streak', 'overlap', 'rr', 'macro', 'data', 'trend4h', 'trend1d', 'levels', 'volumeOi', 'funding'];
const RANK: Record<ReasonLevel, number> = { block: 3, wait: 2, note: 1, ok: 0 };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-bold text-[var(--faint)] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10.5px] text-[var(--faint)] mt-0.5">{hint}</span>}
    </label>
  );
}
const inputCls = 'w-full min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2 text-[14px] tabular-nums text-[var(--text)] outline-none focus:border-[var(--accent)]';

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-[var(--line)] overflow-hidden">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={k === value} onClick={() => onChange(k)}
          className="flex-1 min-w-0 px-2 py-2 text-[13px] font-bold truncate"
          style={k === value ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>{l}</button>
      ))}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="fin-card p-3 min-w-0">
      <div className="text-[10.5px] font-bold text-[var(--faint)] truncate">{label}</div>
      <div className="text-[17px] font-extrabold tabular-nums mt-0.5 truncate" style={{ color: tone ?? 'var(--text)' }}>{value}</div>
      {sub && <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function StatRow({ label, s }: { label: string; s: GroupStat }) {
  return (
    <tr className="border-t border-[var(--line)]">
      <td className="py-1.5 pr-2 text-[var(--text)] whitespace-nowrap">{label}</td>
      <td className="py-1.5 px-1 text-right tabular-nums">{s.n}</td>
      <td className="py-1.5 px-1 text-right tabular-nums">{s.avgR == null ? '—' : `${s.avgR >= 0 ? '+' : '−'}${Math.abs(s.avgR).toFixed(2)}R`}</td>
      <td className="py-1.5 pl-1 text-right tabular-nums">{s.expectancy == null ? '—' : usd(s.expectancy)}</td>
    </tr>
  );
}

export default function RiskControlView() {
  const { settings, update, reset, mounted } = useRiskSettings();
  const decisions = useRiskDecisions();
  const journal = useCoinJournal();

  const [sym, setSym] = useState<Sym>('BTCUSDT');
  const [dir, setDir] = useState<Direction>('long');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [lev, setLev] = useState('');
  const [entryOrder, setEntryOrder] = useState<'market' | 'limit'>('market');
  const [targetOrder, setTargetOrder] = useState<'limit' | 'market'>('limit');
  const [manualEquity, setManualEquity] = useState('');
  const [reason, setReason] = useState('');
  const [reviewSrc, setReviewSrc] = useState<'decisions' | 'journal'>('decisions');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t0 = setTimeout(tick, 0);
    const id = setInterval(tick, 15_000);
    return () => { clearTimeout(t0); clearInterval(id); };
  }, []);

  const market = useSWR<MarketContext>(`/api/risk/market?symbol=${sym}`, jsonFetcher, { refreshInterval: 20_000, revalidateOnFocus: true });
  const events = useSWR<EventsResp>('/api/risk/events', jsonFetcher, silent);
  const pos = useSWR<PosResp>('/api/bitget/positions', jsonFetcher, { ...silent, refreshInterval: 60_000 });
  const hist = useSWR<HistResp>('/api/bitget/history?days=8', jsonFetcher, { ...silent, refreshInterval: 300_000 });

  const levNum = num(lev) ?? settings.defaultLeverage;
  const bitgetEquity = pos.data?.configured && pos.data.account?.equity ? pos.data.account.equity : null;
  const equity = bitgetEquity ?? num(manualEquity);

  /* 계좌 맥락 — 거래소 기록이 있으면 그것, 없으면 매매일지(읽기만) */
  const account: AccountContext = useMemo(() => {
    const openJournal = journal.entries.filter((e) => e.result === 'open' && e.direction !== 'wait');
    let closed: BreakerEntry[] | null = null, closedSource: AccountContext['closedSource'] = null;
    if (hist.data?.configured && !hist.data.error && Array.isArray(hist.data.positions)) {
      closed = hist.data.positions.map((p) => ({ ts: p.closeTs, result: p.netProfit > 0 ? 'win' : p.netProfit < 0 ? 'loss' : 'even', realizedUsdt: p.netProfit }));
      closedSource = 'bitget';
    } else if (journal.mounted && (hist.data || hist.error)) {
      closed = journal.entries.map((e) => ({ ts: e.ts, result: e.result, realizedUsdt: e.realizedUsdt ?? null }));
      closedSource = 'journal';
    }
    let open: OpenRisk[] | null = null;
    // 거래소 연결은 됐는데 조회가 실패(권한·타임아웃 — 라우트가 200 + error 로 준다)하면 '열린 포지션 0'이 아니라 '모름'(null → WAIT)
    const posFailed = !!pos.data?.configured && !!pos.data.error;
    if (pos.data?.configured && !pos.data.error && Array.isArray(pos.data.positions)) {
      open = pos.data.positions.map((p) => {
        const plan = openJournal.find((e) => e.symbol.toUpperCase().replace(/_.*$/, '') === p.symbol.toUpperCase() && e.direction === p.side && e.stop > 0);
        // 손절가: 거래소에 걸린 손절 주문 우선(가드와 같은 기준) → 없으면 매매일지 계획
        return { symbol: p.symbol, side: p.side, riskUsdt: openRiskUsdt(p.side, p.size, p.openAvg, p.slStop ?? plan?.stop ?? null) };
      });
    } else if (!posFailed && journal.mounted && (pos.data || pos.error)) {
      open = openJournal.map((e) => {
        const dist = e.entry > 0 && e.stop > 0 ? Math.abs(e.entry - e.stop) / e.entry : null;
        const risk = e.notionUsdt && dist ? e.notionUsdt * dist : e.seedUsdt && e.riskPct ? (e.seedUsdt * e.riskPct) / 100 : null;
        return { symbol: e.symbol, side: e.direction as Direction, riskUsdt: risk };
      });
    }
    return { equity, equitySource: bitgetEquity ? 'bitget' : equity ? 'manual' : null, closed, closedSource, open };
  }, [journal.entries, journal.mounted, hist.data, hist.error, pos.data, pos.error, equity, bitgetEquity]);

  const evs = events.data?.events ?? null;
  const decision = useMemo(() => (now ? evaluateEntry({
    plan: {
      equity: equity ?? 0, direction: dir, entry: num(entry) ?? market.data?.price ?? 0, stop: num(stop), target: num(target),
      leverage: levNum, entryOrder, targetOrder, fundingRate: null, fundingIntervalH: null,
    },
    settings, account, market: market.error ? null : market.data ?? null,
    events: events.error ? null : evs, now,
  }) : null), [now, equity, dir, entry, stop, target, levNum, entryOrder, targetOrder, settings, account, market.data, market.error, events.error, evs]);

  const nx = evs && now ? nextEvent(evs, now) : null;
  const usedEntry = num(entry) ?? market.data?.price ?? null;

  /* 판정 기록 → 거래소 청산 포지션과 짝지어 결과 채우기.
     청산 기록은 최근 8일만 받으므로, 짝이 맞으면 판정 기록에 결과를 저장해 고정한다
     (예전엔 화면 계산만 해서 8일이 지나면 결과가 사라지고 복기 통계에서 빠졌다). */
  const matched = useMemo(
    () => matchClosed(decisions.items, hist.data?.configured && !hist.data.error && Array.isArray(hist.data.positions) ? hist.data.positions : []),
    [decisions.items, hist.data],
  );
  const { patch: patchDecision } = decisions;
  useEffect(() => {
    for (const [id, outcome] of matched) patchDecision(id, { outcome });
  }, [matched, patchDecision]);
  const decisionsWithOutcome = useMemo(() => decisions.items.map((d) => (d.outcome || !matched.has(d.id) ? d : { ...d, outcome: matched.get(d.id)! })), [decisions.items, matched]);
  const review = useMemo(() => {
    const rows = reviewSrc === 'decisions'
      ? decisionsWithOutcome.map(rowFromDecision).filter((r): r is NonNullable<typeof r> => r != null && (r.net != null || r.r != null))
      : journal.entries.map(rowFromJournal).filter((r): r is NonNullable<typeof r> => r != null);
    return { rows, sum: summarizeReview(rows) };
  }, [reviewSrc, decisionsWithOutcome, journal.entries]);

  const save = () => {
    if (!decision || !decision.sizing.ok || usedEntry == null) return;
    const z = decision.sizing;
    const rec: RiskDecisionRecord = {
      id: `${sym}-${now}`, ts: now, symbol: sym, direction: dir, verdict: decision.verdict,
      reasonCodes: decision.reasons.filter((r) => r.level === 'block' || r.level === 'wait').map((r) => r.code),
      leverage: levNum, entry: usedEntry, stop: num(stop)!, target: num(target), equity: equity ?? 0,
      plannedLossUsdt: z.netLossAtStop, plannedNetRR: z.netRR, plannedGrossRR: z.grossRR,
      feeEstUsdt: z.costs.entryFee + z.costs.stopExitFee, slippageEstUsdt: z.costs.slippageStop, fundingEstUsdt: z.costs.fundingCost,
      eventWindow: decision.eventState?.state ?? null,
      trend4h: market.data?.trend4h ?? null, trend1d: market.data?.trend1d ?? null,
      entryReason: reason.trim(), taken: null, outcome: null,
    };
    decisions.add(rec);
    setSavedMsg(`${fmtKst(now)} 판정(${decision.verdict})을 기록했습니다.`);
  };

  const v = decision?.verdict;
  const b = decision?.budget;
  const z = decision?.sizing;
  const grouped = GROUP_ORDER.map((g) => {
    const rs = decision?.reasons.filter((r) => r.group === g) ?? [];
    const worst = rs.reduce<ReasonLevel | null>((a, r) => (a == null || RANK[r.level] > RANK[a] ? r.level : a), null);
    return { g, rs, worst };
  });

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-12 min-w-0">
      <div className="mb-4">
        <h2 className="text-xl font-extrabold text-[var(--text)]">위험관리 컨트롤</h2>
        <p className="text-[13px] text-[var(--text-muted)] mt-1 leading-relaxed">
          포지션 크기를 <b className="text-[var(--text)]">손절 시 잃어도 되는 금액</b>에서 거꾸로 계산하고, 손실 한도·연속 손절·경제지표 발표·데이터 상태를 확인해
          신규 진입을 <b className="text-[var(--text)]">허용 · 관망 · 제한</b> 중 하나로 판정합니다. 목표는 높은 수익이 아니라 큰 손실을 막는 것입니다.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="fin-chip flat">자동매매 없음</span>
          <span className="fin-chip flat">읽기 전용</span>
          <span className="fin-chip flat">수익 신호 아님</span>
        </div>
      </div>

      {/* 현재 상태 */}
      <section aria-label="현재 계좌 위험 상태" className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <Tile label="계좌 자산(USDT)" value={usd(equity)} sub={bitgetEquity ? 'Bitget 선물 계좌' : equity ? '직접 입력' : '거래소 미연결 — 아래 입력'} />
        <Tile label="금일 실현 손익(KST)" value={b?.todayRealized == null ? '—' : `${b.todayRealized >= 0 ? '+' : ''}${usd(b.todayRealized)}`}
          tone={b?.todayRealized == null ? undefined : b.todayRealized < 0 ? 'var(--warn)' : 'var(--ok)'} sub={account.closedSource === 'bitget' ? '거래소 청산 기록' : account.closedSource === 'journal' ? '매매일지' : '불러오는 중'} />
        <Tile label="남은 일일 손실 허용" value={usd(b?.dailyRemaining)} sub={b?.dailyLimitUsdt != null ? `한도 ${usd(b.dailyLimitUsdt)} (${settings.dailyLossPct}%)` : `계좌 ${settings.dailyLossPct}%`}
          tone={b?.dailyRemaining != null && b.dailyRemaining <= 0 ? 'var(--warn)' : undefined} />
        <Tile label="연속 손절" value={b?.lossStreak == null ? '—' : `${b.lossStreak}회`} sub={`제한 ${settings.maxConsecutiveLosses}회`}
          tone={b?.lossStreak != null && b.lossStreak >= settings.maxConsecutiveLosses ? 'var(--warn)' : undefined} />
        <Tile label="현재 총 포지션 위험" value={usd(b?.openRiskUsdt)} sub={b?.totalRiskLimitUsdt != null ? `한도 ${usd(b.totalRiskLimitUsdt)} (${settings.maxTotalRiskPct}%)` : `계좌 ${settings.maxTotalRiskPct}%`}
          tone={account.open?.some((o) => o.riskUsdt == null) ? 'var(--amber)' : undefined} />
        <Tile label="레버리지" value={`기본 ${settings.defaultLeverage}배`} sub={`최대 ${settings.maxLeverage}배 · 상한 ${HARD_MAX_LEVERAGE}배`} />
        <Tile label="다음 주요 경제지표" value={nx ? humanMin((nx.ts - now) / 60_000) : events.error ? '불러오기 실패' : '—'} sub={nx ? `${nx.title} · ${fmtKst(nx.ts)} KST` : undefined} />
        <Tile label="신규 진입" value={v ?? '—'} sub={v ? VERDICT_UI[v].desc : '계산 중'} tone={v === 'ALLOW' ? 'var(--ok)' : v === 'BLOCK' ? 'var(--warn)' : v === 'WAIT' ? 'var(--amber)' : undefined} />
      </section>

      {/* 입력 */}
      <section aria-label="거래 계획 입력" className="fin-card p-4 mb-4">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="종목"><Toggle label="종목" value={sym} options={[['BTCUSDT', 'BTC'], ['ETHUSDT', 'ETH']] as const} onChange={setSym} /></Field>
          <Field label="방향"><Toggle label="방향" value={dir} options={[['long', '롱'], ['short', '숏']] as const} onChange={setDir} /></Field>
          <Field label="진입가" hint={market.data?.price ? `현재가 ${pxFmt(market.data.price)} — 비우면 현재가` : undefined}>
            <input inputMode="decimal" className={inputCls} value={entry} onChange={(e) => setEntry(e.target.value)} placeholder={market.data?.price ? pxFmt(market.data.price) : '진입가'} />
          </Field>
          <Field label="손절가(필수)"><input inputMode="decimal" className={inputCls} value={stop} onChange={(e) => setStop(e.target.value)} placeholder="손절가" /></Field>
          <Field label="목표가"><input inputMode="decimal" className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="목표가" /></Field>
          <Field label="레버리지(배)" hint={`허용 ${settings.defaultLeverage}~${settings.maxLeverage}배`}>
            <input inputMode="decimal" className={inputCls} value={lev} onChange={(e) => setLev(e.target.value)} placeholder={String(settings.defaultLeverage)} />
          </Field>
          <Field label="진입 주문"><Toggle label="진입 주문" value={entryOrder} options={[['market', '시장가'], ['limit', '지정가']] as const} onChange={setEntryOrder} /></Field>
          <Field label="목표 청산"><Toggle label="목표 청산" value={targetOrder} options={[['limit', '지정가'], ['market', '시장가']] as const} onChange={setTargetOrder} /></Field>
          {!bitgetEquity && (
            <Field label="계좌 자산(USDT)" hint="거래소 미연결·잠금 시 직접 입력">
              <input inputMode="decimal" className={inputCls} value={manualEquity} onChange={(e) => setManualEquity(e.target.value)} placeholder="예: 2000" />
            </Field>
          )}
        </div>
        <p className="text-[11px] text-[var(--faint)] mt-2.5 leading-relaxed">
          수수료 시장가 {settings.takerFeePct}% · 지정가 {settings.makerFeePct}% · 슬리피지 {settings.slippagePct}%(시장가 체결마다) · 보유 {settings.holdHours}시간 펀딩을 손실에 포함합니다. 손절은 시장가로 가정합니다.
        </p>
      </section>

      {/* 판정 */}
      {decision && v && (
        <section aria-label="진입 판정" className="fin-card p-4 mb-4" style={{ borderColor: v === 'ALLOW' ? 'var(--ok)' : v === 'BLOCK' ? 'var(--warn)' : 'var(--amber)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`fin-chip ${VERDICT_UI[v].chip}`} style={{ fontSize: 13, padding: '5px 12px' }}>{VERDICT_UI[v].label}</span>
            {market.isValidating && <span className="text-[11px] text-[var(--faint)]">시세 갱신 중…</span>}
          </div>
          <p className="text-[13.5px] font-semibold text-[var(--text)] mt-2 leading-snug break-keep">{decision.headline}</p>
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {grouped.map(({ g, rs, worst }) => (
              <li key={g} className="py-2 min-w-0">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span aria-hidden style={{ color: worst ? LEVEL_COLOR[worst] : 'var(--faint)' }} className="w-4 text-center shrink-0">{worst ? LEVEL_ICON[worst] : '·'}</span>
                  <b className="text-[var(--text)]">{CHECK_LABEL[g]}</b>
                </div>
                {rs.length === 0 ? <p className="pl-6 text-[11.5px] text-[var(--faint)]">해당 없음</p> : rs.map((r, i) => (
                  <p key={i} className="pl-6 text-[11.5px] leading-relaxed break-keep" style={{ color: r.level === 'ok' || r.level === 'note' ? 'var(--text-muted)' : LEVEL_COLOR[r.level] }}>{r.text}</p>
                ))}
              </li>
            ))}
          </ul>
          <p className="text-[10.5px] text-[var(--faint)] mt-2 leading-relaxed">
            여러 지표를 점수로 합치지 않습니다 — 규칙 하나라도 위반하면 제한, 데이터가 부족하거나 조건이 안 맞으면 관망. ALLOW 는 승률·수익을 뜻하지 않습니다.
          </p>
        </section>
      )}

      {/* 포지션 크기 */}
      {z && (
        <section aria-label="포지션 크기 계산" className="fin-card p-4 mb-4">
          <h3 className="text-[14px] font-bold text-[var(--text)]">포지션 크기 — 손절 기준 역산</h3>
          {!z.ok ? <p className="text-[12.5px] text-[var(--text-muted)] mt-2">{z.error}</p> : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-[12.5px]">
                {([
                  ['허용 손실(이번 거래)', `${usd(z.riskBudget)} USDT${z.capped ? ` (기본 ${usd(z.riskBudgetBase)}에서 축소)` : ` (계좌 ${settings.riskPerTradePct}%)`}`],
                  ['손절 거리', `${z.stopDistPct.toFixed(3)}%`],
                  ['수량', `${z.qty.toLocaleString('en-US', { maximumFractionDigits: 5 })} ${sym.replace('USDT', '')}`],
                  ['명목가치', `${usd(z.notional)} USDT`],
                  ...z.marginAt.map((m) => [`필요 증거금 ${m.lev}배`, `${usd(m.margin)} USDT${m.lev === levNum ? ' ← 선택' : ''}`] as [string, string]),
                  ['손절 시 예상 순손실', `−${usd(z.netLossAtStop)} USDT (계좌 ${z.riskPctOfEquity.toFixed(2)}%)`],
                  ['목표 도달 시 예상 순이익', z.netProfitAtTarget == null ? '목표가 없음' : `${z.netProfitAtTarget >= 0 ? '+' : ''}${usd(z.netProfitAtTarget)} USDT`],
                  ['손익비(명목 → 비용 반영)', z.grossRR == null ? '—' : `1 : ${z.grossRR.toFixed(2)} → 1 : ${z.netRR!.toFixed(2)}`],
                  ['수수료(진입+손절)', `${usd(z.costs.entryFee + z.costs.stopExitFee)} USDT`],
                  ['슬리피지(손절 시)', `${usd(z.costs.slippageStop)} USDT`],
                  ['펀딩(보유 중 낼 몫)', z.costs.fundingKnown ? `${usd(z.costs.fundingCost)} USDT` : '불러오지 못함'],
                  ['단순 청산가 근사', `${pxFmt(z.liqApprox)} (${levNum}배·격리·MMR 0.5%)`],
                ] as [string, string][]).map(([k, val]) => (
                  <div key={k} className="contents">
                    <dt className="text-[var(--text-muted)] min-w-0">{k}</dt>
                    <dd className="text-right font-semibold tabular-nums text-[var(--text)] min-w-0 break-keep">{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[10.5px] text-[var(--faint)] mt-2.5 leading-relaxed">
                레버리지는 증거금만 바꿉니다 — 같은 수량·같은 손절가면 5배든 10배든 손절 손실은 같습니다. 청산가는 거래소의 마크가격·유지증거금 티어·마진 모드에 따라 달라지므로 위 값은 확정 청산가가 아닙니다.
              </p>
            </>
          )}
        </section>
      )}

      {/* 판정 기록 */}
      <section aria-label="판정 기록" className="fin-card p-4 mb-4">
        <h3 className="text-[14px] font-bold text-[var(--text)]">판정 기록 — 나중에 실제 결과와 비교</h3>
        <p className="text-[11.5px] text-[var(--text-muted)] mt-1 leading-relaxed">진입 직전 판정·계획 손실·레버리지·비용 추정을 남겨 두면, 거래소 청산 기록과 자동으로 짝지어 R 배수·규칙 위반을 계산합니다. 주문은 보내지 않습니다.</p>
        <Field label="진입 사유(선택)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 4H 지지 재확인 후 진입" /></Field>
        <div className="flex items-center gap-2 mt-2.5">
          <button type="button" className="fin-more" onClick={save} disabled={!decision?.sizing.ok}>이 판정 기록</button>
          {savedMsg && <span className="text-[11.5px] text-[var(--text-muted)]">{savedMsg}</span>}
        </div>
        {decisionsWithOutcome.length > 0 && (
          <ul className="mt-3 divide-y divide-[var(--line)] text-[12px]">
            {decisionsWithOutcome.slice(0, 8).map((d) => (
              <li key={d.id} className="py-2 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <span className={`fin-chip ${VERDICT_UI[d.verdict].chip}`}>{d.verdict}</span>
                <span className="text-[var(--text)] tabular-nums">{fmtKst(d.ts)} · {d.symbol.replace('USDT', '')} {d.direction === 'long' ? '롱' : '숏'} {d.leverage}배</span>
                <span className="text-[var(--text-muted)] tabular-nums">계획 손실 {usd(d.plannedLossUsdt)}</span>
                {d.outcome ? (
                  <span className="tabular-nums" style={{ color: d.outcome.netProfit >= 0 ? 'var(--ok)' : 'var(--warn)' }}>
                    실제 {d.outcome.netProfit >= 0 ? '+' : ''}{usd(d.outcome.netProfit)} ({(d.outcome.netProfit / d.plannedLossUsdt).toFixed(2)}R)
                  </span>
                ) : (
                  <span className="flex gap-1">
                    <button type="button" className="fin-chip flat" aria-pressed={d.taken === true} onClick={() => decisions.patch(d.id, { taken: d.taken === true ? null : true })} style={d.taken === true ? { outline: '1px solid var(--accent)' } : undefined}>진입함</button>
                    <button type="button" className="fin-chip flat" aria-pressed={d.taken === false} onClick={() => decisions.patch(d.id, { taken: d.taken === false ? null : false })} style={d.taken === false ? { outline: '1px solid var(--accent)' } : undefined}>안 함</button>
                  </span>
                )}
                <button type="button" className="ml-auto text-[11px] text-[var(--faint)] hover:underline" onClick={() => decisions.remove(d.id)}>삭제</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 복기 */}
      <section aria-label="위험관리 복기" className="fin-card p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[14px] font-bold text-[var(--text)]">복기 — 규칙 준수와 손실 제어</h3>
          <div className="w-48 shrink-0"><Toggle label="복기 자료" value={reviewSrc} options={[['decisions', '판정 기록'], ['journal', '매매일지']] as const} onChange={setReviewSrc} /></div>
        </div>
        {review.rows.length === 0 ? (
          <p className="text-[12.5px] text-[var(--text-muted)] mt-3">
            {reviewSrc === 'decisions' ? '결과가 붙은 판정 기록이 아직 없습니다 — 판정을 기록하고 거래소에서 청산되면 여기서 집계됩니다.' : '청산된 매매일지 기록이 없습니다.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <Tile label={`평균 R (${review.sum.all.rN}건)`} value={review.sum.all.avgR == null ? '—' : `${review.sum.all.avgR >= 0 ? '+' : '−'}${Math.abs(review.sum.all.avgR).toFixed(2)}R`} />
              <Tile label="비용 차감 기대값" value={review.sum.all.expectancy == null ? '—' : `${usd(review.sum.all.expectancy)}`} sub="USDT/거래" />
              <Tile label="최대 낙폭(MDD)" value={`−${usd(review.sum.mdd)}`} sub="누적 순손익 기준" />
              <Tile label="최장 연속 손실" value={`${review.sum.maxLossStreak}회`} />
              <Tile label="손절 규칙 준수율" value={review.sum.stopRespectRate == null ? '—' : `${Math.round(review.sum.stopRespectRate * 100)}%`} sub={`계획 손실 110% 이내 · ${review.sum.stopRespectN}건`} />
              <Tile label="규칙 위반율" value={review.sum.violationRate == null ? '—' : `${Math.round(review.sum.violationRate * 100)}%`} sub={reviewSrc === 'decisions' ? 'WAIT·BLOCK 진입 또는 손절 초과' : '손절 초과'} />
              <Tile label="거래 수" value={`${review.sum.all.n}건`} sub={`${review.sum.all.wins}승 ${review.sum.all.losses}패`} />
              <Tile label="수수료 합" value={review.sum.all.feeSum ? usd(review.sum.all.feeSum) : '—'} sub={reviewSrc === 'journal' ? '매매일지엔 수수료 없음' : 'USDT'} />
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-[12px] text-[var(--text-muted)]">
                <thead><tr className="text-[10.5px] text-[var(--faint)]"><th className="text-left font-bold py-1">구분</th><th className="text-right font-bold px-1">건수</th><th className="text-right font-bold px-1">평균 R</th><th className="text-right font-bold pl-1">기대값</th></tr></thead>
                <tbody>
                  {[...review.sum.byLeverage, ...review.sum.bySide, ...(reviewSrc === 'decisions' ? [...review.sum.byEvent, ...review.sum.byRegime] : [])].map((g) => <StatRow key={g.label} label={g.label} s={g.stat} />)}
                </tbody>
              </table>
            </div>
            <p className="text-[10.5px] text-[var(--faint)] mt-2 leading-relaxed">표본이 적으면 우연입니다. 발표 구간·추세/횡보 구분은 판정 기록에만 있습니다(매매일지는 읽기만 하고 바꾸지 않음).</p>
          </>
        )}
      </section>

      {/* 설정 */}
      <details className="fin-card p-4 mb-4">
        <summary className="text-[14px] font-bold text-[var(--text)] cursor-pointer">위험관리 설정 {mounted ? '' : '(불러오는 중)'}</summary>
        <p className="text-[11px] text-[var(--faint)] mt-1.5 leading-relaxed">기본값은 검증된 수익 전략이 아니라 보수적인 초기 설정입니다. 최대 레버리지는 {HARD_MAX_LEVERAGE}배, 거래당 위험은 2%를 넘길 수 없습니다.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
          {([
            ['defaultLeverage', '기본 레버리지(배)'], ['maxLeverage', '최대 레버리지(배)'], ['riskPerTradePct', '거래당 위험 %'],
            ['dailyLossPct', '일일 최대 손실 %'], ['weeklyLossPct', '주간(7일) 최대 손실 %'], ['maxConsecutiveLosses', '연속 손절 제한(회)'],
            ['minNetRR', '최소 순손익비'], ['maxTotalRiskPct', '전체 동시 위험 %'], ['takerFeePct', '시장가 수수료 %'],
            ['makerFeePct', '지정가 수수료 %'], ['slippagePct', '슬리피지 %'], ['holdHours', '예상 보유(시간)'],
            ['eventPreMin', '발표 전 관망(분)'], ['eventPostMin', '발표 후 관망(분)'], ['eventExtendMaxMin', '정상화 확인 최대(분)'],
            ['volNormalMult', '정상화 변동 배수'], ['maxSpreadBps', '스프레드 상한(bp)'], ['volSpikeMult', '1시간 급변 배수'],
            ['fundingHotAnnualPct', '펀딩 과열(연 %)'], ['maxDataAgeSec', '시세 허용 지연(초)'],
          ] as [keyof RiskSettings, string][]).map(([k, label]) => (
            <Field key={k} label={label} hint={`기본 ${DEFAULT_RISK_SETTINGS[k]}`}>
              <input inputMode="decimal" className={inputCls} defaultValue={String(settings[k])} key={`${k}-${settings[k]}`}
                onBlur={(e) => { const n = num(e.target.value); if (n != null) update({ [k]: n } as Partial<RiskSettings>); }} />
            </Field>
          ))}
          <Field label="4H·1D 모두 역방향"><Toggle label="역추세 처리" value={settings.counterTrend} options={[['wait', '관망'], ['note', '참고만']] as const} onChange={(x) => update({ counterTrend: x })} /></Field>
          <Field label="순손익비 미달"><Toggle label="손익비 미달 처리" value={settings.rrShortfall} options={[['wait', '관망'], ['block', '제한']] as const} onChange={(x) => update({ rrShortfall: x })} /></Field>
        </div>
        <button type="button" className="fin-more mt-3" onClick={reset}>기본값으로</button>
      </details>

      <p className="text-[10.5px] text-[var(--faint)] leading-relaxed px-0.5">
        시세: Bitget USDT 무기한(공개) · OI: 바이낸스 · 계좌: Bitget 읽기 전용 API(연결 시) · 경제지표: {events.data?.note ?? 'FRED·연준 일정'}
        {events.data?.missing?.length ? ` · 일정 누락: ${events.data.missing.join(', ')}` : ''}. 이 화면은 주문·청산을 하지 않습니다.
      </p>
    </div>
  );
}
