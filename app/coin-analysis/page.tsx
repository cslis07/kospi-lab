'use client';

import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import CoinCandleChart, { ChartCandle } from '@/components/CoinCandleChart';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { useCoinAlerts } from '@/hooks/useCoinAlerts';
import BriefingModelPicker from '@/components/BriefingModelPicker';
import { useBriefingModel } from '@/hooks/useBriefingModel';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ── 코인 목록 ────────────────────────────────────────── */
const COINS = [
  { symbol: 'BTCUSDT', short: 'BTC', name: '비트코인', bg: '#F7931A' },
  { symbol: 'ETHUSDT', short: 'ETH', name: '이더리움', bg: '#627EEA' },
  { symbol: 'XRPUSDT', short: 'XRP', name: '리플',     bg: '#23292F' },
  { symbol: 'SOLUSDT', short: 'SOL', name: '솔라나',   bg: '#9945FF' },
];

/* ── 타입 (API 응답) ─────────────────────────────────── */
interface TF {
  tf: string; close: number;
  ema20: number; ema60: number; ema200: number | null; vwap: number | null;
  rsi: number;
  macd: { line: number; signal: number; hist: number; histSlope: number };
  bb: { upper: number; mid: number; lower: number; bandwidth: number; squeeze: boolean };
  atr: number; atrPct: number; volumeRatio: number;
  structure: string; emaAlign: string;
  priceVsEma20: string; priceVsVwap: string | null;
}
interface Zone { price: number; touches: number; kind: 'support' | 'resistance' }
interface Fib {
  direction: 'up' | 'down'; swingLow: number; swingHigh: number;
  r382: number; r50: number; r618: number; e1272: number; e1618: number;
  nearest: string | null;
}
interface LSPoint { ts: number; longRatio: number; shortRatio: number; ratio: number }
interface Driver { text: string; tone: 'up' | 'down' | 'warn' | 'info' }
interface AnalysisData {
  symbol: string; name: string; updatedAt: number;
  price: number; change24h: number | null; high24h: number | null; low24h: number | null;
  quoteVolume: number | null; markPrice: number | null; openInterest: number | null;
  funding: { rate: number; ratePct: number; nextTs: number | null; intervalH: number };
  longShort: { latest: LSPoint | null; history: LSPoint[] };
  timeframes: { h1: TF; m15: TF; m5: TF };
  zones: Zone[]; fib: Fib | null;
  charts: { m5: ChartCandle[]; m15: ChartCandle[]; h1: ChartCandle[] };
  movement: { direction: 'up' | 'down' | 'flat'; pct15m: number; pct1h: number; pct24h: number; drivers: Driver[] };
  divergence: 'bullish' | 'bearish' | null;
  fearGreed: { value: number; label: string; prev: number | null } | null;
  kimchi: { premiumPct: number; upbitKrw: number; usdKrw: number } | null;
  fundingHistory: { ts: number; rate: number }[];
  taker: { ratio: number | null; divergence: 'bullish' | 'bearish' | null; flow: { ts: number; buy: number; sell: number }[] };
  oi: { change1hPct: number | null; history: { ts: number; oi: number }[] };
  positionLS: { latest: number | null };
  dvol: { value: number; change24h: number | null } | null;
  dominance: { btc: number; eth: number; mcapChange24h: number } | null;
  event: { title: string; hoursUntil: number; date: string } | null;
  backtest: {
    fromTs: number; toTs: number; spanHours: number;
    signals: number; wins: number; losses: number; open: number;
    winRate: number | null; avgR: number | null;
    longSignals: number; shortSignals: number;
    trades: { ts: number; direction: 'long' | 'short'; score: number; entry: number; stop: number; target: number; result: 'win' | 'loss'; bars: number }[];
  };
  verdict: {
    state: string; score: number; direction: 'long' | 'short' | 'wait';
    entryOk: boolean; entryNote: string;
    leverage: { conservative: number; aggressive: number; note: string };
    entry: number; stop: number; stopPct: number; target1: number; target2: number; rr: number;
    reasons: string[]; warnings: string[];
    checklist: { label: string; pass: boolean; note: string }[];
  };
  news: { title: string; link: string; source: string; pubDate: string; sentiment: 'pos' | 'neg' | 'neu' }[];
  aiBriefing: string | null; aiError: string | null; aiModel?: string;
  error?: string;
}

/* ── 포맷 ────────────────────────────────────────────── */
function fmtP(n: number | null | undefined, digits?: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  const d = digits ?? (n >= 1000 ? 1 : n >= 10 ? 2 : 4);
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function timeAgo(ts: number): string {
  const kst = new Date(ts + 9 * 3600_000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}:${String(kst.getUTCSeconds()).padStart(2, '0')}`;
}

/* ── 서브 컴포넌트 ───────────────────────────────────── */
function DirectionBadge({ direction }: { direction: 'long' | 'short' | 'wait' }) {
  const cfg = {
    long:  { label: '롱 우위 ▲', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' },
    short: { label: '숏 우위 ▼', cls: 'bg-red-500/15 text-red-400 border-red-500/40' },
    wait:  { label: '관망 ⏸',    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40' },
  }[direction];
  return (
    <span className={`inline-flex items-center border rounded-xl font-bold px-4 py-1.5 text-lg ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const pct = (score + 100) / 2; // 0~100
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
        <span>숏 -100</span><span>0</span><span>롱 +100</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-red-500/60 via-slate-500/40 to-emerald-500/60">
        <div
          className="absolute w-1 rounded bg-white shadow"
          style={{ left: `calc(${pct}% - 2px)`, height: '18px', top: '-4px' }}
        />
      </div>
      <p className="text-center text-sm font-bold mt-1.5 tabular-nums text-[var(--text)]">
        종합 점수 {score > 0 ? '+' : ''}{score}
      </p>
    </div>
  );
}

function TFCard({ tf }: { tf: TF }) {
  const rows: { k: string; v: string; tone?: 'pos' | 'neg' | 'warn' }[] = [
    { k: '시장구조', v: tf.structure, tone: tf.structure === '상승' ? 'pos' : tf.structure === '하락' ? 'neg' : undefined },
    { k: 'EMA 20/60', v: tf.emaAlign, tone: tf.emaAlign === '정배열' ? 'pos' : tf.emaAlign === '역배열' ? 'neg' : undefined },
    { k: 'EMA20 대비', v: tf.priceVsEma20 === 'above' ? '위' : '아래', tone: tf.priceVsEma20 === 'above' ? 'pos' : 'neg' },
    ...(tf.priceVsVwap ? [{ k: 'VWAP 대비', v: tf.priceVsVwap === 'above' ? '위' : '아래', tone: (tf.priceVsVwap === 'above' ? 'pos' : 'neg') as 'pos' | 'neg' }] : []),
    { k: 'RSI(14)', v: tf.rsi.toFixed(1), tone: tf.rsi >= 70 || tf.rsi <= 30 ? 'warn' : undefined },
    { k: 'MACD 히스토', v: `${tf.macd.hist > 0 ? '+' : ''}${tf.macd.hist.toFixed(tf.close >= 1000 ? 1 : 4)} ${tf.macd.histSlope > 0 ? '↗' : tf.macd.histSlope < 0 ? '↘' : '→'}`, tone: tf.macd.hist > 0 ? 'pos' : 'neg' },
    { k: '볼린저', v: tf.bb.squeeze ? '수축(돌파 대기)' : `폭 ${(tf.bb.bandwidth * 100).toFixed(2)}%`, tone: tf.bb.squeeze ? 'warn' : undefined },
    { k: 'ATR', v: `${fmtP(tf.atr)} (${tf.atrPct.toFixed(2)}%)` },
    { k: '거래량(확정봉)', v: `평균 ${tf.volumeRatio.toFixed(1)}배`, tone: tf.volumeRatio >= 1.5 ? 'pos' : tf.volumeRatio < 0.8 ? 'warn' : undefined },
  ];
  const title = tf.tf === '1H' ? '1시간봉 · 방향' : tf.tf === '15m' ? '15분봉 · 구조' : '5분봉 · 타이밍';
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
        <span className="text-[10px] text-[var(--text-muted)]">{tf.tf}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.k} className="flex justify-between text-xs">
            <span className="text-[var(--text-muted)]">{r.k}</span>
            <span className={`font-semibold tabular-nums ${
              r.tone === 'pos' ? 'text-emerald-400' : r.tone === 'neg' ? 'text-red-400' : r.tone === 'warn' ? 'text-amber-400' : 'text-[var(--text)]'
            }`}>{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 포지션 계산기 ───────────────────────────────────── */
function PositionCalc({ stopPct, levCons, levAggr }: { stopPct: number; levCons: number; levAggr: number }) {
  const [seed, setSeed] = useState('1000');
  const [riskPct, setRiskPct] = useState('1');
  const s = parseFloat(seed) || 0;
  const r = parseFloat(riskPct) || 0;
  const notion = stopPct > 0 ? (s * r / 100) / (stopPct / 100) : 0;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <h3 className="text-sm font-bold text-[var(--text)] mb-1">포지션 사이징 계산기</h3>
      <p className="text-[10px] text-[var(--text-muted)] mb-3">노션 = 시드 × 허용손실% ÷ 손절거리({stopPct.toFixed(2)}%)</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="text-xs text-[var(--text-muted)]">
          시드 (USDT)
          <input value={seed} onChange={(e) => setSeed(e.target.value)} inputMode="decimal"
            className="mt-1 w-full px-2.5 py-1.5 text-sm bg-transparent border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-sky-500/50 tabular-nums" />
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          1회 허용손실 (%)
          <input value={riskPct} onChange={(e) => setRiskPct(e.target.value)} inputMode="decimal"
            className="mt-1 w-full px-2.5 py-1.5 text-sm bg-transparent border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-sky-500/50 tabular-nums" />
        </label>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">적정 포지션 노션</span><span className="font-bold text-[var(--text)] tabular-nums">{notion.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT</span></div>
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">필요 증거금 ({levCons}배)</span><span className="font-semibold text-[var(--text)] tabular-nums">{levCons > 0 ? (notion / levCons).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-'} USDT</span></div>
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">필요 증거금 ({levAggr}배)</span><span className="font-semibold text-[var(--text)] tabular-nums">{levAggr > 0 ? (notion / levAggr).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-'} USDT</span></div>
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">손절 시 손실액</span><span className="font-semibold text-red-400 tabular-nums">-{(s * r / 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} USDT</span></div>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mt-2.5">리스크는 손절거리와 노션이 결정 — 레버리지는 증거금 효율만 바꿉니다.</p>
    </div>
  );
}

/* ── 메인 ────────────────────────────────────────────── */
export default function CoinAnalysisPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [chartTf, setChartTf] = useState<'m5' | 'm15' | 'h1'>('m5');
  const { model: aiModel, setModel: setAiModel, ready: modelReady } = useBriefingModel();
  // symbol·aiModel은 '선택 상태', run은 '실행된 상태'. 분석 버튼을 눌러야 run이 바뀐다.
  const [run, setRun] = useState<{ symbol: string; model: string } | null>(null);
  const { data, isLoading, isValidating, mutate } = useSWR<AnalysisData>(
    run ? `/api/coin-analysis?symbol=${run.symbol}&model=${run.model}` : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: run && autoRefresh ? 60000 : 0 },
  );
  const dirty = !!run && (run.symbol !== symbol || run.model !== aiModel);
  const analyze = () => { if (modelReady) setRun({ symbol, model: aiModel }); };

  const journal = useCoinJournal();
  const coinAlerts = useCoinAlerts();

  const v = data?.verdict;

  // 분석 결과 갱신 시 조건 알림 체크
  useEffect(() => {
    if (data && !data.error && data.verdict) {
      coinAlerts.check(data.symbol, data.name, data.verdict.direction, data.verdict.entryOk, data.verdict.score);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.symbol, data?.updatedAt]);

  // 매매일지 자동 채점: 열려있는 기록의 손절/1차 익절 중 무엇이 먼저 닿았는지 캔들로 판정
  useEffect(() => {
    if (!data || data.error || !data.charts) return;
    const open = journal.entries.filter((e) => e.symbol === data.symbol && e.result === 'open' && e.direction !== 'wait');
    for (const e of open) {
      // 기록 시점을 커버하는 가장 정밀한 시리즈 선택 (5m→15m→1H)
      const series = [data.charts.m5, data.charts.m15, data.charts.h1].find((s) => s.length && s[0].ts <= e.ts);
      if (!series) continue;
      let result: 'win' | 'loss' | null = null;
      for (const c of series) {
        if (c.ts <= e.ts) continue;
        const hitStop = e.direction === 'long' ? c.l <= e.stop : c.h >= e.stop;
        const hitT1 = e.direction === 'long' ? c.h >= e.target1 : c.l <= e.target1;
        if (hitStop) { result = 'loss'; break; }  // 동시 도달 → 보수적 손실
        if (hitT1) { result = 'win'; break; }
      }
      if (result) {
        journal.update(e.id, { result, resultR: result === 'win' ? 1 : -1, memo: '자동판정' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.symbol, data?.updatedAt, journal.entries.length]);

  const nextFundingMin = useMemo(() => {
    if (!data?.funding?.nextTs) return null;
    return Math.max(0, Math.round((data.funding.nextTs - Date.now()) / 60000));
  }, [data]);

  const priceDigits = data && data.price < 10 ? 4 : data && data.price < 1000 ? 2 : 1;
  // 알림은 분석된 심볼(data.symbol)로 발동한다. 선택만 바꾼 상태에서 규칙이 어긋나지 않도록 맞춘다.
  const alertSymbol = data?.symbol ?? symbol;
  const alertRule = coinAlerts.rules[alertSymbol];

  const saveToJournal = () => {
    if (!data || !v) return;
    journal.add({
      ts: Date.now(), symbol: data.symbol, name: data.name,
      direction: v.direction, state: v.state, score: v.score, price: data.price,
      entry: v.entry, stop: v.stop, target1: v.target1, target2: v.target2,
      leverage: v.leverage.conservative, reasonsTop: v.reasons.slice(0, 3),
    });
  };

  const toggleAlert = async (kind: 'entry' | 'long' | 'short') => {
    if (coinAlerts.permission !== 'granted') {
      const p = await coinAlerts.requestPermission();
      if (p !== 'granted') return;
    }
    if (kind === 'entry') {
      coinAlerts.setRule(alertSymbol, { onEntryOk: !alertRule?.onEntryOk });
    } else {
      coinAlerts.setRule(alertSymbol, { onDirection: alertRule?.onDirection === kind ? null : kind });
    }
  };

  return (
    <div className="pb-12">
      {/* 코인 탭 + 새로고침 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1.5">
          {COINS.map((c) => (
            <button key={c.symbol} onClick={() => setSymbol(c.symbol)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                symbol === c.symbol
                  ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                  : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
              }`}>
              <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[8px] text-white" style={{ backgroundColor: c.bg }}>
                {c.short[0]}
              </span>
              {c.short}
            </button>
          ))}
        </div>
        <button onClick={analyze} disabled={!modelReady || isValidating}
          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold disabled:opacity-50 ${
            !run || dirty ? 'bg-sky-500/20 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)]'
          }`}>
          {isValidating ? '분석 중…' : '분석'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {data && !data.error && (
            <span className="text-[10px] text-[var(--text-muted)]">{timeAgo(data.updatedAt)} 분석</span>
          )}
          <button onClick={() => setAutoRefresh((v) => !v)} disabled={!run}
            className={`px-3 py-1.5 rounded-xl border text-xs transition-colors disabled:opacity-50 ${
              autoRefresh ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
            }`}>
            {autoRefresh ? '● 자동 1분' : '○ 자동갱신'}
          </button>
          <button onClick={() => mutate()} disabled={!run || isValidating}
            className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs text-[var(--text)] hover:border-[var(--border-hover)] disabled:opacity-50 transition-colors">
            {isValidating ? '분석 중…' : '⟳ 재분석'}
          </button>
        </div>
      </div>

      {/* 아직 실행 전 */}
      {!run && !isValidating && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <p className="text-3xl mb-3">🪙</p>
          <p className="text-sm font-semibold text-[var(--text)] mb-1">
            코인을 고르고 <span className="text-sky-400">분석</span> 버튼을 누르세요
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            페이지를 열 때 자동으로 실행되지 않습니다. 캔들·파생 수급 수집과 AI 브리핑 호출을 아끼기 위해서입니다.
          </p>
        </div>
      )}

      {/* 실행 후 선택이 바뀐 상태 */}
      {dirty && !isValidating && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-400">
          선택이 바뀌었습니다 — 아래 결과는 이전 분석입니다. <strong>분석</strong> 버튼을 다시 누르세요.
        </div>
      )}

      {/* 알림 설정 바 */}
      {data && !data.error && (
        <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
          <span className="text-[var(--text-muted)]">🔔 {COINS.find((c) => c.symbol === alertSymbol)?.short} 알림:</span>
          <button onClick={() => toggleAlert('entry')}
            className={`px-2.5 py-1 rounded-lg border transition-colors ${
              alertRule?.onEntryOk ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
            }`}>진입조건 충족 시</button>
          <button onClick={() => toggleAlert('long')}
            className={`px-2.5 py-1 rounded-lg border transition-colors ${
              alertRule?.onDirection === 'long' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
            }`}>롱 전환 시</button>
          <button onClick={() => toggleAlert('short')}
            className={`px-2.5 py-1 rounded-lg border transition-colors ${
              alertRule?.onDirection === 'short' ? 'bg-red-500/15 text-red-400 border-red-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
            }`}>숏 전환 시</button>
          {coinAlerts.permission === 'denied' && (
            <span className="text-[10px] text-amber-400">브라우저 알림이 차단되어 있습니다</span>
          )}
          <span className="text-[10px] text-[var(--text-muted)]">· 페이지 열린 상태 + 자동갱신에서 동작</span>
        </div>
      )}

      {(isLoading || (isValidating && !data)) && (
        <div className="space-y-4">
          <div className="h-40 rounded-2xl bg-white/5 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-64 rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        </div>
      )}

      {data?.error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center text-sm text-red-400">
          분석 실패: {data.error}
        </div>
      )}

      {data && !data.error && v && (
        <div className="space-y-4">
          {/* 임박 경제 이벤트 경고 */}
          {data.event && (
            <div className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              data.event.hoursUntil <= 12
                ? 'border-red-500/40 bg-red-500/10 text-red-400'
                : 'border-amber-500/30 bg-amber-500/5 text-amber-400'
            }`}>
              <span className="text-lg">🚨</span>
              <span>
                {data.event.title} — {data.event.hoursUntil <= 0 ? '발표 직후 변동성 구간' : `약 ${Math.round(data.event.hoursUntil)}시간 후`}
                {data.event.hoursUntil <= 12 && ' · 신규 진입 자동 차단 중 (이벤트 통과 후 재평가)'}
              </span>
            </div>
          )}

          {/* 헤더: 가격·파생 지표 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">{data.name} · USDT 무기한</p>
                <p className="text-3xl font-bold tabular-nums text-[var(--text)] mt-0.5">${fmtP(data.price, priceDigits)}</p>
                {data.change24h !== null && (
                  <p className={`text-sm font-semibold mt-0.5 ${data.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.change24h >= 0 ? '▲ +' : '▼ '}{data.change24h.toFixed(2)}% (24h)
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-2 text-xs pt-1">
                <div><p className="text-[var(--text-muted)]">펀딩비</p>
                  <p className={`font-bold tabular-nums ${Math.abs(data.funding.ratePct) >= 0.05 ? 'text-amber-400' : 'text-[var(--text)]'}`}>
                    {data.funding.ratePct >= 0 ? '+' : ''}{data.funding.ratePct.toFixed(4)}%
                    {data.fundingHistory.length >= 2 && (
                      <span className="ml-1 text-[10px] font-normal">
                        {data.funding.rate > data.fundingHistory[data.fundingHistory.length - 1].rate ? '↗' : data.funding.rate < data.fundingHistory[data.fundingHistory.length - 1].rate ? '↘' : '→'}
                      </span>
                    )}
                  </p></div>
                <div><p className="text-[var(--text-muted)]">다음 펀딩</p>
                  <p className={`font-bold tabular-nums ${nextFundingMin !== null && nextFundingMin <= 10 ? 'text-red-400' : 'text-[var(--text)]'}`}>
                    {nextFundingMin !== null ? `${Math.floor(nextFundingMin / 60)}시간 ${nextFundingMin % 60}분` : '-'}
                  </p></div>
                <div><p className="text-[var(--text-muted)]">미결제약정(OI)</p>
                  <p className="font-bold tabular-nums text-[var(--text)]">{data.openInterest ? data.openInterest.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-'}</p></div>
                <div><p className="text-[var(--text-muted)]">24h 거래대금</p>
                  <p className="font-bold tabular-nums text-[var(--text)]">{data.quoteVolume ? `$${(data.quoteVolume / 1e9).toFixed(2)}B` : '-'}</p></div>
                <div><p className="text-[var(--text-muted)]">공포탐욕지수</p>
                  {data.fearGreed ? (
                    <p className={`font-bold tabular-nums ${data.fearGreed.value <= 25 ? 'text-red-400' : data.fearGreed.value >= 75 ? 'text-amber-400' : 'text-[var(--text)]'}`}>
                      {data.fearGreed.value} <span className="text-[10px] font-normal">{data.fearGreed.label}</span>
                    </p>
                  ) : <p className="font-bold text-[var(--text-muted)]">-</p>}
                </div>
                <div><p className="text-[var(--text-muted)]">김치 프리미엄</p>
                  {data.kimchi ? (
                    <p className={`font-bold tabular-nums ${Math.abs(data.kimchi.premiumPct) >= 2 ? 'text-amber-400' : 'text-[var(--text)]'}`}>
                      {data.kimchi.premiumPct >= 0 ? '+' : ''}{data.kimchi.premiumPct.toFixed(2)}%
                    </p>
                  ) : <p className="font-bold text-[var(--text-muted)]">-</p>}
                </div>
                <div><p className="text-[var(--text-muted)]">BTC 변동성(DVOL)</p>
                  {data.dvol ? (
                    <p className={`font-bold tabular-nums ${data.dvol.change24h !== null && data.dvol.change24h >= 5 ? 'text-amber-400' : 'text-[var(--text)]'}`}>
                      {data.dvol.value.toFixed(1)}
                      {data.dvol.change24h !== null && (
                        <span className={`ml-1 text-[10px] font-normal ${data.dvol.change24h >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {data.dvol.change24h >= 0 ? '+' : ''}{data.dvol.change24h.toFixed(1)}
                        </span>
                      )}
                    </p>
                  ) : <p className="font-bold text-[var(--text-muted)]">-</p>}
                </div>
                <div><p className="text-[var(--text-muted)]">BTC 도미넌스</p>
                  {data.dominance ? (
                    <p className="font-bold tabular-nums text-[var(--text)]">
                      {data.dominance.btc.toFixed(1)}%
                      <span className={`ml-1 text-[10px] font-normal ${data.dominance.mcapChange24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        시총 {data.dominance.mcapChange24h >= 0 ? '+' : ''}{data.dominance.mcapChange24h.toFixed(1)}%
                      </span>
                    </p>
                  ) : <p className="font-bold text-[var(--text-muted)]">-</p>}
                </div>
              </div>
            </div>

            {/* 롱숏 계정 비율 심리 바 */}
            {data.longShort.latest && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-emerald-400 font-semibold">롱 {(data.longShort.latest.longRatio * 100).toFixed(1)}%</span>
                  <span className="text-[var(--text-muted)]">롱숏 계정 비율 {data.longShort.latest.ratio.toFixed(2)}
                    {data.longShort.latest.ratio >= 2.0 ? ' · 롱 과밀 주의' : data.longShort.latest.ratio <= 0.6 ? ' · 숏 과밀 주의' : ''}
                  </span>
                  <span className="text-red-400 font-semibold">숏 {(data.longShort.latest.shortRatio * 100).toFixed(1)}%</span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500/70" style={{ width: `${data.longShort.latest.longRatio * 100}%` }} />
                  <div className="bg-red-500/70" style={{ width: `${data.longShort.latest.shortRatio * 100}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* 지금 왜 움직이나 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h3 className="text-sm font-bold text-[var(--text)]">
                {data.movement.direction === 'up' ? '📈 지금 왜 오르나' : data.movement.direction === 'down' ? '📉 지금 왜 내리나' : '📊 지금 흐름 읽기'}
              </h3>
              <div className="flex gap-1.5 ml-auto">
                {[
                  { k: '15분', v: data.movement.pct15m },
                  { k: '1시간', v: data.movement.pct1h },
                  { k: '24시간', v: data.movement.pct24h },
                ].map((c) => (
                  <span key={c.k} className={`px-2 py-0.5 rounded-lg text-[10px] font-bold tabular-nums border ${
                    c.v >= 0 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' : 'text-red-400 border-red-500/30 bg-red-500/5'
                  }`}>
                    {c.k} {c.v >= 0 ? '+' : ''}{c.v.toFixed(2)}%
                  </span>
                ))}
              </div>
            </div>
            <ul className="space-y-1.5">
              {data.movement.drivers.map((d, i) => (
                <li key={i} className={`text-[11px] flex gap-1.5 leading-relaxed ${
                  d.tone === 'up' ? 'text-emerald-400/90' : d.tone === 'down' ? 'text-red-400/90' : d.tone === 'warn' ? 'text-amber-400/90' : 'text-[var(--text-muted)]'
                }`}>
                  <span className="shrink-0">{d.tone === 'up' ? '▲' : d.tone === 'down' ? '▼' : d.tone === 'warn' ? '⚠' : '•'}</span>
                  {d.text}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-[var(--text-muted)] mt-2.5 opacity-60">수급·파생·뉴스 신호 기반 자동 추정 — 정확한 인과가 아닌 참고용 해석입니다.</p>
          </div>

          {/* 종합 판단 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <DirectionBadge direction={v.direction} />
              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-[var(--border)] text-xs font-semibold text-[var(--text)]">{v.state}</span>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                v.entryOk ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-500/10 text-[var(--text-muted)] border-[var(--border)]'
              }`}>
                {v.entryOk ? '✓ 진입 조건 충족' : '진입 대기'}
              </span>
              <button onClick={saveToJournal}
                className="ml-auto px-2.5 py-1 rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition-colors">
                📓 매매일지 기록
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-5">
              <div className="space-y-4">
                <ScoreGauge score={v.score} />
                <p className="text-xs text-[var(--text)] bg-white/3 border border-[var(--border)] rounded-xl p-3 leading-relaxed">{v.entryNote}</p>
                <div className="rounded-xl border border-[var(--border)] p-3">
                  <p className="text-[10px] text-[var(--text-muted)] mb-1.5">권장 레버리지</p>
                  <p className="text-lg font-bold text-[var(--text)]">
                    보수 <span className="text-sky-400">{v.leverage.conservative}배</span>
                    <span className="mx-2 text-[var(--text-dim)]">·</span>
                    적극 <span className="text-amber-400">{v.leverage.aggressive}배</span>
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-relaxed">{v.leverage.note}</p>
                </div>
              </div>

              {v.direction !== 'wait' ? (
                <div className="grid grid-cols-2 gap-2.5 content-start">
                  {[
                    { label: '기준 진입가', value: `$${fmtP(v.entry, priceDigits)}`, cls: 'text-[var(--text)]' },
                    { label: `손절가 (${v.stopPct.toFixed(2)}%)`, value: `$${fmtP(v.stop, priceDigits)}`, cls: 'text-red-400' },
                    { label: '1차 익절 (1R)', value: `$${fmtP(v.target1, priceDigits)}`, cls: 'text-emerald-400' },
                    { label: '2차 익절 (1.5R+)', value: `$${fmtP(v.target2, priceDigits)}`, cls: 'text-emerald-400' },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl border border-[var(--border)] p-3 bg-white/3">
                      <p className="text-[10px] text-[var(--text-muted)]">{c.label}</p>
                      <p className={`text-base font-bold tabular-nums mt-0.5 ${c.cls}`}>{c.value}</p>
                    </div>
                  ))}
                  <p className="col-span-2 text-[10px] text-[var(--text-muted)]">
                    손절은 구조 무효화 지점 + 15m ATR 기준. 진입과 동시에 손절·익절 주문 등록(reduce-only) 권장.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-5 flex items-center justify-center text-center">
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    현재 관망 구간입니다.<br />
                    진입 조건이 겹칠 때(방향 필터 + 구조 + 트리거 + 거래량)만 가격 레벨이 의미를 갖습니다.
                  </p>
                </div>
              )}
            </div>

            {/* 근거·경고 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
              <div>
                <p className="text-xs font-bold text-[var(--text)] mb-2">분석 근거</p>
                <ul className="space-y-1">
                  {v.reasons.map((r, i) => (
                    <li key={i} className="text-[11px] text-[var(--text-muted)] flex gap-1.5">
                      <span className="text-sky-400 shrink-0">•</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-bold text-amber-400 mb-2">경고·회피 규칙</p>
                {v.warnings.length ? (
                  <ul className="space-y-1">
                    {v.warnings.map((w, i) => (
                      <li key={i} className="text-[11px] text-amber-400/90 flex gap-1.5">
                        <span className="shrink-0">⚠</span>{w}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[11px] text-[var(--text-muted)]">현재 특이 경고 없음</p>}
              </div>
            </div>
          </div>

          {/* 캔들 차트 (5m/15m/1H, EMA·지지저항·진입레벨 오버레이) */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--text)]">캔들 차트 <span className="text-[10px] font-normal text-[var(--text-muted)]">최근 60봉 · EMA20/60 · 지지저항·피보나치·진입레벨</span></h3>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1">
                  {([['m5', '5분'], ['m15', '15분'], ['h1', '1시간']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setChartTf(k)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] border transition-colors ${
                        chartTf === k ? 'bg-sky-500/20 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                      }`}>{label}</button>
                  ))}
                </div>
                <div className="hidden sm:flex items-center gap-2 text-[10px]">
                  <span className="text-purple-400">— EMA20</span>
                  <span className="text-sky-400">— EMA60</span>
                </div>
              </div>
            </div>
            <CoinCandleChart
              candles={data.charts[chartTf]}
              supports={data.zones.filter((z) => z.kind === 'support').map((z) => z.price)}
              resistances={data.zones.filter((z) => z.kind === 'resistance').map((z) => z.price)}
              fib={data.fib}
              entry={v.entry} stop={v.stop} target1={v.target1} target2={v.target2}
              direction={v.direction}
              digits={priceDigits}
            />
          </div>

          {/* AI 브리핑 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-bold text-[var(--text)]">🤖 AI 종합 브리핑 <span className="text-[10px] font-normal text-[var(--text-muted)]">차트 + 뉴스 동향</span></h3>
              <BriefingModelPicker value={aiModel} onChange={setAiModel} busy={isValidating} />
            </div>
            {data.aiBriefing ? (
              <div className="space-y-2.5">
                {data.aiBriefing.split(/(?=【)/).filter((s) => s.trim()).map((sec, i) => {
                  const m = sec.match(/^【([^】]+)】([\s\S]*)$/);
                  if (!m) return <p key={i} className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-line">{sec.trim()}</p>;
                  return (
                    <div key={i}>
                      <p className="text-[11px] font-bold text-sky-400 mb-0.5">{m[1]}</p>
                      <p className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-line">{m[2].trim()}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">{data.aiError ?? 'AI 브리핑을 사용할 수 없습니다.'}</p>
            )}
          </div>

          {/* 타임프레임 3분할 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TFCard tf={{ ...data.timeframes.h1, tf: '1H' }} />
            <TFCard tf={{ ...data.timeframes.m15, tf: '15m' }} />
            <TFCard tf={{ ...data.timeframes.m5, tf: '5m' }} />
          </div>

          {/* 수급 정밀 + 백테스트 성적표 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 파생 수급 정밀 */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-bold text-[var(--text)] mb-3">파생 수급 정밀 <span className="text-[10px] font-normal text-[var(--text-muted)]">주문흐름·OI·포지셔닝</span></h3>
              <div className="space-y-3">
                {/* 테이커 매수/매도 게이지 */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-[var(--text-muted)]">테이커 매수/매도 (최근 30분)</span>
                    <span className={`font-bold tabular-nums ${
                      data.taker.ratio === null ? 'text-[var(--text-muted)]' : data.taker.ratio >= 1.2 ? 'text-emerald-400' : data.taker.ratio <= 0.85 ? 'text-red-400' : 'text-[var(--text)]'
                    }`}>{data.taker.ratio?.toFixed(2) ?? '-'}</span>
                  </div>
                  {data.taker.ratio !== null && (
                    <div className="flex h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500/70" style={{ width: `${(data.taker.ratio / (1 + data.taker.ratio)) * 100}%` }} />
                      <div className="bg-red-500/70" style={{ width: `${(1 / (1 + data.taker.ratio)) * 100}%` }} />
                    </div>
                  )}
                  {data.taker.divergence && (
                    <p className={`text-[10px] mt-1 font-semibold ${data.taker.divergence === 'bearish' ? 'text-red-400' : 'text-emerald-400'}`}>
                      ⚡ 주문흐름 {data.taker.divergence === 'bearish' ? '약세' : '강세'} 다이버전스 감지
                    </p>
                  )}
                </div>
                {/* OI */}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--text-muted)]">미결제약정 1시간 변화</span>
                  <span className={`font-bold tabular-nums ${
                    data.oi.change1hPct === null ? 'text-[var(--text-muted)]' : data.oi.change1hPct >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>{data.oi.change1hPct !== null ? `${data.oi.change1hPct >= 0 ? '+' : ''}${data.oi.change1hPct.toFixed(2)}%` : '-'}</span>
                </div>
                {/* 포지션 vs 계정 */}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--text-muted)]">계정 롱숏 vs 포지션 금액</span>
                  <span className="font-bold tabular-nums text-[var(--text)]">
                    {data.longShort.latest?.ratio.toFixed(2) ?? '-'} <span className="text-[var(--text-dim)]">vs</span> {data.positionLS.latest?.toFixed(2) ?? '-'}
                  </span>
                </div>
                {data.longShort.latest && data.positionLS.latest !== null && Math.abs(data.longShort.latest.ratio - data.positionLS.latest) >= 0.5 && (
                  <p className="text-[10px] text-amber-400">
                    {data.longShort.latest.ratio > data.positionLS.latest
                      ? '⚠ 개미는 롱 쏠림, 큰손(금액)은 중립 — 하락 시 개미 롱이 청산 연료가 될 수 있음'
                      : '⚠ 개미는 숏 쏠림, 큰손(금액)은 롱 우위 — 상승 스퀴즈 여지'}
                  </p>
                )}
                <p className="text-[10px] text-[var(--text-muted)] opacity-60">테이커·포지션: Bitget / OI: Bybit — 주문흐름 불균형은 단기 가격 변동의 주 요인(학술 근거)</p>
              </div>
            </div>

            {/* 룰 엔진 성적표 (백테스트) */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-bold text-[var(--text)] mb-1">룰 엔진 성적표 <span className="text-[10px] font-normal text-[var(--text-muted)]">최근 {Math.round(data.backtest.spanHours)}시간 자동 백테스트</span></h3>
              <p className="text-[10px] text-[var(--text-muted)] mb-3">과거 캔들에서 진입 신호 발생 시 1R 익절 vs 손절 판정 (수수료 미반영·보수적 동시도달 처리)</p>
              {data.backtest.signals === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-3 text-center">이 기간 진입 조건을 충족한 신호가 없습니다 — 엔진이 관망을 유지한 구간</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { k: '신호', v: String(data.backtest.signals), cls: 'text-[var(--text)]' },
                      { k: '승률', v: data.backtest.winRate !== null ? `${data.backtest.winRate.toFixed(0)}%` : '-', cls: data.backtest.winRate !== null && data.backtest.winRate >= 50 ? 'text-emerald-400' : 'text-red-400' },
                      { k: '기대값', v: data.backtest.avgR !== null ? `${data.backtest.avgR >= 0 ? '+' : ''}${data.backtest.avgR.toFixed(2)}R` : '-', cls: data.backtest.avgR !== null && data.backtest.avgR >= 0 ? 'text-emerald-400' : 'text-red-400' },
                      { k: '롱/숏', v: `${data.backtest.longSignals}/${data.backtest.shortSignals}`, cls: 'text-[var(--text)]' },
                    ].map((c) => (
                      <div key={c.k} className="rounded-xl border border-[var(--border)] p-2 text-center">
                        <p className="text-[10px] text-[var(--text-muted)]">{c.k}</p>
                        <p className={`text-sm font-bold tabular-nums ${c.cls}`}>{c.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--border)]">
                    <table className="w-full text-[10px] tabular-nums">
                      <thead>
                        <tr className="text-[var(--text-muted)] bg-[var(--bg)] sticky top-0">
                          <th className="text-left px-2 py-1 font-medium">시각</th>
                          <th className="text-left px-2 py-1 font-medium">방향</th>
                          <th className="text-right px-2 py-1 font-medium">진입가</th>
                          <th className="text-right px-2 py-1 font-medium">손절가</th>
                          <th className="text-right px-2 py-1 font-medium">보유</th>
                          <th className="text-right px-2 py-1 font-medium">결과</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.backtest.trades.map((tr, i) => (
                          <tr key={i} className={i % 2 === 1 ? 'bg-[var(--bg)]/30' : ''}>
                            <td className="px-2 py-1 text-[var(--text-muted)]">{new Date(tr.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                            <td className={`px-2 py-1 ${tr.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>{tr.direction === 'long' ? '롱' : '숏'} ({tr.score > 0 ? '+' : ''}{tr.score})</td>
                            <td className="px-2 py-1 text-right text-[var(--text)]">${fmtP(tr.entry, priceDigits)}</td>
                            <td className="px-2 py-1 text-right text-[var(--text-muted)]">${fmtP(tr.stop, priceDigits)}</td>
                            <td className="px-2 py-1 text-right text-[var(--text-muted)]">{(tr.bars * 5 / 60).toFixed(1)}h</td>
                            <td className={`px-2 py-1 text-right font-bold ${tr.result === 'win' ? 'text-emerald-400' : 'text-red-400'}`}>{tr.result === 'win' ? '+1R' : '-1R'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2 opacity-60">
                    {data.backtest.winRate !== null && data.backtest.winRate < 45
                      ? '⚠ 최근 장세에서 엔진 적중률이 낮습니다 — 신호를 보수적으로 해석하세요'
                      : '표본이 짧으므로 절대 성능이 아닌 "최근 장세 적합도"로만 참고'}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 레벨: 지지저항 + 피보나치 + 계산기 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-bold text-[var(--text)] mb-3">지지·저항 구간 <span className="text-[10px] font-normal text-[var(--text-muted)]">15m 스윙 기준</span></h3>
              <div className="space-y-1.5">
                {data.zones.map((z, i) => (
                  <div key={i} className={`flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5 border ${
                    z.kind === 'resistance' ? 'border-red-500/20 bg-red-500/5' : 'border-emerald-500/20 bg-emerald-500/5'
                  }`}>
                    <span className={z.kind === 'resistance' ? 'text-red-400' : 'text-emerald-400'}>
                      {z.kind === 'resistance' ? '저항' : '지지'}
                    </span>
                    <span className="font-bold tabular-nums text-[var(--text)]">${fmtP(z.price, priceDigits)}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">터치 {z.touches}회</span>
                  </div>
                ))}
                {!data.zones.length && <p className="text-xs text-[var(--text-muted)]">식별된 구간 없음</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-bold text-[var(--text)] mb-1">피보나치 <span className="text-[10px] font-normal text-[var(--text-muted)]">최근 15m 스윙</span></h3>
              {data.fib ? (
                <>
                  <p className="text-[10px] text-[var(--text-muted)] mb-3">
                    {data.fib.direction === 'up' ? '상승' : '하락'} 스윙 ${fmtP(data.fib.swingLow, priceDigits)} → ${fmtP(data.fib.swingHigh, priceDigits)}
                    {data.fib.nearest && <span className="ml-1 text-amber-400 font-semibold">· 현재 {data.fib.nearest} 관찰 구간</span>}
                  </p>
                  <div className="space-y-1.5 text-xs">
                    {[
                      { k: '38.2% (얕은 눌림)', v: data.fib.r382 },
                      { k: '50% (중간 조정)', v: data.fib.r50 },
                      { k: '61.8% (깊은 조정)', v: data.fib.r618 },
                      { k: '확장 127.2% (익절 후보)', v: data.fib.e1272 },
                      { k: '확장 161.8% (익절 후보)', v: data.fib.e1618 },
                    ].map((r) => (
                      <div key={r.k} className="flex justify-between">
                        <span className="text-[var(--text-muted)]">{r.k}</span>
                        <span className="font-semibold tabular-nums text-[var(--text)]">${fmtP(r.v, priceDigits)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2.5">되돌림은 진입 관찰 구간, 확장은 익절 후보 — 선 단독 신호가 아니라 캔들 반응 확인 필수.</p>
                </>
              ) : <p className="text-xs text-[var(--text-muted)]">스윙 식별 불가</p>}
            </div>

            <PositionCalc stopPct={v.stopPct} levCons={v.leverage.conservative} levAggr={v.leverage.aggressive} />
          </div>

          {/* 체크리스트 + 뉴스 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-bold text-[var(--text)] mb-3">매매 전 체크리스트</h3>
              <div className="space-y-1.5">
                {v.checklist.map((c) => (
                  <div key={c.label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className={c.pass ? 'text-emerald-400' : 'text-red-400'}>{c.pass ? '✓' : '✗'}</span>
                      <span className="text-[var(--text)]">{c.label}</span>
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] text-right">{c.note}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-3">하나라도 &ldquo;잘 모르겠다&rdquo;면 진입하지 않는 것이 원칙.</p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-bold text-[var(--text)] mb-3">최신 뉴스 <span className="text-[10px] font-normal text-[var(--text-muted)]">{data.name}</span></h3>
              {data.news.length ? (
                <div className="space-y-2.5">
                  {data.news.slice(0, 7).map((n, i) => (
                    <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" className="block group">
                      <p className="text-xs text-[var(--text)] group-hover:text-sky-400 transition-colors leading-snug">
                        {n.sentiment === 'pos' && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 mr-1 align-middle">호재</span>}
                        {n.sentiment === 'neg' && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/15 text-red-400 mr-1 align-middle">악재</span>}
                        {n.title}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{n.source}{n.pubDate ? ` · ${new Date(n.pubDate).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                    </a>
                  ))}
                </div>
              ) : <p className="text-xs text-[var(--text-muted)]">뉴스를 가져올 수 없습니다.</p>}
            </div>
          </div>

          {/* 매매일지 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[var(--text)]">매매일지 <span className="text-[10px] font-normal text-[var(--text-muted)]">복기용 · 기기에만 저장</span></h3>
              {journal.stats.closed > 0 && (
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-[var(--text-muted)]">기록 {journal.stats.total}</span>
                  <span className="text-[var(--text)]">승률 <span className="font-bold">{journal.stats.winRate?.toFixed(0)}%</span></span>
                  <span className={`font-bold ${(journal.stats.avgR ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    평균 {journal.stats.avgR! >= 0 ? '+' : ''}{journal.stats.avgR?.toFixed(2)}R
                  </span>
                </div>
              )}
            </div>
            {!journal.mounted ? null : journal.entries.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-4 text-center">아직 기록이 없습니다. 판정 카드의 &ldquo;📓 매매일지 기록&rdquo;으로 현재 분석을 저장하고, 결과를 나중에 입력해 복기하세요.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {journal.entries.map((e) => (
                  <div key={e.id} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-[var(--text)]">{e.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          e.direction === 'long' ? 'bg-emerald-500/15 text-emerald-400' : e.direction === 'short' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                        }`}>{e.direction === 'long' ? '롱' : e.direction === 'short' ? '숏' : '관망'}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{e.state} · {e.score > 0 ? '+' : ''}{e.score}</span>
                        {e.memo === '자동판정' && e.result !== 'open' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-sky-500/15 text-sky-400">자동판정</span>
                        )}
                        <span className="text-[10px] text-[var(--text-muted)]">{new Date(e.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <button onClick={() => journal.remove(e.id)} className="text-[10px] text-[var(--text-muted)] hover:text-red-400">삭제</button>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--text-muted)] tabular-nums">
                      <span>진입 ${fmtP(e.price, e.price < 10 ? 4 : e.price < 1000 ? 2 : 1)}</span>
                      <span className="text-red-400">손절 ${fmtP(e.stop, e.price < 10 ? 4 : e.price < 1000 ? 2 : 1)}</span>
                      <span className="text-emerald-400">T1 ${fmtP(e.target1, e.price < 10 ? 4 : e.price < 1000 ? 2 : 1)}</span>
                      <span>{e.leverage}배</span>
                    </div>
                    {/* 결과 입력 */}
                    <div className="flex items-center gap-1.5 mt-2">
                      {(['open', 'win', 'loss', 'even'] as const).map((r) => (
                        <button key={r} onClick={() => journal.update(e.id, { result: r, resultR: r === 'win' ? 1.5 : r === 'loss' ? -1 : 0 })}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                            e.result === r
                              ? (r === 'win' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : r === 'loss' ? 'bg-red-500/20 text-red-400 border-red-500/40' : r === 'even' ? 'bg-slate-500/20 text-[var(--text)] border-[var(--border)]' : 'bg-amber-500/15 text-amber-400 border-amber-500/40')
                              : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                          }`}>
                          {r === 'open' ? '진행중' : r === 'win' ? '익절' : r === 'loss' ? '손절' : '본전'}
                        </button>
                      ))}
                      {e.result !== 'open' && (
                        <input
                          value={e.resultR ?? ''} inputMode="decimal"
                          onChange={(ev) => journal.update(e.id, { resultR: parseFloat(ev.target.value) || 0 })}
                          className="ml-1 w-16 px-1.5 py-0.5 text-[10px] bg-transparent border border-[var(--border)] rounded text-[var(--text)] outline-none tabular-nums"
                          placeholder="실현 R" />
                      )}
                    </div>
                  </div>
                ))}
                {journal.entries.length > 0 && (
                  <button onClick={journal.clear} className="text-[10px] text-[var(--text-muted)] hover:text-red-400 mt-1">전체 삭제</button>
                )}
              </div>
            )}
          </div>

          {/* 면책 */}
          <p className="text-[10px] text-[var(--text-muted)] text-center opacity-60 leading-relaxed">
            본 분석은 교육 자료 기반의 자동 계산 참고 정보이며 투자 권유가 아닙니다. 코인 선물은 레버리지·강제청산으로 원금 초과 손실이 발생할 수 있습니다.<br />
            데이터: Bitget USDT-FUTURES · 뉴스: Google/Bing News · 손실 책임은 본인에게 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
