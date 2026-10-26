'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import AnalysisSwitch from '@/components/AnalysisSwitch';
import PrecursorCard from '@/components/PrecursorCard';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import type { ChartCandle } from '@/components/CoinCandleChart';
// Recharts가 무거워 차트만 지연 로딩 — 초기 번들에서 제외
const CoinCandleChart = dynamic(() => import('@/components/CoinCandleChart'), {
  ssr: false,
  loading: () => <div className="h-72 rounded-xl bg-white/5 animate-pulse" aria-label="차트 로딩 중" />,
});
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { SETUPS, MISTAKES } from '@/lib/tradeTags';
import { TagPickRow, ConvictionPickRow } from '@/components/TagPicker';
const WhaleLiquidationPanel = dynamic(() => import('@/components/WhaleLiquidationPanel'), { ssr: false });
import { useCoinAlerts } from '@/hooks/useCoinAlerts';
import { useCoinPriceAlerts } from '@/hooks/useCoinPriceAlerts';
import { levelsToAlerts, type LevelSpec } from '@/lib/coinPriceAlert';
import LivePriceTag from '@/components/LivePriceTag';
import Range52Bar from '@/components/Range52Bar';
import { type SourceStat } from '@/components/SourceStatus';
import { useBriefingModel } from '@/hooks/useBriefingModel';
import { notionForRisk, isolatedLiqPrice, liqSafety, tranches3 } from '@/lib/positionSizing';
import { jsonFetcher, ApiError } from '@/lib/fetcher';
import TradeGate from '@/components/TradeGate';
import CircuitBreakerBar from '@/components/CircuitBreakerBar';
import BottomSheet from '@/components/ui/BottomSheet';
import Collapsible from '@/components/ui/Collapsible';
import RotatingTicker from '@/components/ui/RotatingTicker';
import { useRiskLimits } from '@/hooks/useRiskLimits';
import { evaluateBreaker, type BreakerEntry } from '@/lib/circuitBreaker';

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

interface DirPlan { stop: number; target1: number; target2: number; stopPct: number; rr: number }
interface AnalysisData {
  symbol: string; name: string; updatedAt: number;
  price: number; change24h: number | null; high24h: number | null; low24h: number | null;
  quoteVolume: number | null; markPrice: number | null; openInterest: number | null;
  funding: { rate: number; ratePct: number; nextTs: number | null; intervalH: number };
  longShort: { latest: LSPoint | null; history: LSPoint[] };
  timeframes: { h4?: TF | null; h1: TF; m15: TF; m5: TF; m1?: TF | null };
  zones: Zone[]; fib: Fib | null;
  smc?: {
    want: 'bull' | 'bear';
    bos: { dir: 'bull' | 'bear'; level: number } | null;
    fvg: { low: number; high: number; dir: 'bull' | 'bear'; filled: boolean } | null;
    orderBlock: { low: number; high: number } | null;
    ote: { low: number; high: number } | null;
    checklist: { label: string; pass: boolean; note: string }[];
    aligned: number;
  } | null;
  exit?: {
    legs: { label: string; price: number; sizePct: number; r: number; note: string }[];
    ladder: { trigger: string; stopTo: number | null; note: string }[];
    scaledR: number; holdAllR: number; lockedAfterT1: number;
    runnerTarget: number | null; trailDistance: number;
  } | null;
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
  macro?: {
    bias: 'long' | 'short' | 'mixed';
    strength: '강' | '보통' | '약';
    dirs: { us10: 'up' | 'down' | 'flat'; dxy: 'up' | 'down' | 'flat'; realYield: 'up' | 'down' | 'flat' };
    headline: string; note: string;
    votes: { riskOff: number; riskOn: number; known: number };
    values: {
      us10: { label: string; value: string; changeText: string; source: string; asOf: string | null } | null;
      dxy: { label: string; value: string; changeText: string; source: string; asOf: string | null } | null;
      realYield: { value: number; changePp: number | null; date: string } | null;
    };
  } | null;
  backtest: {
    fromTs: number; toTs: number; spanHours: number;
    signals: number; wins: number; losses: number; open: number;
    winRate: number | null; avgR: number | null;
    longSignals: number; shortSignals: number;
    blocked?: { long: { total: number; counterTrend: number }; short: { total: number; counterTrend: number } };
    leanCounts?: { long: number; short: number; wait: number };
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
    plans: { long: DirPlan; short: DirPlan };
  };
  orderbook: {
    bidVol: number; askVol: number; imbalance: number; spreadPct: number;
    bidWall: { price: number; size: number; distPct: number } | null;
    askWall: { price: number; size: number; distPct: number } | null;
  } | null;
  modes?: { scalp: ModeSignal; swing: ModeSignal; position: ModeSignal };
  news: { title: string; link: string; source: string; pubDate: string; sentiment: 'pos' | 'neg' | 'neu' }[];
  aiBriefing: string | null; aiError: string | null; aiModel?: string;
  sources?: SourceStat[];
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

/**
 * 시간대 한 칸의 조건들을 롱 쪽/숏 쪽/중립으로 나눈다 — "어느 쪽 조건이 더 많이 갖춰졌나"의 체크리스트.
 * ⚠ 조건이 한쪽에 많다고 그 방향이 이긴다는 뜻이 아니다(이 조건 조합은 측정상 우위 없음, 49.7%).
 */
function tfBias(tf: TF): { long: string[]; short: string[]; neutral: string[]; lean: 'long' | 'short' | 'mixed' } {
  const L: string[] = [], S: string[] = [], N: string[] = [];
  if (tf.structure === '상승') L.push('구조: 고점·저점이 함께 높아짐');
  else if (tf.structure === '하락') S.push('구조: 고점·저점이 함께 낮아짐');
  else N.push('구조: 횡보(고점·저점 방향이 엇갈림)');
  if (tf.emaAlign === '정배열') L.push('EMA20이 EMA60 위(정배열)');
  else if (tf.emaAlign === '역배열') S.push('EMA20이 EMA60 아래(역배열)');
  else N.push('EMA 혼조');
  (tf.priceVsEma20 === 'above' ? L : S).push(`가격이 EMA20 ${tf.priceVsEma20 === 'above' ? '위' : '아래'}`);
  if (tf.priceVsVwap) (tf.priceVsVwap === 'above' ? L : S).push(`가격이 VWAP(당일 평균 체결가) ${tf.priceVsVwap === 'above' ? '위' : '아래'}`);
  const r = tf.rsi.toFixed(0);
  if (tf.rsi >= 70) N.push(`RSI ${r} 과열 — 롱 추격 주의`);
  else if (tf.rsi <= 30) N.push(`RSI ${r} 침체 — 숏 추격 주의`);
  else if (tf.rsi >= 55) L.push(`RSI ${r}(50 위 = 매수 힘 우세)`);
  else if (tf.rsi <= 45) S.push(`RSI ${r}(50 아래 = 매도 힘 우세)`);
  else N.push(`RSI ${r} 중립(45~55)`);
  if (tf.macd.hist > 0) L.push(tf.macd.histSlope < 0 ? 'MACD 양(+)이지만 줄어드는 중 — 상승 힘 약화' : 'MACD 양(+)·커지는 중');
  else if (tf.macd.hist < 0) S.push(tf.macd.histSlope > 0 ? 'MACD 음(−)이지만 줄어드는 중 — 하락 힘 약화' : 'MACD 음(−)·커지는 중');
  else N.push('MACD 0 부근');
  const d = L.length - S.length;
  return { long: L, short: S, neutral: N, lean: d >= 2 ? 'long' : d <= -2 ? 'short' : 'mixed' };
}
const LEAN_KO = { long: '롱 쪽 조건 우세', short: '숏 쪽 조건 우세', mixed: '엇갈림(한쪽 우세 아님)' } as const;
const LEAN_CLS = { long: 'text-emerald-400', short: 'text-red-400', mixed: 'text-amber-400' } as const;

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
  const bias = tfBias(tf);
  return (
    <div className="fin-card p-4">
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
      {/* 이 시간대에서 롱/숏 어느 쪽 조건이 더 갖춰졌나 */}
      <div className="mt-3 pt-3 border-t border-[var(--border)]">
        <p className="text-xs">
          <b className={LEAN_CLS[bias.lean]}>{LEAN_KO[bias.lean]}</b>
          <span className="text-[var(--text-muted)] tabular-nums"> · 롱 {bias.long.length} / 숏 {bias.short.length} / 중립 {bias.neutral.length}</span>
        </p>
        {bias.long.length > 0 && <p className="text-[10.5px] leading-relaxed mt-1"><span className="text-emerald-400 font-semibold">롱 쪽</span> <span className="text-[var(--text-muted)]">{bias.long.join(' · ')}</span></p>}
        {bias.short.length > 0 && <p className="text-[10.5px] leading-relaxed mt-1"><span className="text-red-400 font-semibold">숏 쪽</span> <span className="text-[var(--text-muted)]">{bias.short.join(' · ')}</span></p>}
        {bias.neutral.length > 0 && <p className="text-[10.5px] leading-relaxed mt-1"><span className="text-[var(--text)] font-semibold">중립</span> <span className="text-[var(--text-muted)]">{bias.neutral.join(' · ')}</span></p>}
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
    <div className="fin-card p-4">
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
              <p className="text-[10px] text-[var(--text-muted)] tabular-nums">{ob.bidWall.distPct.toFixed(2)}% 아래 · ${(ob.bidWall.size * ob.bidWall.price / 1e6).toFixed(1)}M</p>
            </>
          ) : <p className="text-[var(--text-muted)]">-</p>}
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5">
          <p className="text-[10px] text-[var(--text-muted)]">최대 매도벽(저항)</p>
          {ob.askWall ? (
            <>
              <p className="font-bold text-red-400 tabular-nums">${fmtP(ob.askWall.price, digits)}</p>
              <p className="text-[10px] text-[var(--text-muted)] tabular-nums">{ob.askWall.distPct.toFixed(2)}% 위 · ${(ob.askWall.size * ob.askWall.price / 1e6).toFixed(1)}M</p>
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

function RiskPanel({ entry, stop, stopPct, target1, target2, direction, levAggr, levMax, fundingRatePct, priceDigits, entryPlan, onSizing, eventHoursUntil, eventTitle, account, breaker }: {
  entry: number; stop: number; stopPct: number; target1: number; target2: number;
  direction: 'long' | 'short' | 'wait';
  levAggr: number; levMax: number; fundingRatePct: number; priceDigits: number;
  entryPlan: { type: 'now' | 'pullback' | 'wait'; zoneLow: number; zoneHigh: number };
  onSizing?: (s: RiskSizing) => void;   // 부모(매매일지)가 실제 설정값을 읽도록 보고
  // 실행 가능 판정에 쓰는 맥락 — 없으면 해당 검사는 '확인 불가'로 남는다
  eventHoursUntil?: number | null; eventTitle?: string | null;
  account?: { sameSideExposure: number; totalExposure: number } | null;
  breaker?: { blocked: boolean; reason: string } | null;
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
    <div className="fin-card p-4">
      <h3 className="text-sm font-bold text-[var(--text)] mb-1">리스크 패널 <span className="text-[10px] font-normal text-sky-400/90">이 화면의 핵심</span> <span className="text-[10px] font-normal text-[var(--text-muted)]">사이징 · 청산가 · 펀딩</span></h3>
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
            breaker: breaker ?? null,
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
type Verdict = AnalysisData['verdict'];

/** 가격대 사다리 — 현재가(비트겟) 기준 위·아래 주요 레벨을 한눈에 */
function PriceLadder({ data, v, price, digits }: { data: AnalysisData; v: Verdict; price: number; digits: number }) {
  type Row = { price: number; label: string; tone: 'res' | 'sup' | 'cur' | 'tgt' | 'stop' };
  const rows: Row[] = [];
  if (data.high24h) rows.push({ price: data.high24h, label: '24h 고점 · 강한 저항', tone: 'res' });
  if (data.low24h) rows.push({ price: data.low24h, label: '24h 저점', tone: 'sup' });
  data.zones.forEach((z) => rows.push({ price: z.price, label: `${z.kind === 'resistance' ? '저항' : '지지'} · 터치 ${z.touches}회(${z.touches >= 6 ? '강함' : z.touches >= 3 ? '보통' : '약함'})`, tone: z.kind === 'resistance' ? 'res' : 'sup' }));
  // 롱·숏 양쪽 손절선(롱 손절은 아래 지지, 숏 손절은 위 저항)
  if (v.plans) {
    rows.push({ price: v.plans.long.stop, label: '롱 손절선', tone: 'stop' });
    rows.push({ price: v.plans.short.stop, label: '숏 손절선', tone: 'stop' });
  }
  rows.push({ price, label: '현재가', tone: 'cur' });
  const res = rows.filter((r) => r.tone === 'res' && r.price > price).sort((a, b) => a.price - b.price)[0];
  if (res) res.label = '핵심 돌파선 · ' + res.label;
  rows.sort((a, b) => b.price - a.price);
  const out: Row[] = [];
  for (const r of rows) {
    const dup = out.find((o) => Math.abs(o.price - r.price) / r.price < 0.0008);
    if (dup) { if (r.tone === 'cur') { dup.label = r.label; dup.tone = 'cur'; } continue; }
    out.push({ ...r });
  }
  const BAR = { res: 'bg-red-500', sup: 'bg-emerald-500', cur: 'bg-sky-500', tgt: 'bg-emerald-400', stop: 'bg-red-400' };
  return (
    <div className="space-y-1">
      {out.map((r, i) => (
        <div key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${r.tone === 'cur' ? 'bg-sky-500/10 border border-sky-500/30' : 'bg-white/[0.02]'}`}>
          <span className={`w-1 self-stretch rounded ${BAR[r.tone]}`} aria-hidden="true" />
          <span className={`text-[13px] font-bold tabular-nums ${r.tone === 'cur' ? 'text-sky-400' : 'text-[var(--text)]'}`}>${fmtP(r.price, digits)}</span>
          <span className="text-[10.5px] text-[var(--text-muted)] ml-auto text-right">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/** 분봉별 지표 표(1·5·15·1h·4h) — 상승신뢰 판정은 tfBias(측정상 우위 아님) */
function TimeframeTable({ tfs }: { tfs: { k: string; tf: TF | null | undefined }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] tabular-nums min-w-[440px]">
        <thead><tr className="text-[var(--text-muted)] text-left">
          <th className="font-normal py-1">봉</th><th className="font-normal">추세</th><th className="font-normal">RSI</th><th className="font-normal">MACD</th><th className="font-normal">VWAP</th><th className="font-normal">거래량</th><th className="font-normal text-right">종합</th>
        </tr></thead>
        <tbody className="text-[var(--text)]">
          {tfs.map(({ k, tf }) => {
            if (!tf) return <tr key={k} className="border-t border-[var(--border)]"><td className="py-1 font-semibold">{k}</td><td colSpan={6} className="text-[var(--text-muted)]">—</td></tr>;
            const b = tfBias(tf);
            return (
              <tr key={k} className="border-t border-[var(--border)]">
                <td className="py-1 font-semibold">{k}</td>
                <td className={tf.structure === '상승' ? 'text-emerald-400' : tf.structure === '하락' ? 'text-red-400' : 'text-[var(--text-muted)]'}>{tf.structure}·{tf.emaAlign}</td>
                <td className={tf.rsi >= 70 || tf.rsi <= 30 ? 'text-amber-400' : tf.rsi >= 52 ? 'text-emerald-400' : tf.rsi <= 48 ? 'text-red-400' : 'text-[var(--text-muted)]'}>{tf.rsi.toFixed(0)}</td>
                <td className={tf.macd.hist > 0 ? 'text-emerald-400' : tf.macd.hist < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'}>{tf.macd.hist > 0 ? '＋' : tf.macd.hist < 0 ? '－' : '0'}{tf.macd.histSlope > 0 ? '↑' : tf.macd.histSlope < 0 ? '↓' : ''}</td>
                <td className={tf.priceVsVwap === 'above' ? 'text-emerald-400' : tf.priceVsVwap === 'below' ? 'text-red-400' : 'text-[var(--text-muted)]'}>{tf.priceVsVwap === 'above' ? '위' : tf.priceVsVwap === 'below' ? '아래' : '—'}</td>
                <td className={tf.volumeRatio >= 1.2 ? 'text-emerald-400' : 'text-[var(--text-muted)]'}>{tf.volumeRatio.toFixed(1)}x</td>
                <td className={`text-right font-semibold ${LEAN_CLS[b.lean]}`}>{b.lean === 'long' ? '상승신뢰' : b.lean === 'short' ? '하락신뢰' : '중립'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 🎯 진입 판단 — 흩어진 verdict/zones/timeframes를 간결한 실행 계획으로 통합. 매수 신호가 아니라 조건 충족도·리스크 계획. */
/** 익절·손절 가격선을 가격 알림으로 원클릭 등록 — PriceAlertWatcher(앱 열렸을 때 확인)가 발동. */
function AlertRegisterButton({ symbol, dir, levels }: { symbol: string; dir: 'long' | 'short'; levels: LevelSpec[] }) {
  const { alerts, addMany, removeBySymbol } = useCoinPriceAlerts();
  const valid = levels.filter((l) => l.price > 0);
  const mine = alerts.filter((a) => a.symbol === symbol);
  const register = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* 무시 */ } }
    addMany(levelsToAlerts(symbol, dir, valid, Date.now()));
  };
  if (!valid.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={register}
        className="px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 text-[12px] font-semibold text-sky-400 hover:bg-sky-500/15">🔔 가격 알림 등록 ({valid.length})</button>
      {mine.length > 0 && (
        <>
          <span className="text-[10px] text-[var(--text-muted)]">이 코인 {mine.length}개 등록됨</span>
          <button type="button" onClick={() => removeBySymbol(symbol)} className="text-[11px] text-[var(--text-muted)] underline hover:text-red-400">지우기</button>
        </>
      )}
    </div>
  );
}

function EntryDecision({ data, v, digits }: { data: AnalysisData; v: Verdict; digits: number }) {
  const [detail, setDetail] = useState(false);
  const price = data.markPrice ?? data.price;
  const h1 = data.timeframes.h1;
  const dirBadge = v.direction === 'long' ? { t: '반등·상승 우세', c: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
    : v.direction === 'short' ? { t: '하락 우세', c: 'bg-red-500/15 text-red-400 border-red-500/30' }
    : { t: '중립 · 방향 미확정', c: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
  // 단기 신호 평가 행
  type J = 'pos' | 'neg' | 'neu';
  const JC: Record<J, string> = { pos: 'text-emerald-400', neg: 'text-red-400', neu: 'text-[var(--text-muted)]' };
  const JT: Record<J, string> = { pos: '긍정', neg: '부정', neu: '중립' };
  const rsiJ: J = h1.rsi >= 70 ? 'neu' : h1.rsi >= 52 ? 'pos' : h1.rsi <= 48 ? 'neg' : 'neu';
  const volJ: J = h1.volumeRatio >= 1.2 ? 'pos' : h1.volumeRatio < 0.8 ? 'neg' : 'neu';
  const oiChg = data.oi.change1hPct;
  const signals: { k: string; val: string; j: J }[] = [
    { k: '저점 구조', val: h1.structure, j: h1.structure === '상승' ? 'pos' : h1.structure === '하락' ? 'neg' : 'neu' },
    { k: 'EMA 정렬', val: h1.emaAlign, j: h1.emaAlign === '정배열' ? 'pos' : h1.emaAlign === '역배열' ? 'neg' : 'neu' },
    { k: 'RSI(14)', val: `${h1.rsi.toFixed(0)}${h1.rsi >= 70 ? ' 과열' : h1.rsi <= 30 ? ' 침체' : ''}`, j: rsiJ },
    { k: 'MACD', val: h1.macd.hist > 0 ? `양(+)${h1.macd.histSlope > 0 ? '·확대' : '·축소'}` : h1.macd.hist < 0 ? `음(−)${h1.macd.histSlope < 0 ? '·확대' : '·축소'}` : '0 부근', j: h1.macd.hist > 0 ? 'pos' : h1.macd.hist < 0 ? 'neg' : 'neu' },
    { k: '거래량', val: `${h1.volumeRatio.toFixed(1)}배${volJ === 'neg' ? ' · 추가 매수세 확인 필요' : ''}`, j: volJ },
    { k: 'OI(미결제)', val: oiChg == null ? '—' : `${oiChg >= 0 ? '+' : ''}${oiChg.toFixed(2)}% (1h)`, j: 'neu' },
  ];
  // 시나리오
  const resAbove = [...data.zones.filter((z) => z.kind === 'resistance' && z.price > price).map((z) => z.price), ...(data.high24h && data.high24h > price ? [data.high24h] : [])].sort((a, b) => a - b);
  const supBelow = [...data.zones.filter((z) => z.kind === 'support' && z.price < price).map((z) => z.price), ...(data.low24h && data.low24h < price ? [data.low24h] : [])].sort((a, b) => b - a);
  const up1 = resAbove[0]; const up2 = v.direction !== 'wait' ? v.target1 : resAbove[1];
  const dn1 = supBelow[0]; const dn2 = v.direction !== 'wait' ? v.stop : supBelow[1];
  const pass = v.checklist.filter((c) => c.pass).length;

  // 추천 진입가 — 엔진이 산출한 진입 계획(entryPlan)이 "가장 좋은 가격대". now=지금 시장가, pullback=되돌림 대기, wait=관망
  const ep = v.entryPlan;
  const sideP = v.direction !== 'wait' ? v.plans[v.direction] : null;
  const bestEntryText = v.direction === 'wait' ? '관망 — 지금 추천 진입가 없음'
    : ep.type === 'pullback' ? `되돌림 대기 $${fmtP(ep.zoneLow, digits)} ~ $${fmtP(ep.zoneHigh, digits)}`
    : `지금 시장가 ($${fmtP(price, digits)})`;
  const gradeC = v.confidence.grade === '견고' ? 'text-emerald-400' : v.confidence.grade === '약함' ? 'text-red-400' : 'text-amber-400';
  const recDirCls = v.direction === 'long' ? 'text-emerald-400' : v.direction === 'short' ? 'text-red-400' : 'text-amber-400';
  // 예상 청산가 — 보수 레버리지(격리 근사) 기준. 리스크 패널과 동일 공식(lib/positionSizing)
  const liqLev = v.leverage.conservative;
  const liq = v.direction !== 'wait' ? isolatedLiqPrice(v.entry, liqLev, v.direction === 'short') : null;
  // 러너 추적손절 — 현재가에서 ATR×1.5 거리(방향 반영)
  const trailNow = v.direction === 'long' ? price - (data.exit?.trailDistance ?? 0) : price + (data.exit?.trailDistance ?? 0);

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-[var(--bg-card)] p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-extrabold text-[var(--text)]">🎯 진입 판단</h3>
        <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${dirBadge.c}`}>{dirBadge.t}</span>
        <DirectionBadge direction={v.direction} />
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">조건 충족도·리스크 계획 · 매수 신호 아님(엔진 백테스트 49.7%)</span>
      </div>

      {/* 추천 진입가 — 중요 가격대 종합해 가장 좋은 진입가 1개 + 엔진추천 요약(방향·진입·손절·목표·R:R) */}
      <div className={`rounded-xl border p-3.5 ${v.direction === 'long' ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : v.direction === 'short' ? 'border-red-500/40 bg-red-500/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.05]'}`}>
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="text-[11px] font-bold text-[var(--text-muted)]">🏆 추천 진입</span>
          <span className={`text-[14px] font-extrabold ${recDirCls}`}>{v.direction === 'long' ? '▲ 롱' : v.direction === 'short' ? '▼ 숏' : '⏸ 관망'}</span>
          <span className="text-[13px] font-bold text-[var(--text)]">{bestEntryText}</span>
          {v.direction !== 'wait' && <span className={`ml-auto text-[10px] font-bold ${gradeC}`}>신뢰 {v.confidence.grade} {v.confidence.pct}%</span>}
        </div>
        {sideP ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tabular-nums">
            <span className="text-[var(--text-muted)]">진입 <b className="text-[var(--text)]">${fmtP(v.entry, digits)}</b></span>
            <span className="text-[var(--text-muted)]">손절 <b className="text-red-400">${fmtP(v.stop, digits)}</b> <span className="text-[10px] text-[var(--text-muted)]">({v.direction === 'short' ? '+' : '-'}{v.stopPct.toFixed(2)}%)</span></span>
            <span className="text-[var(--text-muted)]">목표1 <b className="text-emerald-400">${fmtP(v.target1, digits)}</b></span>
            <span className="text-[var(--text-muted)]">목표2 <b className="text-emerald-400">${fmtP(v.target2, digits)}</b></span>
            <span className="text-[var(--text-muted)]">손익비 <b className={v.rr >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}>{v.rr.toFixed(2)}</b></span>
            {liq != null && <span className="text-[var(--text-muted)]">청산 <b className="text-amber-400">${fmtP(liq, digits)}</b> <span className="text-[10px]">({liqLev}배 격리 근사)</span></span>}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">{ep.note || '양쪽 모두 조건 미충족 — 방향·트리거가 생기면 진입가가 표시됩니다.'}</p>
        )}
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-snug">지지저항+15m ATR 구조 기준 · R:R 1.5 미만이면 건너뛰는 게 안전. 롱·숏 양쪽 수치·근거는 상세보기.</p>
      </div>

      {/* SMC 진입 정렬 — BOS→FVG·오더블록→OTE (이미지 방식). 조건 정렬도이지 매수 신호 아님 */}
      {data.smc && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.05] p-3">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[11px] font-bold text-violet-300">🧩 SMC 진입 정렬</span>
            <span className="text-[13px] font-extrabold text-[var(--text)]">{data.smc.aligned}/4</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${data.smc.want === 'bull' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{data.smc.want === 'bull' ? '상승 구조' : '하락 구조'}</span>
            <span className="ml-auto text-[10px] text-[var(--text-muted)]">조건 정렬도 · 매수 신호 아님</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {data.smc.checklist.map((c) => (
              <div key={c.label} className={`rounded-lg border px-2 py-1 ${c.pass ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-[var(--border)] bg-white/[0.02]'}`}>
                <p className="text-[10.5px] font-semibold text-[var(--text)] leading-tight">{c.pass ? '✓' : '·'} {c.label}</p>
                <p className="text-[9.5px] text-[var(--text-muted)] leading-tight">{c.note}</p>
              </div>
            ))}
          </div>
          {(data.smc.bos || data.smc.fvg || data.smc.ote || data.smc.orderBlock) && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-[var(--text-muted)] mt-2">
              {data.smc.bos && <span>BOS <b className="text-[var(--text)]">${fmtP(data.smc.bos.level, digits)}</b></span>}
              {data.smc.fvg && <span>FVG <b className="text-[var(--text)]">${fmtP(data.smc.fvg.low, digits)}~${fmtP(data.smc.fvg.high, digits)}</b></span>}
              {data.smc.ote && <span>OTE <b className="text-[var(--text)]">${fmtP(data.smc.ote.low, digits)}~${fmtP(data.smc.ote.high, digits)}</b></span>}
              {data.smc.orderBlock && <span>OB <b className="text-[var(--text)]">${fmtP(data.smc.orderBlock.low, digits)}~${fmtP(data.smc.orderBlock.high, digits)}</b></span>}
            </div>
          )}
          <p className="text-[9.5px] text-[var(--text-muted)] mt-1.5 leading-snug">BOS(구조 돌파)→FVG·오더블록 되돌림→OTE(0.618~0.786) 진입 프레임. 4개 모두 정렬될수록 자리는 깔끔하지만 방향 적중을 보장하지 않습니다(엔진 백테스트 49.7%).</p>
        </div>
      )}

      {/* 분할 익절 + 추적손절 플래너 — 진입 플랜을 '실행 계획'으로(되돌림 반납 방지) */}
      {data.exit && v.direction !== 'wait' && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.05] p-3">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[11px] font-bold text-sky-300">📤 분할 익절 + 추적손절</span>
            <span className="ml-auto text-[10px] text-[var(--text-muted)]">되돌림 반납 방지 · 매수 신호 아님</span>
          </div>
          {/* 분할 청산 레그 */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums min-w-[320px]">
              <thead>
                <tr className="text-[var(--text-muted)] text-left">
                  <th className="font-medium py-1">구간</th><th className="font-medium text-right">가격</th><th className="font-medium text-right px-2">비중</th><th className="font-medium text-right">R</th>
                </tr>
              </thead>
              <tbody>
                {data.exit.legs.map((l) => (
                  <tr key={l.label} className="border-t border-[var(--line-2)]">
                    <td className="py-1 text-[var(--text)]">{l.label}<span className="block text-[9px] text-[var(--text-muted)] leading-tight">{l.note}</span></td>
                    <td className="text-right font-bold text-[var(--text)]">${fmtP(l.price, digits)}</td>
                    <td className="text-right text-[var(--text-muted)] px-2">{l.sizePct}%</td>
                    <td className="text-right font-semibold text-emerald-400">+{l.r.toFixed(2)}R</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 추적손절 사다리 */}
          <div className="mt-2 pt-2 border-t border-[var(--line-2)] space-y-1">
            <p className="text-[10px] font-bold text-[var(--text-muted)]">추적손절 사다리</p>
            {data.exit.ladder.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-[10.5px] tabular-nums">
                <span className="text-[var(--text-muted)] shrink-0 w-[112px]">{s.trigger}</span>
                <span className="text-[var(--text)] min-w-0">
                  {s.stopTo != null
                    ? <>손절 → <b className="text-amber-400">${fmtP(s.stopTo, digits)}</b> </>
                    : <>손절 → <b className="text-amber-400">${fmtP(trailNow, digits)}</b> <span className="text-[9px]">(추적)</span> </>}
                  <span className="text-[var(--text-muted)]">{s.note}</span>
                </span>
              </div>
            ))}
          </div>
          {/* 되돌림 방지 요약 */}
          <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-snug">
            분할 전구간 도달 시 <b className="text-emerald-400">+{data.exit.scaledR.toFixed(2)}R</b> · 전량 2차 홀딩 <b className="text-[var(--text)]">+{data.exit.holdAllR.toFixed(2)}R</b>. 1차 익절 후 되돌림이 와도 분할은 <b className="text-emerald-400">+{data.exit.lockedAfterT1.toFixed(2)}R</b> 확정(본전 손절) — 전량 홀딩은 0R로 반납. <b className="text-[var(--text)]">큰 수익은 러너가, 반납 방지는 분할이</b> 담당합니다.
          </p>
        </div>
      )}

      {/* 익절·손절선 → 가격 알림 원클릭 등록 */}
      {v.direction !== 'wait' && (
        <AlertRegisterButton symbol={data.symbol} dir={v.direction}
          levels={[
            ...(data.exit ? data.exit.legs.map((l): LevelSpec => ({ label: l.label, price: l.price, kind: 'target' })) : [{ label: '목표1', price: v.target1, kind: 'target' as const }, { label: '목표2', price: v.target2, kind: 'target' as const }]),
            { label: '손절', price: v.stop, kind: 'stop' },
          ]} />
      )}

      {/* 시나리오 (짧게) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-1.5">
          <span className="text-[11px] font-bold text-emerald-400">↗ 상승 </span>
          <span className="text-[11px] text-[var(--text-muted)]">{up1 ? <>{`$${fmtP(up1, digits)}`} 돌파→{up2 ? `$${fmtP(up2, digits)}` : '다음 저항'}</> : '위 저항 없음'}</span>
        </div>
        <div className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-1.5">
          <span className="text-[11px] font-bold text-red-400">↘ 하락 </span>
          <span className="text-[11px] text-[var(--text-muted)]">{dn1 ? <>{`$${fmtP(dn1, digits)}`} 붕괴→{dn2 ? `$${fmtP(dn2, digits)}` : '다음 지지'}</> : '아래 지지 없음'}</span>
        </div>
      </div>

      {/* 상세보기 토글 */}
      <button type="button" onClick={() => setDetail((d) => !d)}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] py-1.5 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-hover)]">
        {detail ? '상세 접기' : '상세보기 — 단기신호·가격대·롱숏 양방향·체크리스트·분봉표·피보나치'}
        <svg className={`w-3.5 h-3.5 transition-transform ${detail ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {detail && (<div className="space-y-4 pt-1">
        {/* ① 단기 신호 평가 */}
        <div>
          <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5">① 단기 신호 평가 <span className="font-normal">(1시간봉 기준)</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {signals.map((s) => (
              <div key={s.k} className="rounded-lg bg-white/[0.02] border border-[var(--border)] px-2 py-1.5">
                <p className="text-[10px] text-[var(--text-muted)]">{s.k}</p>
                <p className="text-[12px] font-semibold text-[var(--text)] leading-tight">{s.val} <span className={`text-[10px] ${JC[s.j]}`}>{JT[s.j]}</span></p>
              </div>
            ))}
          </div>
        </div>

        {/* ② 중요한 가격대 */}
        <div>
          <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5">② 중요한 가격대 <span className="font-normal">(비트겟 현재가 ${fmtP(price, digits)} 기준)</span></p>
          <PriceLadder data={data} v={v} price={price} digits={digits} />
        </div>

        {/* ③ 롱·숏 양방향(현재가 진입 가정) */}
        <div className="rounded-xl border border-[var(--border)] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
            <p className="text-[11px] font-bold text-[var(--text-muted)]">③ 롱·숏 양쪽 <span className="font-normal">(현재가 ${fmtP(price, digits)} 진입 가정)</span></p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${v.direction === 'long' ? 'bg-emerald-500/15 text-emerald-400' : v.direction === 'short' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
              엔진 추천: {v.direction === 'long' ? '롱' : v.direction === 'short' ? '숏' : '관망(양쪽 미충족)'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['long', 'short'] as const).map((side) => {
              const p = v.plans[side]; const isRec = v.direction === side;
              return (
                <div key={side} className={`rounded-lg border p-2.5 ${side === 'long' ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-red-500/30 bg-red-500/[0.06]'} ${isRec ? 'ring-1 ring-sky-500/50' : ''}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[13px] font-extrabold ${side === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>{side === 'long' ? '▲ 롱' : '▼ 숏'}</span>
                    {isRec && <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 font-bold">엔진 추천</span>}
                  </div>
                  <div className="space-y-0.5 text-[11px] tabular-nums">
                    <p className="flex justify-between gap-1"><span className="text-[var(--text-muted)]">진입(현재가)</span><span className="text-[var(--text)] font-semibold">${fmtP(price, digits)}</span></p>
                    <p className="flex justify-between gap-1"><span className="text-[var(--text-muted)]">손절</span><span className="text-red-400 font-semibold">${fmtP(p.stop, digits)} <span className="text-[9px]">({side === 'short' ? '+' : '-'}{p.stopPct.toFixed(2)}%)</span></span></p>
                    <p className="flex justify-between gap-1"><span className="text-[var(--text-muted)]">목표1·2</span><span className="text-emerald-400 font-semibold">${fmtP(p.target1, digits)}<span className="text-[var(--text-muted)]">/</span>${fmtP(p.target2, digits)}</span></p>
                    <p className="flex justify-between gap-1"><span className="text-[var(--text-muted)]">손익비(R:R)</span><span className={`font-bold ${p.rr >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>{p.rr.toFixed(2)}</span></p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ④ 진입 체크리스트 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-bold text-[var(--text-muted)]">④ 진입 체크리스트</p>
            <span className={`text-[12px] font-bold ${pass === v.checklist.length ? 'text-sky-400' : 'text-[var(--text-muted)]'}`}>{pass}/{v.checklist.length} 충족</span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            {v.checklist.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
                <span className={c.pass ? 'text-emerald-400' : 'text-[var(--text-dim)]'}>{c.pass ? '✓' : '○'}</span>
                <span className={c.pass ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}>{c.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ⑤ 분봉별 지표 */}
        <div>
          <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5">⑤ 분봉별 지표 <span className="font-normal">(종합 판정은 조건 충족도 · 우위 아님)</span></p>
          <TimeframeTable tfs={[
            { k: '1m', tf: data.timeframes.m1 },
            { k: '5m', tf: data.timeframes.m5 },
            { k: '15m', tf: data.timeframes.m15 },
            { k: '1H', tf: data.timeframes.h1 },
            { k: '4H', tf: data.timeframes.h4 },
          ]} />
        </div>

        {/* ⑥ 피보나치 (하단에서 이동) */}
        <div>
          <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5">⑥ 피보나치 <span className="font-normal">(최근 15m 스윙)</span></p>
          {data.fib ? (
            <>
              <p className="text-[10px] text-[var(--text-muted)] mb-2">
                {data.fib.direction === 'up' ? '상승' : '하락'} 스윙 ${fmtP(data.fib.swingLow, digits)} → ${fmtP(data.fib.swingHigh, digits)}
                {data.fib.nearest && <span className="ml-1 text-amber-400 font-semibold">· 현재 {data.fib.nearest} 관찰</span>}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px] tabular-nums">
                {[
                  { k: '38.2% 얕은 눌림', v: data.fib.r382 },
                  { k: '50% 중간 조정', v: data.fib.r50 },
                  { k: '61.8% 깊은 조정', v: data.fib.r618 },
                  { k: '확장 127.2% 익절', v: data.fib.e1272 },
                  { k: '확장 161.8% 익절', v: data.fib.e1618 },
                ].map((r) => (
                  <div key={r.k} className="flex justify-between rounded-lg bg-white/[0.02] border border-[var(--border)] px-2 py-1">
                    <span className="text-[var(--text-muted)]">{r.k}</span>
                    <span className="font-semibold text-[var(--text)]">${fmtP(r.v, digits)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-1.5">되돌림은 진입 관찰 구간, 확장은 익절 후보 — 선 단독 신호 아님, 캔들 반응 확인 필수.</p>
            </>
          ) : <p className="text-xs text-[var(--text-muted)]">스윙 식별 불가</p>}
        </div>
      </div>)}
    </div>
  );
}

/** 보유 포지션 실시간 익절 가이드 — 내 진입가 기준 미실현 손익·추적손절 제안·모멘텀 소진·익절 판정.
 *  승률 신호 아님: '지금 뭘 할까(익절/홀딩/손절 규율)'를 기존 지표(RSI·MACD·OI·다이버전스·지지저항)로 안내. */
function MyPositionGuide({ data, v, digits }: { data: AnalysisData; v: Verdict; digits: number }) {
  const price = data.markPrice ?? data.price;
  const key = `kl_pos_${data.symbol}`;
  const [entryStr, setEntryStr] = useState('');
  const [stopStr, setStopStr] = useState('');
  const [dir, setDir] = useState<'long' | 'short'>(v.direction === 'short' ? 'short' : 'long');
  // 기기 저장 복원(심볼별) — 심볼 바뀌면 그 심볼 값으로
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const o = JSON.parse(raw); setEntryStr(o.entry ?? ''); setStopStr(o.stop ?? ''); if (o.dir === 'long' || o.dir === 'short') setDir(o.dir); }
      else { setEntryStr(''); setStopStr(''); }
    } catch { /* 저장소 비접근 */ }
  }, [key]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify({ entry: entryStr, stop: stopStr, dir })); } catch { /* ignore */ } }, [key, entryStr, stopStr, dir]);

  const entry = parseFloat(entryStr);
  const hasEntry = entryStr !== '' && !isNaN(entry) && entry > 0;
  const sign = dir === 'long' ? 1 : -1;
  const uPct = hasEntry ? ((price - entry) / entry) * 100 * sign : 0;
  const inProfit = uPct > 0;
  const stop = parseFloat(stopStr);
  const hasStop = stopStr !== '' && !isNaN(stop) && stop > 0;
  const rMult = hasEntry && hasStop && Math.abs(entry - stop) > 0 ? ((price - entry) * sign) / Math.abs(entry - stop) : null;

  // 모멘텀 소진 신호(보유 방향 기준) — 유지/둔화/소진
  const h1 = data.timeframes.h1, m15 = data.timeframes.m15;
  const oi = data.oi.change1hPct;
  const fades: string[] = []; const holds: string[] = [];
  if (dir === 'long') { if (h1.rsi >= 72) fades.push(`1H RSI ${h1.rsi.toFixed(0)} 과열`); else if (h1.rsi >= 50) holds.push(`1H RSI ${h1.rsi.toFixed(0)}`); }
  else { if (h1.rsi <= 28) fades.push(`1H RSI ${h1.rsi.toFixed(0)} 침체`); else if (h1.rsi <= 50) holds.push(`1H RSI ${h1.rsi.toFixed(0)}`); }
  const ms = m15.macd.histSlope, mh = m15.macd.hist;
  if (dir === 'long') { if (mh > 0 && ms > 0) holds.push('15m MACD 상승 확장'); else if (ms < 0) fades.push('15m MACD 둔화'); }
  else { if (mh < 0 && ms < 0) holds.push('15m MACD 하락 확장'); else if (ms > 0) fades.push('15m MACD 둔화'); }
  if (oi != null) { if (oi <= -0.3) fades.push(`OI ${oi.toFixed(1)}% 감소`); else if (oi >= 0.3) holds.push(`OI +${oi.toFixed(1)}% 유입`); }
  if (dir === 'long' && (data.taker.divergence === 'bearish' || data.divergence === 'bearish')) fades.push('약세 다이버전스');
  if (dir === 'short' && (data.taker.divergence === 'bullish' || data.divergence === 'bullish')) fades.push('강세 다이버전스');
  const momentum = fades.length >= 2 ? '소진' : fades.length === 1 ? '둔화' : '유지';

  // 추적손절 제안 — 현재가에서 15m ATR×1.5(수익 중이면 최소 본전 확보)
  const atr15 = m15.atr;
  let trail = dir === 'long' ? price - atr15 * 1.5 : price + atr15 * 1.5;
  if (hasEntry && inProfit) trail = dir === 'long' ? Math.max(trail, entry) : Math.min(trail, entry);
  const trailPct = Math.abs((trail - price) / price) * 100;

  // 다음 저항/지지 — 익절 후보 vs 거스르는 쪽
  const resAbove = data.zones.filter((z) => z.kind === 'resistance' && z.price > price).map((z) => z.price).sort((a, b) => a - b)[0];
  const supBelow = data.zones.filter((z) => z.kind === 'support' && z.price < price).map((z) => z.price).sort((a, b) => b - a)[0];
  const tpNext = dir === 'long' ? resAbove : supBelow;
  const tpPct = tpNext ? Math.abs((tpNext - price) / price) * 100 : null;

  let guide: { label: string; tone: 'go' | 'warn' | 'hold' | 'info'; detail: string };
  if (!hasEntry) guide = { label: '내 진입가를 입력하세요', tone: 'info', detail: '진입가(+선택 손절가)를 넣으면 미실현 손익·추적손절·익절 타이밍을 안내합니다.' };
  else if (!inProfit) guide = { label: '아직 수익 구간 아님 — 손절 규율 우선', tone: 'warn', detail: '임의 물타기 금지. 손절선을 지키고, 계획이 깨졌으면 끊으세요.' };
  else if (momentum === '소진') guide = { label: '동력 소진 — 적극 익절 / 추적손절 바짝', tone: 'go', detail: '상승 동력이 약해졌습니다. 일부 익절하고 추적손절을 바짝 당겨 반납을 막으세요.' };
  else if (momentum === '둔화') guide = { label: '동력 둔화 — 일부(30~50%) 익절 + 추적손절 당기기', tone: 'warn', detail: '추세가 식는 중. 부분 익절로 확정하고 나머지는 추적손절로 보호.' };
  else guide = { label: '동력 유지 — 추적손절로 끌고 홀딩', tone: 'hold', detail: '아직 힘이 있습니다. 추적손절을 올리며 홀딩, 저항에서 분할 익절 고려.' };
  const toneCls = { go: 'border-red-500/40 bg-red-500/[0.07]', warn: 'border-amber-500/40 bg-amber-500/[0.06]', hold: 'border-emerald-500/40 bg-emerald-500/[0.06]', info: 'border-[var(--border)] bg-white/[0.02]' }[guide.tone];
  const toneTx = { go: 'text-red-300', warn: 'text-amber-300', hold: 'text-emerald-300', info: 'text-[var(--text-muted)]' }[guide.tone];
  const inCls = 'w-full bg-white/5 border border-[var(--border)] rounded-lg px-2.5 py-2 text-sm font-semibold text-right text-[var(--text)] tabular-nums placeholder:text-[var(--text-muted)] outline-none focus:border-sky-500/50';

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">지금 들고 있는 포지션의 <b className="text-[var(--text)]">진입가</b>를 넣으면, 현재가 기준 <b className="text-[var(--text)]">미실현 손익·추적손절 제안·모멘텀 소진</b>을 보고 <b className="text-[var(--text)]">언제 익절할지</b> 안내합니다. 매수·매도 권유 아님.</p>

      {/* 입력 */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setDir('long')} className={`py-2 rounded-lg border text-[13px] font-bold ${dir === 'long' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>▲ 롱 보유</button>
        <button type="button" onClick={() => setDir('short')} className={`py-2 rounded-lg border text-[13px] font-bold ${dir === 'short' ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>▼ 숏 보유</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="block text-[11px] text-[var(--text-muted)] mb-1">내 진입가</span>
          <input type="number" inputMode="decimal" value={entryStr} onChange={(e) => setEntryStr(e.target.value)} placeholder={`현재가 ${fmtP(price, digits)}`} className={inCls} /></label>
        <label className="block"><span className="block text-[11px] text-[var(--text-muted)] mb-1">내 손절가 <span className="opacity-60">(선택)</span></span>
          <input type="number" inputMode="decimal" value={stopStr} onChange={(e) => setStopStr(e.target.value)} placeholder="R 계산용" className={inCls} /></label>
      </div>

      {/* 익절 가이드 판정 */}
      <div className={`rounded-xl border p-3.5 ${toneCls}`}>
        <p className={`text-[14px] font-extrabold ${toneTx}`}>{guide.label}</p>
        <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{guide.detail}</p>
        {hasEntry && (
          <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px]">
            <span className={`px-1.5 py-0.5 rounded font-bold ${momentum === '유지' ? 'bg-emerald-500/15 text-emerald-400' : momentum === '둔화' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>동력 {momentum}</span>
            <span className="text-[var(--text-muted)]">진입 대비 <b className={inProfit ? 'text-emerald-400' : 'text-red-400'}>{uPct >= 0 ? '+' : ''}{uPct.toFixed(2)}%</b>{rMult != null ? <> · <b className={rMult >= 0 ? 'text-emerald-400' : 'text-red-400'}>{rMult >= 0 ? '+' : ''}{rMult.toFixed(2)}R</b></> : null}</span>
          </div>
        )}
      </div>

      {hasEntry && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-lg border border-[var(--border)] bg-white/[0.02] p-3">
            <p className="text-[10px] text-[var(--text-muted)]">미실현 손익</p>
            <p className={`text-base font-bold tabular-nums ${inProfit ? 'text-emerald-400' : 'text-red-400'}`}>{uPct >= 0 ? '+' : ''}{uPct.toFixed(2)}%</p>
            <p className="text-[10px] text-[var(--text-muted)]">{rMult != null ? `${rMult >= 0 ? '+' : ''}${rMult.toFixed(2)}R (손절 기준)` : '손절가 넣으면 R 표시'}</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3">
            <p className="text-[10px] text-[var(--text-muted)]">추적손절 제안</p>
            <p className="text-base font-bold tabular-nums text-amber-400">${fmtP(trail, digits)}</p>
            <p className="text-[10px] text-[var(--text-muted)]">현재가 {dir === 'long' ? '−' : '+'}{trailPct.toFixed(2)}% · ATR×1.5{inProfit ? '·본전 이상' : ''}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-white/[0.02] p-3">
            <p className="text-[10px] text-[var(--text-muted)]">다음 {dir === 'long' ? '저항(익절 후보)' : '지지(익절 후보)'}</p>
            <p className="text-base font-bold tabular-nums text-[var(--text)]">{tpNext ? `$${fmtP(tpNext, digits)}` : '—'}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{tpPct != null ? `현재가 ${dir === 'long' ? '+' : '−'}${tpPct.toFixed(2)}% 거리` : '구간 미식별'}</p>
          </div>
        </div>
      )}

      {hasEntry && (fades.length > 0 || holds.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {fades.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">↓ {t}</span>)}
          {holds.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">↑ {t}</span>)}
        </div>
      )}
      {hasEntry && (
        <AlertRegisterButton symbol={data.symbol} dir={dir}
          levels={[
            { label: '추적손절', price: trail, kind: 'trail' },
            ...(tpNext ? [{ label: dir === 'long' ? '다음 저항(익절)' : '다음 지지(익절)', price: tpNext, kind: 'target' as const }] : []),
          ]} />
      )}
      <p className="text-[10px] text-[var(--text-muted)] leading-snug">추적손절·익절 가이드는 <b className="text-[var(--text)]">실행 규율 보조</b>입니다(방향 예측 아님, 엔진 백테스트 49.7%). 급락 시 추적손절은 원하는 가격에 체결 안 될 수 있습니다. 입력값은 이 기기에만 저장됩니다. 알림은 앱이 열려 있을 때만 확인합니다.</p>
    </div>
  );
}

/** 파생 수급 정밀(작게) — 헤더 요약 카드 오른쪽. 주문흐름·OI·포지셔닝 핵심만. */
function DerivFlowCompact({ data }: { data: AnalysisData }) {
  const tk = data.taker.ratio;
  const oi1h = data.oi.change1hPct;
  const oiUsd = data.openInterest && data.markPrice ? (data.openInterest * data.markPrice) / 1e9 : null;
  const ls = data.longShort.latest?.ratio ?? null;
  const pos = data.positionLS.latest ?? null;
  return (
    <div className="fin-card p-3">
      <h3 className="text-[12px] font-bold text-[var(--text)] mb-2">파생 수급 정밀 <span className="text-[9px] font-normal text-[var(--text-muted)]">주문흐름·OI·포지셔닝</span></h3>
      <div className="space-y-2 text-[11px]">
        <div>
          <div className="flex justify-between mb-0.5">
            <span className="text-[var(--text-muted)]">테이커 매수/매도(30분)</span>
            <span className={`font-bold tabular-nums ${tk == null ? 'text-[var(--text-muted)]' : tk >= 1.2 ? 'text-emerald-400' : tk <= 0.85 ? 'text-red-400' : 'text-[var(--text)]'}`}>{tk?.toFixed(2) ?? '-'}</span>
          </div>
          {tk != null && (
            <div className="flex h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500/70" style={{ width: `${(tk / (1 + tk)) * 100}%` }} />
              <div className="bg-red-500/70" style={{ width: `${(1 / (1 + tk)) * 100}%` }} />
            </div>
          )}
          {data.taker.divergence && <p className={`text-[9px] mt-0.5 font-semibold ${data.taker.divergence === 'bearish' ? 'text-red-400' : 'text-emerald-400'}`}>⚡ 주문흐름 {data.taker.divergence === 'bearish' ? '약세' : '강세'} 다이버전스</p>}
        </div>
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">OI 금액 <span className="text-[9px] opacity-60">Bitget</span></span><span className="font-bold tabular-nums text-[var(--text)]">{oiUsd != null ? `$${oiUsd.toFixed(2)}B` : '-'}</span></div>
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">OI 1시간 변화</span><span className={`font-bold tabular-nums ${oi1h == null ? 'text-[var(--text-muted)]' : oi1h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{oi1h != null ? `${oi1h >= 0 ? '+' : ''}${oi1h.toFixed(2)}%` : '-'}</span></div>
        <div className="flex justify-between"><span className="text-[var(--text-muted)]">계정 롱숏 vs 포지션</span><span className="font-bold tabular-nums text-[var(--text)]">{ls?.toFixed(2) ?? '-'} <span className="text-[var(--text-dim)]">vs</span> {pos?.toFixed(2) ?? '-'}</span></div>
        {ls != null && pos != null && Math.abs(ls - pos) >= 0.5 && (
          <p className="text-[9px] text-amber-400 leading-snug">{ls > pos ? '⚠ 개미 롱 쏠림·큰손 중립 — 하락 시 청산 연료' : '⚠ 개미 숏 쏠림·큰손 롱 — 상승 스퀴즈 여지'}</p>
        )}
        <p className="text-[9px] text-[var(--text-muted)] opacity-60 leading-snug">주문흐름 불균형은 단기 가격 변동의 주 요인(학술 근거) · 방향 예측 아님</p>
      </div>
    </div>
  );
}

export default function CoinAnalysisPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [chartTf, setChartTf] = useState<'m5' | 'm15' | 'h1'>('m5');
  const { model: aiModel, ready: modelReady } = useBriefingModel();
  const [modal, setModal] = useState<null | 'flow' | 'macro' | 'risk' | 'journal' | 'entry' | 'timeframes' | 'position' | 'more'>(null); // 상단 버튼 → 팝업(BottomSheet)
  // symbol·aiModel은 '선택 상태', run은 '실행된 상태'. 분석 버튼을 눌러야 run이 바뀐다.
  const [run, setRun] = useState<{ symbol: string; model: string } | null>(null);
  // 관심종목에서 '분석'으로 진입(?symbol=…&run=1)하면 해당 코인으로 자동 실행. 그 외에는 버튼으로만.
  const [autoRunSym, setAutoRunSym] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get('symbol');
    if (s && /^[A-Z0-9]+USDT$/.test(s)) {
      setSymbol(s);
      if (p.get('run') === '1') setAutoRunSym(s);
    }
  }, []);
  useEffect(() => {
    if (autoRunSym && modelReady && !run) {
      setRun({ symbol: autoRunSym, model: aiModel });
      setAutoRunSym(null);
    }
  }, [autoRunSym, modelReady, aiModel, run]);
  const { data, error, isLoading, isValidating, mutate } = useSWR<AnalysisData, ApiError>(
    run ? `/api/coin-analysis?symbol=${run.symbol}&model=${run.model}` : null,
    jsonFetcher,
    { revalidateOnFocus: false, refreshInterval: run && autoRefresh ? 60000 : 0, shouldRetryOnError: false },
  );
  const dirty = !!run && (run.symbol !== symbol || run.model !== aiModel);
  const analyze = () => { if (modelReady) setRun({ symbol, model: aiModel }); };

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

  // BTC 52주 위치(레일·보드와 일관) — /api/macro/daily의 BTC 일별 종가로 최근 365일 고/저. BTC 분석일 때만.
  const { data: macroDaily } = useSWR<{ btc?: { date: string; close: number }[] }>(
    data?.symbol === 'BTCUSDT' ? '/api/macro/daily' : null, fetcher, { revalidateOnFocus: false },
  );
  const btc52 = useMemo(() => {
    const s = macroDaily?.btc;
    if (!s?.length) return null;
    const cutoff = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const recent = s.filter((p) => p.date >= cutoff && Number.isFinite(p.close));
    if (recent.length < 2) return null;
    return { high: Math.max(...recent.map((p) => p.close)), low: Math.min(...recent.map((p) => p.close)) };
  }, [macroDaily]);

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

  // 손실 서킷브레이커 — blocked 면 실행가능 판정을 NO 로 만든다
  const { limits } = useRiskLimits();
  const breaker = useMemo(() => evaluateBreaker(journal.entries as BreakerEntry[], limits), [journal.entries, limits]);

  const saveToJournal = () => {
    if (!data || !v) return;
    const sz = sizingRef.current;
    const ts = Date.now();
    journal.add({
      ts, symbol: data.symbol, name: data.name,
      direction: v.direction, state: v.state, score: v.score, price: data.price,
      entry: v.entry, stop: v.stop, target1: v.target1, target2: v.target2,
      // 사용자가 리스크 패널에서 실제 설정한 배율 — 없으면(패널 미표시) 엔진 권장값으로 폴백
      leverage: sz ? sz.lev : v.leverage.conservative,
      seedUsdt: sz?.seed ?? null, riskPct: sz?.riskPct ?? null, notionUsdt: sz?.notion ?? null,
      reasonsTop: v.reasons.slice(0, 3),
    });
    setTagOpen(`${data.symbol}-${ts}`); // 저장 직후 복기 태그 입력 유도(주식과 통일)
  };
  const [tagOpen, setTagOpen] = useState<string | null>(null);
  const toggleTag = (id: string, kind: 'setups' | 'mistakes', key: string) => {
    const cur = journal.entries.find((e) => e.id === id);
    const list = (cur?.[kind] ?? []) as string[];
    journal.update(id, { [kind]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] });
  };
  const pickConv = (id: string, lv: number) => {
    const cur = journal.entries.find((e) => e.id === id);
    journal.update(id, { conviction: cur?.conviction === lv ? undefined : lv });
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
      <AnalysisSwitch />

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

      {/* 손실 서킷브레이커 — 진입 화면 상단에서 '오늘 멈춰야 하는지'부터 보여준다 */}
      <CircuitBreakerBar />

      {/* 실시간 청산·고래(현재 코인) — 분석 전엔 여기, 분석 후엔 상단 뉴스 옆으로 이동 */}
      {!run && <WhaleLiquidationPanel symbol={symbol} />}

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

          {/* 최신 뉴스 — 상단 3초 회전 티커(이미지1 구성) */}
          <RotatingTicker
            title={<>📰 최신 뉴스</>}
            badge={<span className="text-[10px] font-normal text-[var(--text-muted)]">{data.name}</span>}
            emptyText="뉴스를 가져올 수 없습니다."
            lines={data.news.slice(0, 12).map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" className="flex items-baseline gap-1.5 group">
                {n.sentiment === 'pos' && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 shrink-0">호재</span>}
                {n.sentiment === 'neg' && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/15 text-red-400 shrink-0">악재</span>}
                <span className="truncate text-[var(--text)] group-hover:text-sky-400">{n.title}</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)] shrink-0">{n.source}</span>
              </a>
            ))}
          >
            <div className="space-y-2.5">
              {data.news.slice(0, 10).map((n, i) => (
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
          </RotatingTicker>

          {/* 실시간 청산·온체인 고래 (현재 코인) — 상단 3초 회전 티커 */}
          <WhaleLiquidationPanel symbol={data.symbol} />

          {/* 상단: 헤더 요약 카드(좌) + 버튼·파생수급 정밀(우) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-4 items-start">
          {/* 헤더: 가격·파생 지표 */}
          <div className="fin-card p-5">
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
                <div><p className="text-[var(--text-muted)]">미결제약정(OI)<span className="text-[9px] opacity-60 ml-1">Bitget</span></p>
                  <p className="font-bold tabular-nums text-[var(--text)]">{data.openInterest && data.markPrice ? `$${(data.openInterest * data.markPrice / 1e9).toFixed(2)}B` : data.openInterest ? data.openInterest.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-'}</p></div>
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

            {/* BTC 52주 위치 — 레일·보드와 일관(일 종가 기준) */}
            {btc52 && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <Range52Bar low={btc52.low} high={btc52.high} value={liveTick?.price ?? data.price}
                  fmt={(n) => `$${Math.round(n).toLocaleString()}`} label="BTC 52주 위치 (일 종가 기준)" />
              </div>
            )}

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
          {/* 우측: 상단 버튼(팝업) + 파생 수급 정밀(작게) */}
          <div className="space-y-3">
            {/* 자주 쓰는 3개만 크게 + 나머지는 '더보기' 시트(2026-10-26 단순화 — 예전엔 버튼 8개가 한 줄에 몰려 있었다) */}
            <div className="grid grid-cols-4 gap-1.5">
              <button onClick={() => setModal('entry')}
                className="py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--border-hover)]">🎯 진입 판단</button>
              <button onClick={() => setModal('position')}
                className="py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--border-hover)]">📍 내 포지션</button>
              <button onClick={saveToJournal}
                className="py-2.5 rounded-xl border border-sky-500/40 bg-sky-500/10 text-[12px] font-bold text-sky-400 hover:bg-sky-500/15">＋ 일지 기록</button>
              <button onClick={() => setModal('more')} aria-label="분석 도구 더보기"
                className="py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[12px] font-bold text-[var(--text-muted)] hover:border-[var(--border-hover)]">⋯ 더보기</button>
            </div>
            <DerivFlowCompact data={data} />
            <PrecursorCard symbol={symbol} />
          </div>
          </div>

          {/* ⋯ 더보기 — 자주 안 쓰는 분석 도구 모음 */}
          <BottomSheet open={modal === 'more'} onClose={() => setModal(null)} title="분석 도구">
            <div className="grid grid-cols-1 gap-2">
              {([
                ['timeframes', '📈 시간대별 지표', '1시간봉·15분·5분 추세·RSI·MACD'],
                ['flow', '📊 흐름 읽기', '지금 왜 움직이나 — 수급·뉴스·청산'],
                ...(data.macro && data.macro.values && (data.macro.values.us10 || data.macro.values.dxy) ? [['macro', '🌐 거시 배경', '금리·달러 순풍/맞바람'] as const] : []),
                ['risk', '🧮 리스크 패널', '사이징·청산가·펀딩'],
                ['journal', '📓 이 기기 매매일지', '분석 화면에서 남긴 기록'],
              ] as const).map(([k, label, desc]) => (
                <button key={k} onClick={() => setModal(k)}
                  className="text-left px-3.5 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-hover)]">
                  <span className="block text-[13px] font-semibold text-[var(--text)]">{label}</span>
                  <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">{desc}</span>
                </button>
              ))}
            </div>
          </BottomSheet>

          {/* 🎯 진입 판단 — 상단 버튼 → 팝업 */}
          <BottomSheet open={modal === 'entry'} onClose={() => setModal(null)} title="진입 판단" full>
            <EntryDecision data={data} v={v} digits={priceDigits} />
          </BottomSheet>

          {/* 📍 내 포지션 — 보유 중 실시간 익절 가이드 */}
          <BottomSheet open={modal === 'position'} onClose={() => setModal(null)} title="내 포지션 — 실시간 익절 가이드" full>
            <MyPositionGuide data={data} v={v} digits={priceDigits} />
          </BottomSheet>

          {/* 시간대별 지표 — 상단 버튼 → 팝업 */}
          <BottomSheet open={modal === 'timeframes'} onClose={() => setModal(null)} title="시간대별 지표 — 1시간봉·15분·5분">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TFCard tf={{ ...data.timeframes.h1, tf: '1H' }} />
              <TFCard tf={{ ...data.timeframes.m15, tf: '15m' }} />
              <TFCard tf={{ ...data.timeframes.m5, tf: '5m' }} />
            </div>
          </BottomSheet>

          {/* 캔들 차트 (5m/15m/1H, EMA·지지저항·진입레벨 오버레이) */}
          <div className="fin-card p-5">
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

          {/* 흐름 읽기(지금 왜 움직이나) — 상단 버튼 → 팝업 */}
          <BottomSheet open={modal === 'flow'} onClose={() => setModal(null)} title="흐름 읽기 — 지금 왜 움직이나">
          <div className="fin-card p-5">
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
              {data.movement.drivers.slice(0, 3).map((d, i) => (
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
          </BottomSheet>

          {/* 거시 배경(금리·달러) — 상단 버튼 → 팝업 */}
          <BottomSheet open={modal === 'macro'} onClose={() => setModal(null)} title="거시 배경 — 금리·달러">
          {data.macro && data.macro.values && (data.macro.values.us10 || data.macro.values.dxy) && (() => {
            const m = data.macro;
            const arrow = (d: 'up' | 'down' | 'flat') => d === 'up' ? '↑' : d === 'down' ? '↓' : '→';
            // 이 페이지는 상승=emerald 관례. 단, 금리·달러 '상승'은 위험자산엔 악재라
            // 화살표는 방향만 중립색으로 표시하고, 좋고 나쁨은 아래 순풍/맞바람 배지가 전한다.
            const biasStyle = m.bias === 'long' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5'
              : m.bias === 'short' ? 'text-red-400 border-red-500/30 bg-red-500/5'
              : 'text-[var(--text-muted)] border-[var(--border)] bg-white/5';
            const biasLabel = m.bias === 'long' ? '순풍 · 롱 우호 환경' : m.bias === 'short' ? '맞바람 · 숏 우호 환경' : '엇갈림 · 방향 확인';
            const vals = [
              m.values.us10 && { k: m.values.us10.label, v: m.values.us10.value, c: m.values.us10.changeText, d: m.dirs.us10 },
              m.values.dxy && { k: m.values.dxy.label, v: m.values.dxy.value, c: m.values.dxy.changeText, d: m.dirs.dxy },
              m.values.realYield && { k: '美 10년 실질금리', v: `${m.values.realYield.value.toFixed(2)}%`, c: m.values.realYield.changePp != null ? `${m.values.realYield.changePp >= 0 ? '+' : ''}${m.values.realYield.changePp.toFixed(2)}%p` : '—', d: m.dirs.realYield },
            ].filter(Boolean) as { k: string; v: string; c: string; d: 'up' | 'down' | 'flat' }[];
            return (
              <div className="fin-card p-5">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold text-[var(--text)]">🌐 거시 배경 — 금리·달러</h3>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ml-auto ${biasStyle}`}>{biasLabel} · 강도 {m.strength}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {vals.map((x) => (
                    <div key={x.k} className="rounded-xl border border-[var(--border)] bg-white/[0.02] p-2.5">
                      <p className="text-[10px] text-[var(--text-muted)] leading-tight">{x.k}</p>
                      <p className="text-sm font-bold tabular-nums text-[var(--text)] mt-0.5">{x.v} <span className="text-[var(--text-muted)]">{arrow(x.d)}</span></p>
                      <p className="text-[10px] tabular-nums text-[var(--text-muted)]">{x.c}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--text)] leading-relaxed">{m.headline}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-relaxed">{m.note}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-2 opacity-60">10년물·실질금리·DXY가 같은 방향이면 그 방향이 위험자산에 뚜렷한 바람 — 배경 환경일 뿐 매매 신호가 아닙니다. (<a href="/study/macro" className="underline hover:text-[var(--text)]">금리·달러와 코인 공부법 ›</a>)</p>
              </div>
            );
          })()}
          </BottomSheet>

          {/* 오더북 유동성 — 추가 정보(기본 접힘) */}
          {data.orderbook && (
            <Collapsible title="오더북 유동성" sub="상위 50호가 스냅샷">
              <div className="pt-1"><OrderbookPanel ob={data.orderbook} price={data.price} digits={priceDigits} /></div>
            </Collapsible>
          )}


          {/* 리스크 패널 — 상단 버튼 → 팝업 (권장 레버리지·경고는 엔진 종합 판단에서 이 리스크 관점으로 통합) */}
          <BottomSheet open={modal === 'risk'} onClose={() => setModal(null)} title="리스크 패널 — 사이징·청산가·펀딩">
            {/* 권장 레버리지 — 리스크 관리용(방향·점수 아님) */}
            <div className="rounded-xl border border-[var(--border)] p-3 mb-3">
              <p className="text-[10px] text-[var(--text-muted)] mb-1.5">권장 레버리지 <span className="opacity-70">리스크 관리용 · 방향 예측 아님</span></p>
              <p className="text-base font-bold text-[var(--text)]">
                보수 <span className="text-sky-400">{v.leverage.conservative}배</span>
                <span className="mx-2 text-[var(--text-dim)]">·</span>
                적극 <span className="text-amber-400">{v.leverage.aggressive}배</span>
                <span className="mx-2 text-[var(--text-dim)]">·</span>
                <span className="text-sm font-semibold text-[var(--text-muted)]">청산한계 {v.leverage.max}배</span>
              </p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-relaxed">{v.leverage.note}</p>
            </div>
            {/* 경고·회피 규칙 */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3 mb-3">
              <p className="text-xs font-bold text-amber-400 mb-2">⚠ 경고·회피 규칙</p>
              {v.warnings.length ? (
                <ul className="space-y-1">
                  {v.warnings.map((w, i) => (
                    <li key={i} className="text-[11px] text-amber-400/90 flex gap-1.5"><span className="shrink-0">⚠</span>{w}</li>
                  ))}
                </ul>
              ) : <p className="text-[11px] text-[var(--text-muted)]">현재 특이 경고 없음</p>}
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
              breaker={breaker.status === 'blocked' ? { blocked: true, reason: breaker.reasons[0] ?? '서킷브레이커 작동' } : null}
            />
          </BottomSheet>

          {/* 매매일지 — 상단 버튼 → 팝업 */}
          <BottomSheet open={modal === 'journal'} onClose={() => setModal(null)} title="매매일지 — 복기용·기기에만 저장" full>
          <div className="fin-card p-4">
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
                {journal.entries.map((e) => {
                  const tagEmojis = [...(e.setups ?? []).map((k) => SETUPS.find((s) => s.key === k)?.emoji), ...(e.mistakes ?? []).map((k) => MISTAKES.find((s) => s.key === k)?.emoji)].filter(Boolean);
                  const tOpen = tagOpen === e.id;
                  return (
                  <div key={e.id} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="font-bold text-[var(--text)]">{e.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          e.direction === 'long' ? 'bg-emerald-500/15 text-emerald-400' : e.direction === 'short' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                        }`}>{e.direction === 'long' ? '롱' : e.direction === 'short' ? '숏' : '관망'}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{e.state} · {e.score > 0 ? '+' : ''}{e.score}</span>
                        {e.memo === '자동판정' && e.result !== 'open' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-sky-500/15 text-sky-400">자동판정</span>
                        )}
                        <span className="text-[10px] text-[var(--text-muted)]">{new Date(e.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        {e.conviction != null && <span className="text-[10px] text-[var(--text-muted)]">확신 {e.conviction}</span>}
                        {tagEmojis.length > 0 && <span className="text-[11px]">{tagEmojis.join('')}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setTagOpen(tOpen ? null : e.id)}
                          className={`px-1.5 py-0.5 rounded border text-[10px] ${tOpen || tagEmojis.length || e.conviction != null ? 'border-sky-500/40 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>🏷 태그</button>
                        <button
                          onClick={() => {
                            // 실거래 기록이고 되돌리기가 없으므로 확인을 받는다 (모바일 오탭 방지)
                            if (confirm(`${e.name} ${new Date(e.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기록을 삭제할까요?\n되돌릴 수 없습니다.`)) journal.remove(e.id);
                          }}
                          className="text-[10px] text-[var(--text-muted)] hover:text-red-400">삭제</button>
                      </div>
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
                    {/* 복기 태그 — 저장 직후 자동으로 열려 셋업·실수·확신을 바로 매긴다(성과 교차표에 집계) */}
                    {tOpen && (
                      <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-2">
                        <TagPickRow label="셋업" metas={SETUPS} active={e.setups ?? []} onToggle={(k) => toggleTag(e.id, 'setups', k)} tone="var(--accent)" />
                        <TagPickRow label="실수" metas={MISTAKES} active={e.mistakes ?? []} onToggle={(k) => toggleTag(e.id, 'mistakes', k)} tone="var(--amber)" />
                        <ConvictionPickRow value={e.conviction} onPick={(lv) => pickConv(e.id, lv)} />
                        <p className="text-[10px] text-[var(--faint)]">복기용 태그 — <a href="/performance" className="underline hover:text-[var(--text-muted)]">성과</a>에서 셋업×확신·실수×확신으로 집계됩니다. 방향 예측 아님.</p>
                      </div>
                    )}
                  </div>
                  );
                })}
                {journal.entries.length > 0 && (
                  <button
                    onClick={() => { if (confirm(`매매일지 ${journal.entries.length}건을 전부 삭제할까요?\n되돌릴 수 없습니다. 먼저 '가상투자·백업'에서 내보내기를 권장합니다.`)) journal.clear(); }}
                    className="text-[10px] text-[var(--text-muted)] hover:text-red-400 mt-1">전체 삭제</button>
                )}
              </div>
            )}
          </div>
          </BottomSheet>

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
