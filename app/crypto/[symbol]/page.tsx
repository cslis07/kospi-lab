'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { CryptoData } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ChartPoint {
  date: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

const TIMEFRAMES = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년',   months: 12 },
];

// BTC, ETH → full name
const NAMES: Record<string, string> = {
  BTCUSDT: 'Bitcoin',
  ETHUSDT: 'Ethereum',
  XRPUSDT: 'XRP',
  SOLUSDT: 'Solana',
  BNBUSDT: 'BNB',
  ADAUSDT: 'Cardano',
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

  // 현재가 (배치 API 재활용)
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
  const chartMin  = chartData.length > 0 ? Math.min(...chartData.map((p) => p.price)) * 0.995 : 0;
  const chartMax  = chartData.length > 0 ? Math.max(...chartData.map((p) => p.price)) * 1.005 : 0;

  // Y축 티커 포맷
  const yFmt = (v: number) => {
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    if (v >= 1)    return `$${v.toFixed(2)}`;
    return `$${v.toFixed(4)}`;
  };

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
              <span className="text-sm text-[var(--text-muted)] font-mono">Binance 실시간</span>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">가격 차트 (USDT)</h2>
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
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 14, bottom: 5 }}>
              <defs>
                <linearGradient id="cryptoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={isPos ? '#f59e0b' : '#ef4444'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPos ? '#f59e0b' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => `${String(v).slice(4, 6)}/${String(v).slice(6, 8)}`}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false} axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[chartMin, chartMax]}
                tickFormatter={yFmt}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false} axisLine={false} width={56}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as ChartPoint;
                  const dateStr = String(d.date);
                  return (
                    <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs">
                      <p className="text-gray-400">
                        {dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}
                      </p>
                      <p className="text-amber-300 font-semibold">${fmtPrice(d.price)}</p>
                      {d.high && <p className="text-emerald-400">H: ${fmtPrice(d.high)}</p>}
                      {d.low  && <p className="text-red-400">L: ${fmtPrice(d.low)}</p>}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone" dataKey="price"
                stroke={isPos ? '#f59e0b' : '#ef4444'}
                strokeWidth={1.5} fill="url(#cryptoGrad)" dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-[var(--text-muted)] text-sm animate-pulse">
            차트 데이터 로딩 중...
          </div>
        )}
      </div>
    </div>
  );
}
