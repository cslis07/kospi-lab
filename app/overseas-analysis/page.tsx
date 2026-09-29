'use client';

/**
 * 해외 종목 분석 (심화) — 국내 /stock-analysis 의 해외판.
 * ⚠ 해외 전용 예측 엔진(수급·공시·한국 거시)이 없으므로 '신호'가 아니라 가진 공개 데이터의
 * '지표 요약'만 정직하게 보여준다: 가격 차트 · 52주 위치 · 밸류에이션(PER/PEG) · 재무 체력(버핏 7기준).
 * 매수/매도 추천이 아니다. 색은 한국 관행(상승·양호=빨강 / 하락·주의=파랑).
 */
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import PriceChart, { TIMEFRAMES } from '@/components/detail/PriceChart';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import type { OverseasStockData, ChartPoint } from '@/lib/types';

const UP = '#f04452';
const DOWN = '#3182f6';
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const yFmt = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(v >= 100 ? 0 : 2)}`);
function fmtCap(n?: number | null) {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}
function fmtFcf(n: number | null) {
  if (n == null) return '—';
  const s = n >= 0 ? '+' : '−'; const a = Math.abs(n);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(0)}M`;
  return `${s}$${a.toFixed(0)}`;
}
const pct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const per = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}x`);

interface BDetails { roe: boolean | null; margin: boolean | null; fcf: boolean | null; debt: boolean | null; growth: boolean | null; per: boolean | null; profit: boolean | null }
interface ScreenerResult {
  ticker: string; name: string; sector: string | null;
  per: number | null; peg: number | null; fwdPE: number | null;
  roe: number | null; opMargin: number | null; fcf: number | null; debtRatio: number | null; revenueGrowth: number | null; netInc: number | null;
  buffettScore: number; buffettDetails: BDetails;
}
const CRIT: { key: keyof BDetails; label: string }[] = [
  { key: 'roe', label: 'ROE ≥ 15%' }, { key: 'margin', label: '영업이익률 ≥ 15%' }, { key: 'fcf', label: 'FCF 플러스' },
  { key: 'debt', label: '부채비율 < 100%' }, { key: 'growth', label: '매출성장 > 0' }, { key: 'per', label: 'PER 0~35' }, { key: 'profit', label: '순이익 흑자' },
];

function passColor(p: boolean | null) { return p === true ? 'text-[#f04452]' : p === false ? 'text-[#3182f6]' : 'text-[var(--faint)]'; }

function Metric({ label, value, pass }: { label: string; value: string; pass?: boolean | null }) {
  return (
    <div>
      <p className="text-[var(--text-muted)] text-[11px] mb-0.5">{label}</p>
      <p className={`font-bold tabular-nums ${pass == null ? 'text-[var(--text)]' : passColor(pass)}`}>{value}</p>
    </div>
  );
}

function Inner() {
  const sp = useSearchParams();
  const symbol = (sp.get('symbol') ?? '').toUpperCase();
  const [tfIdx, setTfIdx] = useState(0);
  const wl = useOverseasWatchlist();

  const { data: batch, error } = useSWR<Record<string, OverseasStockData>>(
    symbol ? `/api/overseas/batch?symbols=${encodeURIComponent(symbol)}` : null, fetcher, { refreshInterval: 15000 });
  const { data: chart } = useSWR<ChartPoint[]>(
    symbol ? `/api/overseas/chart?symbol=${encodeURIComponent(symbol)}&months=${TIMEFRAMES[tfIdx].months}` : null, fetcher, { refreshInterval: 300000 });
  const { data: scr } = useSWR<ScreenerResult[] | { error: string }>(
    symbol ? `/api/screener?tickers=${encodeURIComponent(symbol)}&market=US` : null, fetcher, { revalidateOnFocus: false });
  const { data: market } = useSWR<{ usdkrw?: { value: number } | null }>('/api/market', fetcher, { refreshInterval: 60000, revalidateOnFocus: false });
  const usdRate = market?.usdkrw?.value;

  if (!symbol) {
    return <p className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-[var(--text-muted)]">종목이 지정되지 않았습니다. 시장 › 해외 목록에서 종목 옆 ‘분석’을 눌러 주세요.</p>;
  }

  const d = batch?.[symbol];
  const f = Array.isArray(scr) ? scr[0] : undefined;
  const scrFailed = scr && !Array.isArray(scr);
  const isUp = (d?.change ?? 0) >= 0;
  const name = d?.name ?? wl.watchlist.find((w) => w.symbol === symbol)?.name ?? symbol;
  const pos = d?.high52w && d?.low52w && d.high52w > d.low52w ? (d.price - d.low52w) / (d.high52w - d.low52w) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* 정직성 배너 */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 mb-4">
        <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
          <strong className="text-[var(--text)]">지표 요약</strong>입니다 — 매수·매도 신호나 방향 예측이 아닙니다. 해외는 국내(수급·공시·거시)만큼 깊은 분석 소스가 없어
          공개 데이터(가격·재무)의 요약까지만 제공합니다. <Link href={`/screener?tickers=${encodeURIComponent(symbol)}&market=US&run=1`} className="text-sky-400 hover:underline">간단 비교</Link> · <Link href={`/overseas/${encodeURIComponent(symbol)}`} className="text-sky-400 hover:underline">상세</Link>
        </p>
      </div>

      {/* 헤더 */}
      <div className="fin-card p-5 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-[20px] font-extrabold tracking-tight text-[var(--text)]">{name}</h1>
          <span className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-[var(--accent-soft)] text-[var(--accent)]">{symbol}</span>
          {f?.sector && <span className="text-[11px] px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400">{f.sector}</span>}
        </div>
        {d ? (
          <>
            <p className="text-[30px] font-extrabold tabular-nums tracking-tight text-[var(--text)] mt-3 leading-none">{usd(d.price)}</p>
            <p className="text-[15px] font-bold tabular-nums mt-1.5" style={{ color: d.change === 0 ? 'var(--faint)' : isUp ? UP : DOWN }}>
              {d.change === 0 ? '' : isUp ? '▲ ' : '▼ '}{usd(Math.abs(d.change))} ({isUp ? '+' : ''}{d.changeRate.toFixed(2)}%)
              {usdRate ? <span className="text-[var(--text-muted)] font-semibold ml-2 tabular-nums">≈ {Math.round(d.price * usdRate).toLocaleString('ko-KR')}원</span> : null}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-[var(--line-2)] text-sm">
              <Metric label="시가총액" value={fmtCap(d.marketCap)} />
              <Metric label="52주 최고" value={d.high52w ? usd(d.high52w) : '—'} />
              <Metric label="52주 최저" value={d.low52w ? usd(d.low52w) : '—'} />
              <Metric label="전일 종가" value={d.prevClose ? usd(d.prevClose) : '—'} />
            </div>
          </>
        ) : error ? (
          <p className="text-sm text-[var(--warn)] mt-3">시세를 불러오지 못했습니다 · {symbol}</p>
        ) : (
          <div className="space-y-2 mt-3"><span className="skeleton h-8 w-40" /><span className="skeleton h-4 w-28" /></div>
        )}
      </div>

      {/* 가격 차트 */}
      <PriceChart points={chart} isUp={isUp} tfIdx={tfIdx} onTf={setTfIdx} fmt={usd} yFmt={yFmt} />

      {/* 52주 위치 */}
      {d && pos !== null && (
        <div className="fin-card p-4 mb-3">
          <h3 className="text-[13px] font-bold text-[var(--text)] mb-2">52주 위치 <span className="text-[10px] font-normal text-[var(--text-muted)]">하단에서 {Math.round(pos * 100)}% (방향 예측 아님)</span></h3>
          <div className="relative h-2 rounded-full bg-[var(--surface-2)]">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pos * 100}%`, background: `linear-gradient(90deg, ${DOWN}, ${UP})`, opacity: 0.55 }} />
            <span className="absolute top-1/2 w-3.5 h-3.5 -mt-[7px] -ml-[7px] rounded-full bg-[var(--surface)] border-2" style={{ left: `${pos * 100}%`, borderColor: 'var(--ink)' }} />
          </div>
          <div className="flex justify-between text-[11.5px] font-semibold mt-2 tabular-nums">
            <span style={{ color: DOWN }}>{usd(d.low52w!)}</span>
            <span style={{ color: UP }}>{usd(d.high52w!)}</span>
          </div>
        </div>
      )}

      {/* 밸류에이션 + 재무 체력 */}
      <div className="fin-card p-4 mb-3">
        <h3 className="text-[13px] font-bold text-[var(--text)] mb-3">밸류에이션 · 재무 체력 <span className="text-[10px] font-normal text-[var(--text-muted)]">버핏 7기준 · 검증된 신호 아님</span></h3>
        {f ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl border text-xl font-black"
                style={{ color: f.buffettScore >= 6 ? '#22c55e' : f.buffettScore >= 4 ? '#f59e0b' : '#ef4444', borderColor: 'var(--border)' }}>
                {f.buffettScore}<span className="text-[9px] font-normal opacity-70">/7</span>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                <Metric label="PER" value={per(f.per)} pass={f.buffettDetails.per} />
                <Metric label="Fwd PER" value={per(f.fwdPE)} />
                <Metric label="PEG" value={f.peg != null ? f.peg.toFixed(2) : '—'} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-3 text-sm pt-3 border-t border-[var(--line-2)]">
              <Metric label="ROE" value={f.roe != null ? `${f.roe.toFixed(1)}%` : '—'} pass={f.buffettDetails.roe} />
              <Metric label="영업이익률" value={f.opMargin != null ? `${f.opMargin.toFixed(1)}%` : '—'} pass={f.buffettDetails.margin} />
              <Metric label="FCF" value={fmtFcf(f.fcf)} pass={f.buffettDetails.fcf} />
              <Metric label="부채비율" value={f.debtRatio != null ? `${f.debtRatio.toFixed(1)}%` : '—'} pass={f.buffettDetails.debt} />
              <Metric label="매출성장" value={pct(f.revenueGrowth)} pass={f.buffettDetails.growth} />
              <Metric label="순이익" value={f.netInc != null ? fmtCap(f.netInc) : '—'} pass={f.buffettDetails.profit} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {CRIT.map((c) => {
                const p = f.buffettDetails[c.key];
                return (
                  <span key={c.key} className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                    p === true ? 'text-[#f04452] border-[#f04452]/30 bg-[#f04452]/10' : p === false ? 'text-[#3182f6] border-[#3182f6]/30 bg-[#3182f6]/10' : 'text-[var(--faint)] border-[var(--border)]'
                  }`}>{p === true ? '✓' : p === false ? '✕' : '—'} {c.label}</span>
                );
              })}
            </div>
          </>
        ) : scrFailed ? (
          <p className="text-[12px] text-[var(--text-muted)]">이 종목의 재무 데이터를 가져올 수 없습니다(신규 상장·소형주는 소스에 없을 수 있음).</p>
        ) : (
          <div className="space-y-2"><span className="skeleton h-14 w-full" /><span className="skeleton h-10 w-full" /></div>
        )}
      </div>

      <p className="text-[10px] text-[var(--text-muted)] text-center mt-2 opacity-60">Yahoo Finance 재무·시세 · 투자 참고용 · 신호/매수추천 아님</p>
    </div>
  );
}

export default function OverseasAnalysisPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-10"><div className="skeleton h-40" /></div>}>
      <Inner />
    </Suspense>
  );
}
