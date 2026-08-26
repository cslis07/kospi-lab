'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import type { ChartCandle } from '@/components/CoinCandleChart';
// Recharts가 무거워 차트만 지연 로딩 — 초기 번들에서 제외
const CoinCandleChart = dynamic(() => import('@/components/CoinCandleChart'), {
  ssr: false,
  loading: () => <div className="h-72 rounded-xl bg-white/5 animate-pulse" aria-label="차트 로딩 중" />,
});
import { useCoinJournal } from '@/hooks/useCoinJournal';
const WhaleLiquidationPanel = dynamic(() => import('@/components/WhaleLiquidationPanel'), { ssr: false });
import { useCoinAlerts } from '@/hooks/useCoinAlerts';
import BriefingModelPicker from '@/components/BriefingModelPicker';
import LivePriceTag from '@/components/LivePriceTag';
import { useBriefingModel } from '@/hooks/useBriefingModel';
import { notionForRisk, isolatedLiqPrice, liqSafety, tranches3 } from '@/lib/positionSizing';
import { jsonFetcher, ApiError } from '@/lib/fetcher';
import TradeGate from '@/components/TradeGate';

// 시세·스캔 등 부수 요청은 조용히 실패해도 무방하지만, 분석 본문은 jsonFetcher(throw)를 쓴다
const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ScanItem {
  symbol: string; name: string; price: number;
  score: number; direction: 'long' | 'short' | 'wait';
  entryOk: boolean; state: string; stopPct: number; levAggressive: number;
}

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
interface ModeSignal {
  direction: number; dirLabel: 'LONG' | 'SHORT' | 'WAIT';
  entryQuality: number; confidence: number; eventRisk: number;
  state: 'TRADE' | 'WATCH' | 'NO_TRADE' | 'PAUSED'; ultra: boolean; rr: number;
  entryZone: [number | null, number | null]; invalidation: number | null; tp1: number | null; tp2: number | null;
  rsi: number | null; vwap: number | null; ema20: number | null; ema50: number | null;
  support: number | null; resistance: number | null; atr: number | null; reasons: string[];
}

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
    leverage: { conservative: number; aggressive: number; max: number; note: string };
    entry: number; stop: number; stopPct: number; target1: number; target2: number; rr: number;
    reasons: string[]; warnings: string[];
    checklist: { label: string; pass: boolean; note: string }[];
    regime: { h4: 'up' | 'down' | 'flat'; d1: 'up' | 'down' | 'flat'; label: string; aligned: boolean | null } | null;
    entryQuality: { roomPct: number; rrToObstacle: number; roomOk: boolean; obstacle: number | null };
    entryPlan: { type: 'now' | 'pullback' | 'wait'; zoneLow: number; zoneHigh: number; ref: number | null; note: string };
    confidence: { grade: '견고' | '보통' | '약함'; pct: number; note: string };
  };
  orderbook: {
    bidVol: number; askVol: number; imbalance: number; spreadPct: number;
    bidWall: { price: number; size: number; distPct: number } | null;
    askWall: { price: number; size: number; distPct: number } | null;
  } | null;
  modes?: { scalp: ModeSignal; swing: ModeSignal; position: ModeSignal };
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

/* ── 3모드 진입 엔진 (coin-signal 이식) ─────────────────── */
const MODE_META: { key: 'scalp' | 'swing' | 'position'; label: string; sub: string }[] = [
  { key: 'scalp', label: '단타 SCALP', sub: '5m·15m' },
  { key: 'swing', label: '중장기 SWING', sub: '1H·4H·1D' },
  { key: 'position', label: '장기 POSITION', sub: '1D·거시' },
];
const STATE_KO: Record<string, string> = { TRADE: '체크리스트 통과', WATCH: '관망', NO_TRADE: '조건 미달', PAUSED: '정지' };
const DIR_KO: Record<string, string> = { LONG: '롱', SHORT: '숏', WAIT: '대기' };

function ModesSection({ modes, symbol }: { modes: NonNullable<AnalysisData['modes']>; symbol: string }) {
  const [mode, setMode] = useState<'scalp' | 'swing' | 'position'>('scalp');
  const m = modes[mode];
  const dg = (n: number) => (symbol === 'BTCUSDT' ? 1 : symbol === 'ETHUSDT' ? 2 : symbol === 'SOLUSDT' ? 2 : 4);
  const fp = (v: number | null) => v == null ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: dg(v), maximumFractionDigits: dg(v) });
  const dirCls = m.dirLabel === 'LONG' ? 'text-emerald-400' : m.dirLabel === 'SHORT' ? 'text-red-400' : 'text-amber-400';
  // 엣지 미검증(자체 측정 승률 41.7%)이므로 TRADE를 초록불로 표시하지 않는다 — '사도 된다'로 읽히지 않게 옛 룰엔진 배지와 같은 톤(sky)으로 통일
  const stateCls = m.state === 'TRADE' ? 'bg-sky-500/15 text-sky-400 border border-sky-500/40' : m.state === 'WATCH' ? 'bg-amber-500/25 text-amber-300' : m.state === 'PAUSED' ? 'bg-red-500/25 text-red-300' : 'bg-white/10 text-[var(--text-muted)]';
  const bar = (v: number, cls: string) => (
    <div className="h-1.5 rounded bg-white/10 overflow-hidden"><div className={`h-full rounded ${cls}`} style={{ width: `${Math.min(100, v)}%` }} /></div>
  );
  const dirBarStyle = () => { const half = Math.min(Math.abs(m.direction), 100) / 2; return m.direction >= 0 ? { left: '50%', width: `${half}%` } : { left: `${50 - half}%`, width: `${half}%` }; };
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-sm font-bold text-[var(--text)]">진입 모드 <span className="text-[10px] font-normal text-[var(--text-muted)]">단타·중장기·장기 · 방향·타이밍 분리 · 리스크 체크리스트(엣지 미검증)</span></h3>
        <div className="flex gap-1">
          {MODE_META.map((mm) => (
            <button key={mm.key} onClick={() => setMode(mm.key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex flex-col items-center leading-tight ${mode === mm.key ? 'bg-[var(--accent)]/15 text-[var(--text)] border border-[var(--accent)]/50' : 'bg-white/5 text-[var(--text-muted)] border border-transparent'}`}>
              {mm.label}<span className="text-[9px] font-normal opacity-70">{mm.sub}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className={`text-lg font-extrabold ${dirCls}`}>{m.dirLabel} {DIR_KO[m.dirLabel]}</span>
        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${stateCls}`}>{(m.state === 'NO_TRADE' ? 'NO TRADE' : m.state)} · {STATE_KO[m.state]}</span>
        {m.ultra && <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: 'linear-gradient(90deg,#4f8cff,#a04fff)' }}>ULTRA · 다수조건 충족(우위 아님)</span>}
      </div>
      <div className="grid grid-cols-[80px_1fr_34px] gap-x-2 gap-y-1.5 items-center text-[11px] text-[var(--text)] mb-3">
        <span>방향<span className="block text-[8px] text-[var(--text-muted)]">Direction</span></span>
        <div className="relative h-1.5 rounded bg-white/10"><div className={`absolute h-full rounded ${m.direction >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`} style={dirBarStyle()} /></div>
        <span className="text-right tabular-nums">{m.direction}</span>
        <span>진입적합<span className="block text-[8px] text-[var(--text-muted)]">Entry</span></span>{bar(m.entryQuality, 'bg-[var(--accent)]')}<span className="text-right tabular-nums">{m.entryQuality}</span>
        <span>신뢰도<span className="block text-[8px] text-[var(--text-muted)]">Confidence</span></span>{bar(m.confidence, 'bg-violet-400')}<span className="text-right tabular-nums">{m.confidence}</span>
        <span>이벤트위험<span className="block text-[8px] text-[var(--text-muted)]">Event Risk</span></span>{bar(m.eventRisk, 'bg-red-400')}<span className="text-right tabular-nums">{m.eventRisk}</span>
      </div>
      <table className="w-full text-[12px] mb-2">
        <tbody>
          <tr className="border-b border-dashed border-[var(--border)]"><td className="py-1 text-[var(--text-muted)]">진입구간 (Entry Zone)</td><td className="py-1 text-right tabular-nums">{fp(m.entryZone[0])} ~ {fp(m.entryZone[1])}</td></tr>
          <tr className="border-b border-dashed border-[var(--border)]"><td className="py-1 text-[var(--text-muted)]">무효화·손절 (SL)</td><td className="py-1 text-right tabular-nums">{fp(m.invalidation)}</td></tr>
          <tr className="border-b border-dashed border-[var(--border)]"><td className="py-1 text-[var(--text-muted)]">목표가 TP1 / TP2</td><td className="py-1 text-right tabular-nums">{fp(m.tp1)} / {fp(m.tp2)}</td></tr>
          <tr><td className="py-1 text-[var(--text-muted)]">손익비 (R:R)</td><td className="py-1 text-right tabular-nums">{m.rr ?? '-'}</td></tr>
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-muted)] mb-2">
        <span>RSI <b className="text-[var(--text)]">{m.rsi ?? '-'}</b></span>
        <span>VWAP <b className="text-[var(--text)]">{fp(m.vwap)}</b></span>
        <span>지지 <b className="text-[var(--text)]">{fp(m.support)}</b></span>
        <span>저항 <b className="text-[var(--text)]">{fp(m.resistance)}</b></span>
      </div>
      <ul className="text-[11px] text-[var(--text-muted)] list-disc pl-4 space-y-0.5">
        {m.reasons.map((r, i) => <li key={i}>{r}</li>)}
      </ul>
      <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
        <strong className="text-amber-400">TRADE·ULTRA는 진입 신호가 아니라 체크리스트 충족도입니다.</strong> 이 3모드 엔진도 자체 측정(45일·4코인·81신호)에서 승률 <strong className="text-[var(--text)]">41.7%</strong>로 예측 우위가 확인되지 않았습니다 — 방향은 직접 판단하고 이 화면은 손절·사이징·기록에 쓰세요.
        방향(Direction)과 진입 적합도(Entry)는 별개이며, 방향이 강해도 현재가가 추격 구간이면 Entry가 낮아져 조건 미달로 표시됩니다.
      </p>
    </section>
  );
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

/* ── 리스크 패널 (포지션 사이징 + 청산가 + 펀딩) ──────── */
const usd = (n: number, d = 1) => n.toLocaleString('en-US', { maximumFractionDigits: d });

/* ── 오더북 유동성 패널 ──────────────────────────────── */
function OrderbookPanel({ ob, price, digits }: {
  ob: NonNullable<AnalysisData['orderbook']>; price: number; digits: number;
}) {
  const imbPct = ob.imbalance * 100;
  const bidW = ob.bidVol + ob.askVol > 0 ? (ob.bidVol / (ob.bidVol + ob.askVol)) * 100 : 50;
  const strong = Math.abs(ob.imbalance) >= 0.2;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <h3 className="text-sm font-bold text-[var(--text)] mb-1">오더북 유동성 <span className="text-[10px] font-normal text-[var(--text-muted)]">상위 50호가 스냅샷</span></h3>
      <p className="text-[10px] text-[var(--text-muted)] mb-3">진입 직전 유동성 확인 — 위 매도벽은 돌파 저항, 아래 매수벽은 지지. 스냅샷 1회(실시간 스트림 아님).</p>

      {/* 매수/매도 물량 균형 바 */}
      <div className="mb-3">
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-emerald-400 font-semibold">매수 {bidW.toFixed(0)}%</span>
          <span className={`font-bold ${strong ? (imbPct > 0 ? 'text-emerald-400' : 'text-red-400') : 'text-[var(--text-muted)]'}`}>
            {imbPct >= 0 ? '+' : ''}{imbPct.toFixed(0)}% {strong ? (imbPct > 0 ? '매수 우위' : '매도 우위') : '균형'}
          </span>
          <span className="text-red-400 font-semibold">매도 {(100 - bidW).toFixed(0)}%</span>
        </div>
        <div aria-hidden="true" className="flex h-2 rounded-full overflow-hidden bg-white/5">
          <div className="bg-emerald-500/60" style={{ width: `${bidW}%` }} />
          <div className="bg-red-500/60" style={{ width: `${100 - bidW}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
          <p className="text-[10px] text-[var(--text-muted)]">최대 매수벽(지지)</p>
          {ob.bidWall ? (
            <>
              <p className="font-bold text-emerald-400 tabular-nums">${fmtP(ob.bidWall.price, digits)}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{ob.bidWall.distPct.toFixed(2)}% 아래 · {usd(ob.bidWall.size, 0)}개</p>
            </>
          ) : <p className="text-[var(--text-muted)]">-</p>}
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5">
          <p className="text-[10px] text-[var(--text-muted)]">최대 매도벽(저항)</p>
          {ob.askWall ? (
            <>
              <p className="font-bold text-red-400 tabular-nums">${fmtP(ob.askWall.price, digits)}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{ob.askWall.distPct.toFixed(2)}% 위 · {usd(ob.askWall.size, 0)}개</p>
            </>
          ) : <p className="text-[var(--text-muted)]">-</p>}
        </div>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mt-2 tabular-nums">현재가 ${fmtP(price, digits)} · 스프레드 {ob.spreadPct.toFixed(3)}%</p>
      {ob.askWall && ob.askWall.distPct <= 0.3 && (
        <p className="text-[10px] font-semibold text-amber-400 mt-1.5">⚠ 바로 위({ob.askWall.distPct.toFixed(2)}%)에 큰 매도벽 — 롱 진입 시 돌파 확인 필요</p>
      )}
      {ob.bidWall && ob.bidWall.distPct <= 0.3 && (
        <p className="text-[10px] font-semibold text-amber-400 mt-1.5">⚠ 바로 아래({ob.bidWall.distPct.toFixed(2)}%)에 큰 매수벽 — 숏 진입 시 이탈 확인 필요</p>
      )}
    </div>
  );
}

export interface RiskSizing { lev: number; seed: number; riskPct: number; notion: number; margin: number }

function RiskPanel({ entry, stop, stopPct, target1, target2, direction, levAggr, levMax, fundingRatePct, priceDigits, entryPlan, onSizing, eventHoursUntil, eventTitle, account }: {
  entry: number; stop: number; stopPct: number; target1: number; target2: number;
  direction: 'long' | 'short' | 'wait';
  levAggr: number; levMax: number; fundingRatePct: number; priceDigits: number;
  entryPlan: { type: 'now' | 'pullback' | 'wait'; zoneLow: number; zoneHigh: number };
  onSizing?: (s: RiskSizing) => void;   // 부모(매매일지)가 실제 설정값을 읽도록 보고
  // 실행 가능 판정에 쓰는 맥락 — 없으면 해당 검사는 '확인 불가'로 남는다
  eventHoursUntil?: number | null; eventTitle?: string | null;
  account?: { sameSideExposure: number; totalExposure: number } | null;
}) {
  const [seed, setSeed] = useState('1000');
  const [riskPct, setRiskPct] = useState('1');
  const [levInput, setLevInput] = useState<number | null>(null); // null = 권장(적극) 배율
  const [split, setSplit] = useState(true); // 분할 매수 표시
  const s = parseFloat(seed) || 0;
  const r = parseFloat(riskPct) || 0;
  const sliderMax = Math.max(1, Math.min(25, levMax));
  const lev = Math.max(1, Math.min(levInput ?? levAggr, sliderMax));

  const notion = notionForRisk(s, r, stopPct);
  const margin = lev > 0 ? notion / lev : 0;
  const lossAtStop = s * r / 100;
  // 현재 설정을 부모로 보고 — 부모는 ref 에 담아두었다가 매매일지에 실제값으로 기록한다
  useEffect(() => { onSizing?.({ lev, seed: s, riskPct: r, notion, margin }); }, [lev, s, r, notion, margin, onSizing]);
  // 손절폭이 아주 좁으면 노션이 급팽창해 필요 증거금이 시드를 넘는다(=실행 불가).
  // 예: 손절폭 0.12%·시드 1000·리스크 1% → 노션 8,197, 4배 증거금 2,049(시드의 205%)
  const marginOverSeed = s > 0 && margin > s;
  const levNeededForSeed = s > 0 && notion > 0 ? Math.ceil(notion / s) : 0;

  // 분할 매수 3분할 — 계산은 lib/positionSizing (테스트로 고정됨)
  const isLong = direction !== 'short';
  const tranche = tranches3(notion, lev, entry, stop, isLong, entryPlan);
  // 분할 매수는 평단이 진입가와 달라져 실제 손절 손실도 달라진다 — 표시값을 실제로 맞춘다
  const lossAtStopSplit = notion > 0 && entry > 0
    ? notion * (Math.abs(tranche.avg - stop) / tranche.avg)
    : lossAtStop;

  // 격리 청산가 근사 — 계산은 lib/positionSizing (테스트로 고정됨)
  const isShort = direction === 'short';
  const liq = isolatedLiqPrice(entry, lev, isShort);
  const liqDistPct = entry > 0 ? (Math.abs(liq - entry) / entry) * 100 : 0;
  const safety = liqSafety(entry, stopPct, lev, isShort);

  const risk1 = Math.abs(entry - stop);
  const rr1 = risk1 > 0 ? Math.abs(target1 - entry) / risk1 : 0;
  const rr2 = risk1 > 0 ? Math.abs(target2 - entry) / risk1 : 0;

  // 펀딩: 양수 레이트 = 롱이 숏에게 지불
  const funding8h = notion * (fundingRatePct / 100);
  const paysFunding = direction === 'wait' ? null : (direction === 'long' ? fundingRatePct > 0 : fundingRatePct < 0);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <h3 className="text-sm font-bold text-[var(--text)] mb-1">리스크 패널 <span className="text-[10px] font-normal text-[var(--text-muted)]">사이징 · 청산가 · 펀딩</span></h3>
      <p className="text-[10px] text-[var(--text-muted)] mb-3">노션 = 시드 × 허용손실% ÷ 손절거리({stopPct.toFixed(2)}%) — 리스크는 손절거리가 결정, 레버리지는 증거금 효율만 바꿉니다.</p>
      {direction === 'wait' && (
        <p className="text-[10px] text-amber-400 mb-2">현재 판정은 관망 — 아래 수치는 롱 기준 참고용입니다.</p>
      )}
      <div className="grid grid-cols-2 gap-2 mb-2.5">
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
      <label className="block text-xs text-[var(--text-muted)] mb-2.5">
        레버리지 <span className="font-bold text-[var(--text)]">{lev}배</span>
        {levInput === null && <span className="text-[10px]"> (권장 적극 {levAggr}배)</span>}
        <input type="range" min={1} max={sliderMax} step={1} value={lev}
          onChange={(e) => setLevInput(Number(e.target.value))}
          className="mt-1 w-full accent-sky-500" />
      </label>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">적정 포지션 노션</span><span className="font-bold text-[var(--text)] tabular-nums">{usd(notion, 0)} USDT</span></div>
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">필요 증거금 ({lev}배)</span>
          <span className={`font-semibold tabular-nums ${marginOverSeed ? 'text-red-400' : 'text-[var(--text)]'}`}>
            {usd(margin, 0)} USDT{marginOverSeed && s > 0 ? ` (시드의 ${Math.round(margin / s * 100)}%)` : ''}
          </span></div>
        {marginOverSeed && (
          <p className="rounded-lg bg-red-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-red-400">
            ⚠ 필요 증거금이 시드({usd(s, 0)} USDT)를 넘습니다 — <strong>이 배율로는 실행 불가</strong>.
            손절폭 {stopPct.toFixed(2)}%가 좁아 노션이 커진 탓입니다.
            허용손실을 {r > 0 ? (r * s / margin).toFixed(2) : '0'}% 이하로 낮추거나,
            최소 {levNeededForSeed}배 이상으로 올리거나, 손절폭이 넓어질 때까지 기다리세요.
            <strong> 배율을 올려 억지로 맞추는 것은 청산 위험을 키웁니다.</strong>
          </p>
        )}
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">예상 청산가 (격리 근사)</span><span className={`font-semibold tabular-nums ${safety < 2 ? 'text-red-400' : 'text-[var(--text)]'}`}>${fmtP(liq, priceDigits)} ({isShort ? '+' : '-'}{liqDistPct.toFixed(2)}%)</span></div>
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">청산여유 ÷ 손절거리</span><span className={`font-semibold tabular-nums ${safety < 2 ? 'text-red-400' : safety < 3 ? 'text-amber-400' : 'text-emerald-400'}`}>{safety.toFixed(1)}배</span></div>
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">손절 시 손실{split ? ' (일괄 진입 기준)' : ''}</span><span className="font-semibold text-red-400 tabular-nums">-{usd(lossAtStop)} USDT</span></div>
        {split && Math.abs(lossAtStopSplit - lossAtStop) > 0.01 && (
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">└ 3분할 평단 기준 실제</span>
            <span className="font-semibold text-red-400 tabular-nums">-{usd(lossAtStopSplit)} USDT</span>
          </div>
        )}
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">목표1 도달 시 (1:{rr1.toFixed(1)})</span><span className="font-semibold text-emerald-400 tabular-nums">+{usd(lossAtStop * rr1)} USDT</span></div>
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">목표2 도달 시 (1:{rr2.toFixed(1)})</span><span className="font-semibold text-emerald-400 tabular-nums">+{usd(lossAtStop * rr2)} USDT</span></div>
        {paysFunding !== null && Math.abs(funding8h) > 0.005 && (
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">펀딩 (8시간마다)</span>
            <span className={`font-semibold tabular-nums ${paysFunding ? 'text-red-400' : 'text-emerald-400'}`}>
              {paysFunding ? '-' : '+'}{usd(Math.abs(funding8h), 2)} USDT {paysFunding ? '지불' : '수취'}
            </span>
          </div>
        )}
      </div>
      {safety < 2 && (
        <p className="text-[10px] font-semibold text-red-400 mt-2.5">⚠ 청산선이 손절선의 {safety.toFixed(1)}배 거리 — 손절 전에 청산될 수 있습니다. 레버리지를 낮추세요.</p>
      )}

      {/* 실행 가능 판정 — 사이징을 정한 직후가 "해도 되나"를 물을 자리다 */}
      {direction !== 'wait' && notion > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <TradeGate plan={{
            direction, entry, stop, target1,
            seed: s, riskPct: r, leverage: lev, notion, margin,
            liqSafety: safety,
            eventHoursUntil: eventHoursUntil ?? null, eventTitle: eventTitle ?? null,
            account: account ?? null,
          }} />
        </div>
      )}

      {/* 분할 매수 플랜 — 얼마씩 나눠 담을지 */}
      {direction !== 'wait' && notion > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <button onClick={() => setSplit((v) => !v)} className="flex items-center justify-between w-full mb-2">
            <span className="text-xs font-bold text-[var(--text)]">분할 매수 3분할 <span className="text-[10px] font-normal text-[var(--text-muted)]">한 번에 다 담지 않기</span></span>
            <span className="text-[10px] text-sky-400">{split ? '접기 ▲' : '펼치기 ▼'}</span>
          </button>
          {split && (
            <>
              <div className="space-y-1">
                {tranche.rows.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs rounded-lg bg-white/3 px-2.5 py-1.5">
                    <span className="text-[var(--text-muted)]">{i + 1}차 <span className="text-[10px]">({(t.weight * 100).toFixed(0)}%)</span></span>
                    <span className="tabular-nums text-[var(--text)]">${fmtP(t.price, priceDigits)}</span>
                    <span className="tabular-nums text-[var(--text-muted)]">노션 {usd(t.notion, 0)}</span>
                    <span className="tabular-nums font-semibold text-[var(--text)]">증거금 {usd(t.margin, 0)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                3개 모두 체결 시 평단 <span className="font-semibold text-[var(--text)]">${fmtP(tranche.avg, priceDigits)}</span> · 손절·목표는 위와 동일.
                {entryPlan.type === 'now'
                  ? ' 1차만 지금 시장가, 2·3차는 되돌림 지정가 — 1차만 체결돼도 리스크는 그만큼 작습니다.'
                  : ' 눌림 존 안에 지정가로 나눠 걸어두면 평단이 좋아집니다. 존을 벗어나 손절 깨지면 전량 손절.'}
              </p>
            </>
          )}
        </div>
      )}

      <p className="text-[10px] text-[var(--text-muted)] mt-2">청산가는 유지증거금 0.5% 가정 근사치 — 실제는 거래소 티어·수수료에 따라 다릅니다. 주문 전 거래소 화면에서 확인하세요.</p>
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
  const { data, error, isLoading, isValidating, mutate } = useSWR<AnalysisData, ApiError>(
    run ? `/api/coin-analysis?symbol=${run.symbol}&model=${run.model}` : null,
    jsonFetcher,
    { revalidateOnFocus: false, refreshInterval: run && autoRefresh ? 60000 : 0, shouldRetryOnError: false },
  );
  const dirty = !!run && (run.symbol !== symbol || run.model !== aiModel);
  const analyze = () => { if (modelReady) setRun({ symbol, model: aiModel }); };

  // 3모드 진입 신호 — '분석'과 무관하게 선택된 코인 기준 즉시 로딩 + 45초 자동 갱신 (경량 엔드포인트)
  const { data: fastSig } = useSWR<{ symbol: string; price: number; modes: NonNullable<AnalysisData['modes']> }>(
    `/api/coin-signal?symbol=${symbol}`,
    jsonFetcher,
    { refreshInterval: 45000, revalidateOnFocus: false, keepPreviousData: true },
  );

  // 분석(무거운 스냅샷)과 별개로 시세만 5초 폴링 — Bitget 공개 티커라 저렴하다
  const { data: liveMap } = useSWR<Record<string, { price: number; changeRate: number }>>(
    run ? `/api/crypto/batch?symbols=${run.symbol}` : null,
    fetcher,
    { refreshInterval: 5000, dedupingInterval: 2500, revalidateOnFocus: false },
  );
  const liveTick = run ? liveMap?.[run.symbol] : undefined;

  // 전체 스캔 — 4코인 룰엔진 신호 일괄 (버튼으로만 실행, 서버 3분 캐시)
  const [scanOn, setScanOn] = useState(false);
  const { data: scan, isValidating: scanning } = useSWR<{ items: ScanItem[]; updatedAt: number }>(
    scanOn ? '/api/coin-scan' : null, fetcher, { revalidateOnFocus: false },
  );

  const journal = useCoinJournal();
  const coinAlerts = useCoinAlerts();

  // 포지션 감시 — 열린 매매일지 항목의 손절·목표 도달을 실시간가(5초)로 감시해 알림.
  // 항목·레벨당 1회만 발사(세션 한정). 페이지가 열려 있을 때만 동작한다.
  const watchFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const p = liveTick?.price;
    if (!p || !run) return;
    const open = journal.entries.filter((e) => e.symbol === run.symbol && e.result === 'open' && e.direction !== 'wait');
    for (const e of open) {
      const long = e.direction === 'long';
      const checks: Array<[string, boolean, string]> = [
        ['stop', long ? p <= e.stop : p >= e.stop, `⚠ 손절선 도달 (${e.stop})`],
        ['t1', long ? p >= e.target1 : p <= e.target1, `🎯 목표1 도달 (${e.target1})`],
        ['t2', long ? p >= e.target2 : p <= e.target2, `🎯 목표2 도달 (${e.target2})`],
      ];
      for (const [k, hit, msg] of checks) {
        const key = `${e.id}:${k}`;
        if (hit && !watchFiredRef.current.has(key)) {
          watchFiredRef.current.add(key);
          coinAlerts.fire(`${e.name} ${msg}`, `기록가 ${e.price} → 현재 ${p} (${e.direction === 'long' ? '롱' : '숏'})`);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTick?.price]);

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

  // 리스크 패널이 보고한 실제 설정값(배율·시드·노션). saveToJournal 이 이걸 기록한다.
  const sizingRef = useRef<RiskSizing | null>(null);

  // 실행 가능 판정의 '방향 쏠림' 검사용 계좌 맥락. 게이트 뒤라 잠겨 있으면 조용히 null
  // → 판정에서 통과가 아니라 '확인 불가'로 표시된다(모르는 걸 통과로 위장하지 않는다).
  const { data: posData } = useSWR<{ positions?: { symbol: string; side: 'long' | 'short'; size: number; markPrice: number }[] }>(
    '/api/bitget/positions', fetcher, { refreshInterval: 60000, shouldRetryOnError: false },
  );
  const accountCtx = useMemo(() => {
    const ps = posData?.positions;
    if (!ps || !v) return null;
    let same = 0, total = 0;
    for (const p of ps) {
      const n = Math.abs(p.size * p.markPrice);
      total += n;
      if (p.side === v.direction) same += n;
    }
    return { sameSideExposure: same, totalExposure: total };
  }, [posData, v]);

  const saveToJournal = () => {
    if (!data || !v) return;
    const sz = sizingRef.current;
    journal.add({
      ts: Date.now(), symbol: data.symbol, name: data.name,
      direction: v.direction, state: v.state, score: v.score, price: data.price,
      entry: v.entry, stop: v.stop, target1: v.target1, target2: v.target2,
      // 사용자가 리스크 패널에서 실제 설정한 배율 — 없으면(패널 미표시) 엔진 권장값으로 폴백
      leverage: sz ? sz.lev : v.leverage.conservative,
      seedUsdt: sz?.seed ?? null, riskPct: sz?.riskPct ?? null, notionUsdt: sz?.notion ?? null,
      reasonsTop: v.reasons.slice(0, 3),
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
      {/* 도구의 성격 — 점수를 진입 신호로 읽지 않게 화면 최상단에 고정 */}
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3.5 py-2.5">
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          🛡 <strong className="text-[var(--text)]">방향은 직접 판단하시고, 이 화면은 손절·사이징·청산가·기록에 쓰세요.</strong>{' '}
          룰 엔진 점수는 체크리스트이며 진입 신호가 아닙니다 — 자체 백테스트(45일·4코인·727건)에서
          승률 <strong className="text-[var(--text)]">49.7%</strong>로 예측 우위가 확인되지 않았습니다.
        </p>
      </div>

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
        <button onClick={() => setScanOn(true)} disabled={scanning}
          className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
          title="4개 코인의 룰 엔진 신호를 한 번에 비교 (뉴스·AI 제외 경량 스캔)">
          {scanning ? '스캔 중…' : '⚡ 전체 스캔'}
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

      {/* 전체 스캔 스트립 — 어떤 코인이 지금 신호가 강한가 */}
      {scanOn && scan?.items && scan.items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {scan.items.map((it) => {
            const dirColor = it.direction === 'long' ? 'text-emerald-400' : it.direction === 'short' ? 'text-red-400' : 'text-[var(--text-muted)]';
            const dirLabel = it.direction === 'long' ? '롱' : it.direction === 'short' ? '숏' : '관망';
            return (
              <button key={it.symbol} onClick={() => setSymbol(it.symbol)}
                className={`rounded-xl border p-2.5 text-left transition-colors hover:border-sky-500/40 ${
                  symbol === it.symbol ? 'border-sky-500/40 bg-sky-500/5' : 'border-[var(--border)] bg-[var(--bg-card)]'
                }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text)]">{it.name}</span>
                  <span className={`text-[10px] font-bold ${dirColor}`}>{dirLabel}{it.entryOk ? ' ●' : ''}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-[var(--text-muted)]">{it.state}</span>
                  <span className={`text-xs font-bold tabular-nums ${it.score > 0 ? 'text-emerald-400' : it.score < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                    {it.score > 0 ? '+' : ''}{it.score}
                  </span>
                </div>
              </button>
            );
          })}
          <p className="col-span-2 sm:col-span-4 text-[10px] text-[var(--text-muted)]">
            기술적 신호만 비교한 경량 스캔 (수급·뉴스·이벤트 제외) · ● = 체크리스트 통과(우위 아님) · 코인을 클릭해 선택 후 <strong>분석</strong>으로 정밀 판정
          </p>
        </div>
      )}

      {/* 3모드 진입 신호 + 실시간 청산·고래 — 코인 선택만으로 즉시 표시(분석 불필요) */}
      {fastSig?.modes && <ModesSection modes={fastSig.modes} symbol={fastSig.symbol} />}
      <WhaleLiquidationPanel />

      {/* 아직 실행 전 — 심화 분석(AI브리핑·백테스트·오더북·뉴스) 안내 */}
      {!run && !isValidating && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
          <p className="text-2xl mb-2">🔬</p>
          <p className="text-sm font-semibold text-[var(--text)] mb-1">
            위 진입 신호는 자동으로 뜹니다. <span className="text-sky-400">분석</span>은 <b>심화 분석</b>용입니다.
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            AI 브리핑·백테스트 성적표·오더북·뉴스·수급 정밀 지표는 캔들 수집과 AI 호출을 아끼기 위해 분석 버튼을 눌렀을 때만 실행됩니다.
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
          <span className="text-[10px] text-[var(--text-muted)]">· 페이지 열린 상태에서 동작</span>
          {journal.entries.some((e) => e.symbol === alertSymbol && e.result === 'open' && e.direction !== 'wait') && (
            <span className="text-[10px] text-sky-400">
              📡 포지션 감시 중 — 열린 기록의 손절·목표 도달 시 알림 (실시간가 5초)
            </span>
          )}
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

      {/* 요청 자체가 실패한 경우 — 이전 결과가 화면에 남아 '현재 판정'으로 오인되는 것을 막는다 */}
      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/5 p-5">
          <p className="text-sm font-semibold text-red-400">
            {error.locked ? '🔒 인증이 필요합니다' : '⚠️ 분석 요청 실패'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{error.message}</p>
          {error.locked && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              분석 라우트는 AI 호출 비용 때문에 잠겨 있습니다.{' '}
              <a href="/bitget" className="text-sky-400 underline">비트겟 페이지</a>에서 토큰으로 한 번 잠금 해제하면
              이후 이 브라우저에서는 계속 사용할 수 있습니다.
            </p>
          )}
          {data && (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              아래 결과는 <strong>{timeAgo(data.updatedAt)}</strong> 시점의 이전 분석입니다 —
              진입가·손절·목표·청산가가 모두 낡았을 수 있으니 <strong>주문 근거로 쓰지 마세요.</strong>
            </p>
          )}
          <button onClick={() => mutate()} disabled={isValidating}
            className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text)] hover:bg-white/5 disabled:opacity-50">
            {isValidating ? '재시도 중…' : '⟳ 재시도'}
          </button>
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
                <LivePriceTag
                  live={liveTick?.price ?? null}
                  analyzed={data.price}
                  format={(n) => `$${fmtP(n, priceDigits)}`}
                  staleThresholdPct={0.5}
                />
                {(liveTick?.changeRate ?? data.change24h) !== null && (
                  <p className={`text-sm font-semibold mt-0.5 ${(liveTick?.changeRate ?? data.change24h!) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(liveTick?.changeRate ?? data.change24h!) >= 0 ? '▲ +' : '▼ '}{(liveTick?.changeRate ?? data.change24h!).toFixed(2)}% (24h)
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
              {v.regime && (() => {
                const arrow = (t: string) => t === 'up' ? '▲' : t === 'down' ? '▼' : '—';
                const style = v.regime.aligned === true ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : v.regime.aligned === false ? 'bg-red-500/10 text-red-400 border-red-500/30'
                  : 'bg-white/5 text-[var(--text-muted)] border-[var(--border)]';
                return (
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${style}`}
                    title="상위 타임프레임 추세. 결 방향이면 초록, 역행이면 빨강.">
                    상위추세 {arrow(v.regime.d1)}1D {arrow(v.regime.h4)}4H{v.regime.aligned === false ? ' · 역행' : v.regime.aligned === true ? ' · 정렬' : ''}
                  </span>
                );
              })()}
              {/* 엣지 미검증(대규모 백테스트 승률 49.7%)이므로 초록불이 '사도 된다'로 읽히지 않게 한다.
                  체크리스트 통과라는 사실만 말하고, 우위를 뜻하지 않음을 배지 자체에 붙인다. */}
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                v.entryOk ? 'bg-sky-500/10 text-sky-400 border-sky-500/30' : 'bg-slate-500/10 text-[var(--text-muted)] border-[var(--border)]'
              }`} title="체크리스트를 모두 통과했다는 뜻입니다. 이 엔진은 대규모 백테스트에서 승률 49.7%로 엣지가 확인되지 않았으므로, 통과가 곧 우위를 뜻하지 않습니다.">
                {v.entryOk ? '체크리스트 통과 (우위 아님)' : '진입 대기'}
              </span>
              <button onClick={saveToJournal}
                className="ml-auto px-2.5 py-1 rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition-colors">
                📓 매매일지 기록
              </button>
            </div>

            {/* 진입 플랜 요약 — 얼마에 들어가고 어디서 손절 */}
            {v.direction !== 'wait' && (
              <div className={`rounded-xl border p-3.5 mb-4 ${
                v.entryPlan.type === 'now' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
              }`}>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {v.entryPlan.type === 'now' ? '① 진입 (지금 시장가)' : '① 진입 (눌림 대기)'}
                    </p>
                    <p className="text-lg font-bold tabular-nums text-[var(--text)]">
                      {v.entryPlan.zoneLow === v.entryPlan.zoneHigh || Math.abs(v.entryPlan.zoneHigh - v.entryPlan.zoneLow) / v.entryPlan.zoneHigh < 0.0005
                        ? `$${fmtP(v.entryPlan.zoneHigh, priceDigits)}`
                        : `$${fmtP(v.entryPlan.zoneLow, priceDigits)} ~ $${fmtP(v.entryPlan.zoneHigh, priceDigits)}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)]">② 손절 (여기 깨지면 판단 오류)</p>
                    <p className="text-lg font-bold tabular-nums text-red-400">
                      {/* 숏은 손절이 진입가 위에 있으므로 +부호. 하드코딩 - 는 방향 오독을 유발했다(감사 M-2) */}
                      ${fmtP(v.stop, priceDigits)} <span className="text-xs">({v.direction === 'short' ? '+' : '-'}{v.stopPct.toFixed(2)}%)</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)]">③ 익절 (1차 · 2차)</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-400">
                      ${fmtP(v.target1, priceDigits)} <span className="text-xs text-[var(--text-muted)]">/</span> ${fmtP(v.target2, priceDigits)}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text)] mt-2.5 leading-relaxed">
                  {v.entryPlan.type === 'now' ? '✅ ' : '⏳ '}{v.entryPlan.note}
                </p>

                {/* 신호 안정성 — 이 방향을 얼마나 믿어도 되나 */}
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-[var(--text-muted)]">신호 안정성</span>
                    <span className={`text-xs font-bold ${
                      v.confidence.grade === '견고' ? 'text-emerald-400' : v.confidence.grade === '약함' ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {v.confidence.grade === '견고' ? '🟢 견고' : v.confidence.grade === '약함' ? '🔴 약함' : '🟡 보통'} · {v.confidence.pct}%
                    </span>
                  </div>
                  <div aria-hidden="true" className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${
                      v.confidence.grade === '견고' ? 'bg-emerald-500' : v.confidence.grade === '약함' ? 'bg-red-500' : 'bg-amber-500'
                    }`} style={{ width: `${v.confidence.pct}%` }} />
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-relaxed">{v.confidence.note}</p>
                </div>
              </div>
            )}

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
                    <span className="mx-2 text-[var(--text-dim)]">·</span>
                    <span className="text-sm font-semibold text-[var(--text-muted)]">청산한계 {v.leverage.max}배</span>
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
                <div className="rounded-xl border border-dashed border-[var(--border)] p-4">
                  {/* 관망이어도 기울기 표시 — 어느 쪽으로 얼마나 */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[var(--text)]">현재 관망 — 방향 미확정</span>
                    <span className={`text-sm font-bold tabular-nums ${v.score > 0 ? 'text-emerald-400' : v.score < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                      {v.score > 0 ? '롱 쪽 +' : v.score < 0 ? '숏 쪽 ' : '중립 '}{v.score}
                    </span>
                  </div>
                  {/* 기울기 바 (문턱 ±20 표시) */}
                  <div aria-hidden="true" className="relative h-2 rounded-full bg-white/5 overflow-hidden mb-1">
                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
                    <div className={`absolute top-0 bottom-0 ${v.score >= 0 ? 'left-1/2 bg-emerald-500/60' : 'right-1/2 bg-red-500/60'}`}
                      style={{ width: `${Math.min(50, Math.abs(v.score) / 100 * 50)}%` }} />
                    {/* 진입 문턱 ±20 눈금 */}
                    <div className="absolute top-0 bottom-0 bg-amber-400/40 w-px" style={{ left: `${50 + 20 / 100 * 50}%` }} />
                    <div className="absolute top-0 bottom-0 bg-amber-400/40 w-px" style={{ left: `${50 - 20 / 100 * 50}%` }} />
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed mt-2">{v.entryPlan.note}</p>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed mt-1 opacity-70">노란 눈금 = 진입 문턱 ±20. 여기를 넘으면 롱/숏 신호로 전환됩니다.</p>
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

          {/* 오더북 유동성 */}
          {data.orderbook && <OrderbookPanel ob={data.orderbook} price={data.price} digits={priceDigits} />}

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
              <h3 className="text-sm font-bold text-[var(--text)] mb-1 flex items-center gap-2 flex-wrap">
                룰 엔진 성적표 <span className="text-[10px] font-normal text-[var(--text-muted)]">최근 {Math.round(data.backtest.spanHours)}시간 자동 백테스트</span>
                {(() => {
                  const h = data.backtest.spanHours; const n = data.backtest.signals;
                  const low = h < 48 || n < 8;
                  const mid = !low && (h < 96 || n < 15);
                  return (
                    <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold ${
                      low ? 'bg-red-500/10 text-red-400 border-red-500/30' : mid ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    }`}>신뢰도 {low ? '낮음' : mid ? '보통' : '양호'}</span>
                  );
                })()}
              </h3>
              <p className="text-[10px] text-[var(--text-muted)] mb-2">
                과거 캔들에서 진입 신호 발생 시 1R 익절 vs 손절 판정. ⚠ 수수료·슬리피지 미반영.
              </p>

              {/* 대규모 표본 측정 결과 — 이 화면의 짧은 표본이 잘 나와도 그게 엣지의 근거가 아니다 */}
              <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-2.5">
                <p className="text-[11px] font-bold text-amber-400 mb-1">⚠ 이 엔진은 엣지가 검증되지 않았습니다</p>
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                  별도 대규모 백테스트(2026-08-07 · 45일 · 4코인 · 727건)에서 <strong className="text-[var(--text)]">승률 49.7%</strong>,
                  파생 수급 신호를 포함해도 <strong className="text-[var(--text)]">48.4%</strong>(28일·407건)로
                  <strong className="text-[var(--text)]"> 동전 던지기와 구분되지 않았습니다</strong>.
                  1R 손절·1R 익절의 손익분기가 50%이고, 왕복 수수료 0.12%가 손절폭 0.2% 기준
                  <strong className="text-[var(--text)]"> 1R의 60%</strong>를 먹으므로 실제로는 마이너스입니다.
                  <br />
                  아래 성적표는 <strong className="text-[var(--text)]">최근 장세 적합도</strong>일 뿐,
                  좋게 나와도 표본이 짧아(수십 건) 우연과 구분되지 않습니다 —
                  <strong className="text-[var(--text)]"> 진입 근거로 쓰지 마세요.</strong>
                  이 도구는 손절·사이징·기록 등 <strong className="text-[var(--text)]">리스크 관리</strong>에 쓰는 것이 안전합니다.
                </p>
              </div>
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

            <RiskPanel
              entry={v.entry} stop={v.stop} stopPct={v.stopPct}
              target1={v.target1} target2={v.target2} direction={v.direction}
              levAggr={v.leverage.aggressive} levMax={v.leverage.max}
              fundingRatePct={data.funding.ratePct} priceDigits={priceDigits}
              entryPlan={v.entryPlan}
              onSizing={(sz) => { sizingRef.current = sz; }}
              eventHoursUntil={data.event?.hoursUntil ?? null}
              eventTitle={data.event?.title ?? null}
              account={accountCtx}
            />
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
                  {journal.stats.totalUsdt !== null && (
                    <span className={`font-bold ${journal.stats.totalUsdt >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      title={`실현손익 입력된 ${journal.stats.usdtCount}건 합계 — 엔진 승률과 내 실제 성적 비교용`}>
                      실현 {journal.stats.totalUsdt >= 0 ? '+' : ''}{journal.stats.totalUsdt.toFixed(1)} USDT
                    </span>
                  )}
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
                      <button
                        onClick={() => {
                          // 실거래 기록이고 되돌리기가 없으므로 확인을 받는다 (모바일 오탭 방지)
                          if (confirm(`${e.name} ${new Date(e.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기록을 삭제할까요?\n되돌릴 수 없습니다.`)) journal.remove(e.id);
                        }}
                        className="text-[10px] text-[var(--text-muted)] hover:text-red-400">삭제</button>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--text-muted)] tabular-nums">
                      <span>진입 ${fmtP(e.price, e.price < 10 ? 4 : e.price < 1000 ? 2 : 1)}</span>
                      <span className="text-red-400">손절 ${fmtP(e.stop, e.price < 10 ? 4 : e.price < 1000 ? 2 : 1)}</span>
                      <span className="text-emerald-400">T1 ${fmtP(e.target1, e.price < 10 ? 4 : e.price < 1000 ? 2 : 1)}</span>
                      <span>{e.leverage}배</span>
                      {e.notionUsdt != null && <span>노션 {Math.round(e.notionUsdt).toLocaleString()} USDT</span>}
                      {e.seedUsdt != null && e.riskPct != null && <span>시드 {Math.round(e.seedUsdt).toLocaleString()}·리스크 {e.riskPct}%</span>}
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
                        <>
                          <input
                            value={e.resultR ?? ''} inputMode="decimal" aria-label="실현 R"
                            onChange={(ev) => journal.update(e.id, { resultR: parseFloat(ev.target.value) || 0 })}
                            className="ml-1 w-16 px-1.5 py-0.5 text-[10px] bg-transparent border border-[var(--border)] rounded text-[var(--text)] outline-none tabular-nums"
                            placeholder="실현 R" />
                          <input
                            value={e.realizedUsdt ?? ''} inputMode="decimal" aria-label="실현손익 USDT"
                            onChange={(ev) => {
                              const v = ev.target.value.trim();
                              journal.update(e.id, { realizedUsdt: v === '' ? null : (parseFloat(v) || 0) });
                            }}
                            className="w-20 px-1.5 py-0.5 text-[10px] bg-transparent border border-[var(--border)] rounded text-[var(--text)] outline-none tabular-nums"
                            placeholder="±USDT" />
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {journal.entries.length > 0 && (
                  <button
                    onClick={() => { if (confirm(`매매일지 ${journal.entries.length}건을 전부 삭제할까요?\n되돌릴 수 없습니다. 먼저 '가상투자·백업'에서 내보내기를 권장합니다.`)) journal.clear(); }}
                    className="text-[10px] text-[var(--text-muted)] hover:text-red-400 mt-1">전체 삭제</button>
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
