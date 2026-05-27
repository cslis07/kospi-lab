'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAlerts } from '@/hooks/useAlerts';
import type { StockData, ChartPoint } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n);
}

const TIMEFRAMES = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년',   months: 12 },
];

export default function StockDetailPage() {
  const params = useParams();
  const ticker = params.ticker as string;
  const [tfIdx, setTfIdx] = useState(0);
  const tf = TIMEFRAMES[tfIdx];

  const { data: stock, isLoading, error: stockError } = useSWR<StockData>(
    ticker ? `/api/stock/${ticker}` : null,
    fetcher,
    { refreshInterval: 5000 }
  );
  const { data: chart } = useSWR<ChartPoint[]>(
    ticker ? `/api/stock/${ticker}/chart?months=${tf.months}&market=${stock?.market ?? ''}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { portfolio, setEntry, removeEntry } = usePortfolio();
  const { alerts, setAlert, removeAlert } = useAlerts();

  const myPortfolio = portfolio[ticker];
  const myAlert = alerts[ticker];

  const [qty, setQty] = useState('');
  const [avg, setAvg] = useState('');
  const [alertAbove, setAlertAbove] = useState('');
  const [alertBelow, setAlertBelow] = useState('');

  // Populate inputs from stored values (once)
  const [initDone, setInitDone] = useState(false);
  if (!initDone && myPortfolio) {
    setQty(String(myPortfolio.quantity));
    setAvg(String(myPortfolio.avgPrice));
    setInitDone(true);
  }
  if (!initDone && myAlert) {
    setAlertAbove(String(myAlert.above ?? ''));
    setAlertBelow(String(myAlert.below ?? ''));
    setInitDone(true);
  }

  const isPos = (stock?.change ?? 0) >= 0;

  const savePortfolio = () => {
    const q = parseFloat(qty);
    const a = parseFloat(avg);
    if (q > 0 && a > 0) setEntry(ticker, { quantity: q, avgPrice: a });
    else removeEntry(ticker);
  };

  const saveAlert = () => {
    const above = parseFloat(alertAbove) || undefined;
    const below = parseFloat(alertBelow) || undefined;
    if (!above && !below) { removeAlert(ticker); return; }
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setAlert(ticker, { above, below });
  };

  if (!ticker) return null;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-6 w-32 bg-white/10 rounded" />
        <div className="h-48 bg-white/5 rounded-2xl" />
        <div className="h-64 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  if (stockError || !stock || 'error' in stock) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-6 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          대시보드로 돌아가기
        </Link>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <p className="text-red-400 font-medium">데이터를 불러올 수 없습니다</p>
          <p className="text-[var(--text-muted)] text-sm mt-1">종목 코드: {ticker}</p>
        </div>
      </div>
    );
  }

  const chartData = Array.isArray(chart) ? chart : [];
  const chartMin = chartData.length > 0 ? Math.min(...chartData.map((p) => p.price)) * 0.995 : 0;
  const chartMax = chartData.length > 0 ? Math.max(...chartData.map((p) => p.price)) * 1.005 : 0;

  const pnl = myPortfolio ? (stock.price - myPortfolio.avgPrice) * myPortfolio.quantity : null;
  const pnlRate = myPortfolio ? ((stock.price - myPortfolio.avgPrice) / myPortfolio.avgPrice) * 100 : null;

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        대시보드로 돌아가기
      </Link>

      {/* Stock header */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-[var(--text)]">{stock.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                stock.market === 'KOSDAQ' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
              }`}>{stock.market}</span>
            </div>
            <span className="text-sm text-[var(--text-muted)] font-mono">{ticker}</span>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums text-[var(--text)]">₩{fmt(stock.price)}</p>
            <p className={`text-base font-semibold mt-1 ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPos ? '+' : ''}{fmt(stock.change)}원 ({isPos ? '+' : ''}{stock.changeRate.toFixed(2)}%)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-[var(--border)] text-sm">
          <div><p className="text-[var(--text-muted)] text-xs mb-0.5">거래량</p><p className="font-medium text-[var(--text)]">{stock.volume}</p></div>
          <div><p className="text-[var(--text-muted)] text-xs mb-0.5">시가총액</p><p className="font-medium text-[var(--text)]">{stock.marketCap}</p></div>
          {stock.high52w && <div><p className="text-[var(--text-muted)] text-xs mb-0.5">52주 최고</p><p className="font-medium text-emerald-400">₩{fmt(stock.high52w)}</p></div>}
          {stock.low52w && <div><p className="text-[var(--text-muted)] text-xs mb-0.5">52주 최저</p><p className="font-medium text-red-400">₩{fmt(stock.low52w)}</p></div>}
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">가격 차트</h2>
          <div className="flex gap-1">
            {TIMEFRAMES.map((t, i) => (
              <button
                key={t.label}
                onClick={() => setTfIdx(i)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  tfIdx === i ? 'bg-sky-500/20 text-sky-400' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPos ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPos ? '#10b981' : '#ef4444'} stopOpacity={0} />
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
                tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false} axisLine={false} width={42}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as ChartPoint;
                  const dateStr = String(d.date);
                  return (
                    <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs">
                      <p className="text-gray-400">{dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}</p>
                      <p className="text-white font-semibold">₩{fmt(d.price)}</p>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="price" stroke={isPos ? '#10b981' : '#ef4444'}
                strokeWidth={1.5} fill="url(#colorPrice)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-60 flex items-center justify-center text-[var(--text-muted)] text-sm">
            차트 데이터 로딩 중...
          </div>
        )}
      </div>

      {/* Portfolio & Alert */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-4">포트폴리오</h2>
          {myPortfolio && pnl !== null && pnlRate !== null && (
            <div className="mb-4 p-3 rounded-lg bg-white/5 text-xs space-y-1.5">
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">보유 수량</span><span>{fmt(myPortfolio.quantity)}주</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">평균 단가</span><span>₩{fmt(myPortfolio.avgPrice)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">평가 금액</span><span>₩{fmt(Math.round(stock.price * myPortfolio.quantity))}</span></div>
              <div className={`flex justify-between font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                <span>손익</span>
                <span>{pnl >= 0 ? '+' : ''}{fmt(Math.round(pnl))}원 ({pnlRate.toFixed(2)}%)</span>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <input type="number" placeholder="보유 수량 (주)" value={qty} onChange={(e) => setQty(e.target.value)}
              className="w-full bg-white/5 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50" />
            <input type="number" placeholder="평균 매입가 (원)" value={avg} onChange={(e) => setAvg(e.target.value)}
              className="w-full bg-white/5 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50" />
            <button onClick={savePortfolio}
              className="w-full py-2 rounded-lg bg-sky-500/20 text-sky-400 text-sm font-medium hover:bg-sky-500/30 transition-colors">
              저장
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-4">가격 알림 🔔</h2>
          {myAlert && (
            <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs space-y-1">
              {myAlert.above && <p className="text-yellow-400">↑ ₩{fmt(myAlert.above)} 이상 시 알림</p>}
              {myAlert.below && <p className="text-yellow-400">↓ ₩{fmt(myAlert.below)} 이하 시 알림</p>}
            </div>
          )}
          <div className="space-y-2">
            <input type="number" placeholder="목표가 (이상 시 알림)" value={alertAbove} onChange={(e) => setAlertAbove(e.target.value)}
              className="w-full bg-white/5 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-yellow-500/50" />
            <input type="number" placeholder="하한가 (이하 시 알림)" value={alertBelow} onChange={(e) => setAlertBelow(e.target.value)}
              className="w-full bg-white/5 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-yellow-500/50" />
            <button onClick={saveAlert}
              className="w-full py-2 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm font-medium hover:bg-yellow-500/30 transition-colors">
              알림 설정
            </button>
            {myAlert && (
              <button onClick={() => { removeAlert(ticker); setAlertAbove(''); setAlertBelow(''); }}
                className="w-full py-2 rounded-lg text-[var(--text-muted)] text-xs hover:text-red-400 transition-colors">
                알림 해제
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)] opacity-70">브라우저 알림 권한이 필요합니다</p>
        </div>
      </div>
    </div>
  );
}
