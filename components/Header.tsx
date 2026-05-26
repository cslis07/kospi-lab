'use client';

import useSWR from 'swr';
import { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function useMarketStatus() {
  const [status, setStatus] = useState({ isKrOpen: false, isUsOpen: false, label: '' });
  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const kstTotal = ((now.getUTCHours() + 9) % 24) * 60 + now.getUTCMinutes();
      const isKrOpen = kstTotal >= 9 * 60 && kstTotal < 15 * 60 + 30;
      const isUsOpen = kstTotal >= 22 * 60 + 30 || kstTotal < 5 * 60;
      let minsToKr = isKrOpen ? 0 : kstTotal < 9 * 60 ? 9 * 60 - kstTotal : 9 * 60 + (24 * 60 - kstTotal);
      const h = Math.floor(minsToKr / 60);
      const m = minsToKr % 60;
      const label = isKrOpen ? '' : `개장 ${h}시간 ${m}분 후`;
      setStatus({ isKrOpen, isUsOpen, label });
    };
    calc();
    const id = setInterval(calc, 60000);
    return () => clearInterval(id);
  }, []);
  return status;
}

export default function Header() {
  const { data } = useSWR('/api/market', fetcher, { refreshInterval: 10000 });
  const { isKrOpen, isUsOpen, label } = useMarketStatus();
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const usdkrw = data?.usdkrw;

  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* Left: market status */}
        <div className="flex items-center gap-3 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isUsOpen ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-[var(--text-muted)]">해외 정규장</span>
          </div>
          <span className="text-[var(--text-dim)]">·</span>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isKrOpen ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-[var(--text-muted)]">{isKrOpen ? '국내장개장' : '국내장마감'}</span>
          </div>
          {label && (
            <>
              <span className="text-[var(--text-dim)]">·</span>
              <span className="text-[var(--text-muted)]">{label}</span>
            </>
          )}
        </div>

        {/* Center: logo */}
        <div className="text-center absolute left-1/2 -translate-x-1/2">
          <h1 className="text-sm font-bold tracking-widest text-[var(--text)]">KOSPI LAB</h1>
          <p className="text-[10px] text-[var(--text-muted)] leading-none mt-0.5">KOSPI 해외 실시간 시세 제공</p>
        </div>

        {/* Right: USD/KRW, time, toggles */}
        <div className="flex items-center gap-3 shrink-0">
          {usdkrw && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs border border-[var(--border)] rounded-full px-3 py-1">
              <span className="text-[var(--text-muted)]">USD/KRW</span>
              <span className="text-[var(--text)] font-semibold font-mono">
                ₩{usdkrw.value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
              </span>
              <span className={`font-mono ${usdkrw.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {usdkrw.change >= 0 ? '+' : ''}{usdkrw.change.toFixed(2)}
              </span>
            </div>
          )}
          <div className="hidden md:flex items-center gap-1 text-xs text-[var(--text-muted)] font-mono">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M12 6v6l4 2" /></svg>
            {time}
          </div>
          <ThemeToggle />
          {/* User icon */}
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>

      </div>
    </header>
  );
}
