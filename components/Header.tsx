'use client';

import useSWR from 'swr';
import { useState, useEffect } from 'react';
import NavTabs from './NavTabs';
import ThemeToggle from './ThemeToggle';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function IndexBadge({ name, value, changeRate }: { name: string; value: number; changeRate: number }) {
  const pos = changeRate >= 0;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[var(--text-muted)] text-xs font-medium">{name}</span>
      <span className="text-[var(--text)] font-mono font-semibold text-sm tabular-nums">
        {new Intl.NumberFormat('ko-KR').format(value)}
      </span>
      <span className={`text-xs font-semibold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
        {pos ? '+' : ''}{changeRate.toFixed(2)}%
      </span>
    </div>
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

  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Top bar */}
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold tracking-widest text-[var(--text)]">KOSPI LAB</h1>
            <div className="hidden sm:flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-[var(--text-muted)]">실시간</span>
            </div>
          </div>

          <NavTabs />

          <div className="flex items-center gap-2">
            {data?.usdkrw && (
              <div className="hidden md:block text-xs text-right">
                <span className="text-[var(--text-muted)]">USD/KRW </span>
                <span className="text-[var(--text)] font-mono font-semibold">
                  ₩{data.usdkrw.value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
                </span>
                <span className={`ml-1 ${data.usdkrw.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {data.usdkrw.change >= 0 ? '+' : ''}{data.usdkrw.change.toFixed(2)}
                </span>
              </div>
            )}
            <span className="text-xs text-[var(--text-muted)] font-mono tabular-nums hidden sm:block">{time}</span>
            <ThemeToggle />
          </div>
        </div>

        {/* Index bar */}
        {data && (
          <div className="flex items-center gap-6 pb-2 overflow-x-auto">
            {data.kospi && <IndexBadge name="KOSPI" value={data.kospi.value} changeRate={data.kospi.changeRate} />}
            {data.kosdaq && <IndexBadge name="KOSDAQ" value={data.kosdaq.value} changeRate={data.kosdaq.changeRate} />}
          </div>
        )}
      </div>
    </header>
  );
}
