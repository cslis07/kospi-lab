'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import {
  ComposedChart, AreaChart, Area, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line,
} from 'recharts';
import type { CryptoData } from '@/lib/types';
import { calcMA } from '@/lib/indicators';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ChartPoint {
  date: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

interface EnhancedPoint extends ChartPoint {
  ma5:  number | null;
  ma20: number | null;
}

const TIMEFRAMES = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년',   months: 12 },
];

const NAMES: Record<string, string> = {
  BTCUSDT:  'Bitcoin',
  ETHUSDT:  'Ethereum',
  XRPUSDT:  'XRP',
  SOLUSDT:  'Solana',
  BNBUSDT:  'BNB',
  ADAUSDT:  'Cardano',
  DOGEUSDT: 'Dogecoin',
};

function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(4);
  return n.toFixed(6);
}
function fmtVol(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

export default function CryptoDetailPage() {
  const params = useParams();
  const symbol = (params.symbol as string).toUpperCase();
  const base   = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
  const name   = NAMES[symbol] ?? base;

  const [tfIdx, setTfIdx] = useState(0);
  const tf = TIMEFRAMES[tfIdx];

  // 이동평균 토글
  const [showMA5,  setShowMA5]  = useState(false);
  const [showMA20, setShowMA20] = useState(true);
  const [showVol,  setShowVol]  = useState(true);

  // 현재가 (배치 API)
  const { data: batchData } = useSWR<Record<string, CryptoData>>(
    `/api/crypto/batch?symbols=${symbol}`,
    fetcher,
    { refreshInterval: 5000 }
  );
  const crypto = batchData?.[symbol];

  // 차트 데이터
  const { data: chart } = useSWR<ChartPoint[]>(
    `/api/crypto/chart/${symbol}?months=${tf.months}`,
    fetcher,
    { refreshInterval: 60000 }
  );

  const isPos = (crypto?.changeRate ?? 0) >= 0;
  const chartData = Array.isArray(chart) ? chart : [];

  // MA 계산
  const enhancedData = useMemo((): EnhancedPoint[] => {
    if (!chartData.length) return [];
    const prices = chartData.map((d) => d.price);
    const ma5Arr  = calcMA(prices, 5);
    const ma20Arr = calcMA(prices, 20);
    return chartData.map((d, i) => ({
      ...d,
      ma5:  ma5Arr[i],
      ma20: ma20Arr[i],
    }));
  }, [chartData]);

  const priceMin = enhancedData.length > 0
    ? Math.min(...enhancedData.map((p) => p.price)) * 0.995
    : 0;
  const priceMax = enhancedData.length > 0
    ? Math.max(...enhancedData.map((p) => p.price)) * 1.005
    : 0;

  const yFmt = (v: number) => {
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    if (v >= 1)    return `$${v.toFixed(2)}`;
    return `$${v.toFixed(4)}`;
  };

  const dateTick = (v: string | number) =>
    `${String(v).slice(4, 6)}/${String(v).slice(6, 8)}`;

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        대시보드로 돌아가기
      </Link>

      {/* 헤더 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 mb-4">
        {!crypto ? (
          <div className="animate-pulse space-y-3">
            <div className="h-7 w-40 bg-[var(--border)] rounded" />
            <div className="h-10 w-52 bg-[var(--border)] rounded" />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-[var(--text)]">{name}</h1>
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-amber-500/20 text-amber-400">
                  {base}/USDT
                </span>
              </div>
              <span className="text-sm text-[var(--text-muted)] font-mono">Yahoo Finance 실시간</span>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold tabular-nums text-[var(--text)]">
                ${fmtPrice(crypto.price)}
              </p>
              <p className={`text-base font-semibold mt-1 ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPos ? '+' : ''}${Math.abs(crypto.change).toFixed(crypto.price >= 1 ? 2 : 6)}
                &nbsp;({isPos ? '+' : ''}{crypto.changeRate.toFixed(2)}%)
              </p>
            </div>
          </div>
        )}

        {/* 24h 통계 */}
        {crypto && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-[var(--border)] text-sm">
            <div>
              <p className="text-[var(--text-muted)] text-xs mb-0.5">24h 최고</p>
              <p className="font-medium text-emerald-400">${fmtPrice(crypto.high24h)}</p>
            </div>
            <div>
              <p className="text-[var(--text-muted)] text-xs mb-0.5">24h 최저</p>
              <p className="font-medium text-red-400">${fmtPrice(crypto.low24h)}</p>
            </div>
            <div>
              <p className="text-[var(--text-muted)] text-xs mb-0.5">24h 거래량</p>
              <p className="font-medium text-[var(--text)]">{fmtVol(crypto.volume24h)} {base}</p>
            </div>
            <div>
              <p className="text-[var(--text-muted)] text-xs mb-0.5">24h 거래대금</p>
              <p className="font-medium text-[var(--text)]">${fmtVol(crypto.quoteVolume24h)}</p>
            </div>
          </div>
        )}
      </div>

      {/* 차트 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 mb-4">
        {/* 타임프레임 + 지표 토글 */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-1">
            {TIMEFRAMES.map((t, i) => (
              <button
                key={t.label}
                onClick={() => setTfIdx(i)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  tfIdx === i
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* 지표 토글 */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { label: 'MA5',  active: showMA5,  toggle: () => setShowMA5((v) => !v),  color: 'text-yellow-400' },
              { label: 'MA20', active: showMA20, toggle: () => setShowMA20((v) => !v), color: 'text-purple-400' },
              { label: '거래량', active: showVol, toggle: () => setShowVol((v) => !v),  color: 'text-sky-400' },
            ].map((btn) => (
              <button
                key={btn.label}
                onClick={btn.toggle}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  btn.active
                    ? `${btn.color} border-current bg-current/10`
                    : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {enhancedData.length > 0 ? (
          <>
            {/* 가격 + MA 차트 */}
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={enhancedData} margin={{ top: 5, right: 5, left: 14, bottom: 0 }}>
                <defs>
                  <linearGradient id="cryptoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={isPos ? '#f59e0b' : '#ef4444'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={isPos ? '#f59e0b' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={dateTick}
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickLine={false} axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[priceMin, priceMax]}
                  tickFormatter={yFmt}
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  tickLine={false} axisLine={false} width={56}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as EnhancedPoint;
                    const dateStr = String(d.date);
                    return (
                      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs space-y-0.5">
                        <p className="text-gray-400 mb-1">
                          {dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}
                        </p>
                        <p className="text-amber-300 font-semibold">${fmtPrice(d.price)}</p>
                        {d.high && <p className="text-emerald-400">H: ${fmtPrice(d.high)}</p>}
                        {d.low  && <p className="text-red-400">L: ${fmtPrice(d.low)}</p>}
                        {showMA5  && d.ma5  != null && <p className="text-yellow-400">MA5: ${fmtPrice(d.ma5)}</p>}
                        {showMA20 && d.ma20 != null && <p className="text-purple-400">MA20: ${fmtPrice(d.ma20)}</p>}
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone" dataKey="price"
                  stroke={isPos ? '#f59e0b' : '#ef4444'}
                  strokeWidth={1.5} fill="url(#cryptoGrad)" dot={false}
                />
                {showMA5 && (
                  <Line type="monotone" dataKey="ma5"
                    stroke="#eab308" strokeWidth={1} dot={false}
                    connectNulls name="MA5" />
                )}
                {showMA20 && (
                  <Line type="monotone" dataKey="ma20"
                    stroke="#a855f7" strokeWidth={1} dot={false}
                    connectNulls name="MA20" />
                )}
              </ComposedChart>
            </ResponsiveContainer>

            {/* 거래량 차트 */}
            {showVol && (
              <ResponsiveContainer width="100%" height={60}>
                <AreaChart data={enhancedData} margin={{ top: 4, right: 5, left: 14, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as EnhancedPoint;
                      return (
                        <div className="bg-gray-900 border border-white/10 rounded px-2 py-1 text-xs text-sky-300">
                          Vol: {fmtVol(d.volume)}
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone" dataKey="volume"
                    stroke="#38bdf8" strokeWidth={0}
                    fill="#38bdf8" fillOpacity={0.3} dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </>
        ) : (
          <div className="h-64 flex items-center justify-center text-[var(--text-muted)] text-sm animate-pulse">
            차트 데이터 로딩 중...
          </div>
        )}
      </div>
    </div>
  );
}
