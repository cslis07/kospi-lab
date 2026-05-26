'use client';

import useSWR from 'swr';
import { useState, useEffect } from 'react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function Sign({ v }: { v: number }) {
  const pos = v >= 0;
  return (
    <span className={pos ? 'text-emerald-400' : 'text-red-400'}>
      {pos ? '+' : ''}{v.toFixed(2)}%
    </span>
  );
}

export default function Header() {
  const { data } = useSWR('/api/market', fetcher, { refreshInterval: 10000 });
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const kospi = data?.kospi;
  const usdkrw = data?.usdkrw;

  return (
    <header className="border-b border-white/8 bg-gray-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-gray-400">해외 정규장</span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-400" />
              <span className="text-xs text-gray-400">국내 장마감</span>
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-base font-bold tracking-widest text-white">KOSPI LAB</h1>
            <p className="text-[10px] text-gray-500 -mt-0.5">한국 주식 실시간 시세</p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            {usdkrw && (
              <div className="hidden sm:block text-right">
                <span className="text-gray-400">USD/KRW </span>
                <span className="text-white font-mono font-medium">
                  ₩{usdkrw.value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
                </span>
                <span className={`ml-1 ${usdkrw.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {usdkrw.change >= 0 ? '+' : ''}{usdkrw.change.toFixed(2)}
                </span>
              </div>
            )}
            <span className="text-gray-500 font-mono tabular-nums">{time}</span>
          </div>
        </div>

        {kospi && (
          <div className="flex items-center gap-6 pb-2 text-xs overflow-x-auto">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-gray-400 font-medium">KOSPI</span>
              <span className="text-white font-mono font-semibold text-sm">
                {new Intl.NumberFormat('ko-KR').format(kospi.value)}
              </span>
              <Sign v={kospi.changeRate} />
              <span className={`${kospi.change >= 0 ? 'text-emerald-400' : 'text-red-400'} font-mono`}>
                ({kospi.change >= 0 ? '+' : ''}{new Intl.NumberFormat('ko-KR').format(kospi.change)})
              </span>
            </div>
            {data?.kosdaq && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-gray-400 font-medium">KOSDAQ</span>
                <span className="text-white font-mono font-semibold text-sm">
                  {new Intl.NumberFormat('ko-KR').format(data.kosdaq.value)}
                </span>
                <Sign v={data.kosdaq.changeRate} />
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
