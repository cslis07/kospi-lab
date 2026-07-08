'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';

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
interface AnalysisData {
  symbol: string; name: string; updatedAt: number;
  price: number; change24h: number | null; high24h: number | null; low24h: number | null;
  quoteVolume: number | null; markPrice: number | null; openInterest: number | null;
  funding: { rate: number; ratePct: number; nextTs: number | null; intervalH: number };
  timeframes: { h1: TF; m15: TF; m5: TF };
  zones: Zone[]; fib: Fib | null;
  verdict: {
    state: string; score: number; direction: 'long' | 'short' | 'wait';
    entryOk: boolean; entryNote: string;
    leverage: { conservative: number; aggressive: number; note: string };
    entry: number; stop: number; stopPct: number; target1: number; target2: number; rr: number;
    reasons: string[]; warnings: string[];
    checklist: { label: string; pass: boolean; note: string }[];
  };
  news: { title: string; link: string; source: string; pubDate: string }[];
  aiBriefing: string | null; aiError: string | null;
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
  const { data, isLoading, isValidating, mutate } = useSWR<AnalysisData>(
    `/api/coin-analysis?symbol=${symbol}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 0 },
  );

  const v = data?.verdict;
  const nextFundingMin = useMemo(() => {
    if (!data?.funding?.nextTs) return null;
    return Math.max(0, Math.round((data.funding.nextTs - Date.now()) / 60000));
  }, [data]);

  const priceDigits = data && data.price < 10 ? 4 : data && data.price < 1000 ? 2 : 1;

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
        <div className="ml-auto flex items-center gap-2">
          {data && !data.error && (
            <span className="text-[10px] text-[var(--text-muted)]">{timeAgo(data.updatedAt)} 분석</span>
          )}
          <button onClick={() => mutate()} disabled={isValidating}
            className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs text-[var(--text)] hover:border-[var(--border-hover)] disabled:opacity-50 transition-colors">
            {isValidating ? '분석 중…' : '⟳ 재분석'}
          </button>
        </div>
      </div>

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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs pt-1">
                <div><p className="text-[var(--text-muted)]">펀딩비</p>
                  <p className={`font-bold tabular-nums ${Math.abs(data.funding.ratePct) >= 0.05 ? 'text-amber-400' : 'text-[var(--text)]'}`}>
                    {data.funding.ratePct >= 0 ? '+' : ''}{data.funding.ratePct.toFixed(4)}%
                  </p></div>
                <div><p className="text-[var(--text-muted)]">다음 펀딩</p>
                  <p className={`font-bold tabular-nums ${nextFundingMin !== null && nextFundingMin <= 10 ? 'text-red-400' : 'text-[var(--text)]'}`}>
                    {nextFundingMin !== null ? `${Math.floor(nextFundingMin / 60)}시간 ${nextFundingMin % 60}분` : '-'}
                  </p></div>
                <div><p className="text-[var(--text-muted)]">미결제약정(OI)</p>
                  <p className="font-bold tabular-nums text-[var(--text)]">{data.openInterest ? data.openInterest.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-'}</p></div>
                <div><p className="text-[var(--text-muted)]">24h 거래대금</p>
                  <p className="font-bold tabular-nums text-[var(--text)]">{data.quoteVolume ? `$${(data.quoteVolume / 1e9).toFixed(2)}B` : '-'}</p></div>
              </div>
            </div>
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

          {/* AI 브리핑 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h3 className="text-sm font-bold text-[var(--text)] mb-2">🤖 AI 종합 브리핑 <span className="text-[10px] font-normal text-[var(--text-muted)]">차트 + 뉴스 동향</span></h3>
            {data.aiBriefing ? (
              <p className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-line">{data.aiBriefing}</p>
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
                      <p className="text-xs text-[var(--text)] group-hover:text-sky-400 transition-colors leading-snug">{n.title}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{n.source}{n.pubDate ? ` · ${new Date(n.pubDate).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                    </a>
                  ))}
                </div>
              ) : <p className="text-xs text-[var(--text-muted)]">뉴스를 가져올 수 없습니다.</p>}
            </div>
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
