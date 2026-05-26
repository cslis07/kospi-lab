'use client';

import useSWR from 'swr';
import type { StockData } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n);
}

interface Props {
  ticker: string;
  name: string;
  market: string;
  onRemove: (ticker: string) => void;
}

export default function StockCard({ ticker, name, market, onRemove }: Props) {
  const { data, error, isLoading } = useSWR<StockData>(
    `/api/stock/${ticker}`,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: true }
  );

  const isPos = (data?.change ?? 0) >= 0;
  const sign = isPos ? '+' : '';

  if (isLoading) {
    return (
      <div className="relative rounded-2xl border border-white/8 bg-white/3 p-5 animate-pulse">
        <div className="h-4 w-24 bg-white/10 rounded mb-3" />
        <div className="h-8 w-32 bg-white/10 rounded mb-2" />
        <div className="h-3 w-20 bg-white/10 rounded" />
      </div>
    );
  }

  if (error || !data || 'error' in data) {
    return (
      <div className="relative rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
        <button
          onClick={() => onRemove(ticker)}
          className="absolute top-3 right-3 text-gray-600 hover:text-red-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <p className="text-sm text-gray-500 font-medium">{name}</p>
        <p className="text-xs text-red-400 mt-1">데이터 불러오기 실패</p>
      </div>
    );
  }

  return (
    <div className="relative group rounded-2xl border border-white/8 bg-white/3 hover:bg-white/5 hover:border-white/15 transition-all p-5">
      <button
        onClick={() => onRemove(ticker)}
        className="absolute top-3 right-3 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
        title="종목 제거"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-2 mb-3">
        <div>
          <p className="text-sm font-semibold text-white leading-tight">{data.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-gray-500 font-mono">{ticker}</span>
            <span className={`text-xs px-1 py-0.5 rounded text-[10px] font-medium ${
              market === 'KOSDAQ' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
            }`}>{data.market || market}</span>
          </div>
        </div>
      </div>

      <p className="text-2xl font-bold text-white tabular-nums">
        ₩{fmt(data.price)}
      </p>

      <div className={`flex items-center gap-1.5 mt-1 ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
        <svg className={`w-3.5 h-3.5 ${isPos ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4l8 16H4z" />
        </svg>
        <span className="text-sm font-semibold tabular-nums">
          {sign}{fmt(data.change)}원 ({sign}{data.changeRate.toFixed(2)}%)
        </span>
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <p className="text-gray-500">거래량</p>
          <p className="text-gray-300 tabular-nums mt-0.5">{data.volume}</p>
        </div>
        <div>
          <p className="text-gray-500">시가총액</p>
          <p className="text-gray-300 mt-0.5">{data.marketCap}</p>
        </div>
      </div>
    </div>
  );
}
