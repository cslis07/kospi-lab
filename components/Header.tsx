'use client';

import useSWR from 'swr';
import { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';
import type { FxRate } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ── 시장 상태 & 카운트다운 훅 ────────────────────────── */
interface MarketStatus {
  isKrOpen: boolean;
  isUsOpen: boolean;
  krLabel: string;   // e.g. "마감까지 2시간 30분" / "개장 9시간 50분 후"
  usLabel: string;   // e.g. "마감까지 1시간 10분" / "개장 3시간 20분 후"
}

function fmtMins(totalMins: number) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function calcStatus(): MarketStatus {
  const now = new Date();
  const kstTotal = ((now.getUTCHours() + 9) % 24) * 60 + now.getUTCMinutes();

  // ── 국내 09:00 ~ 15:30 KST ──
  const isKrOpen = kstTotal >= 9 * 60 && kstTotal < 15 * 60 + 30;
  let krLabel: string;
  if (isKrOpen) {
    const minsLeft = 15 * 60 + 30 - kstTotal;
    krLabel = `마감까지 ${fmtMins(minsLeft)}`;
  } else {
    const minsTo = kstTotal < 9 * 60
      ? 9 * 60 - kstTotal
      : 9 * 60 + (24 * 60 - kstTotal);
    krLabel = `개장 ${fmtMins(minsTo)} 후`;
  }

  // ── 해외 22:30 ~ 05:00 KST (EDT 기준) ──
  const isUsOpen = kstTotal >= 22 * 60 + 30 || kstTotal < 5 * 60;
  let usLabel: string;
  if (isUsOpen) {
    const minsLeft = kstTotal < 5 * 60
      ? 5 * 60 - kstTotal
      : 5 * 60 + (24 * 60 - kstTotal);
    usLabel = `마감까지 ${fmtMins(minsLeft)}`;
  } else {
    const minsTo = 22 * 60 + 30 - kstTotal;
    usLabel = `개장 ${fmtMins(minsTo)} 후`;
  }

  return { isKrOpen, isUsOpen, krLabel, usLabel };
}

function useMarketStatus(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(calcStatus);
  useEffect(() => {
    const id = setInterval(() => setStatus(calcStatus()), 30000);
    return () => clearInterval(id);
  }, []);
  return status;
}

/* ── 환율 pill ────────────────────────────────────────── */
function FxPill({ label, rate }: { label: string; rate: FxRate }) {
  const isPos = rate.change >= 0;
  const changeColor = isPos ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs border border-[var(--border)] rounded-full px-3 py-1 bg-white/[0.03]">
      <span className="text-[var(--text-muted)] font-medium">{label}</span>
      <span className="text-[var(--text)] font-bold font-mono">
        ₩{Math.round(rate.value).toLocaleString('ko-KR')}
      </span>
      <span className={`font-mono ${changeColor}`}>
        {isPos ? '+' : ''}{rate.change.toFixed(2)}
      </span>
    </div>
  );
}

/* ── Header ───────────────────────────────────────────── */
export default function Header() {
  const { data } = useSWR('/api/market', fetcher, { refreshInterval: 10000 });
  const { isKrOpen, isUsOpen, krLabel, usLabel } = useMarketStatus();
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const usdkrw: FxRate | null = data?.usdkrw ?? null;
  const jpykrw: FxRate | null = data?.jpykrw ?? null;

  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* ── Left: 시장 상태 ── */}
        <div className="flex items-center gap-2 text-xs shrink-0 min-w-0">
          {/* 해외 */}
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isUsOpen ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'
            }`} />
            <span className="text-[var(--text-muted)] whitespace-nowrap">해외 정규장</span>
          </div>
          <span className="text-[var(--text-muted)] opacity-40">·</span>
          <span className="text-[var(--text-muted)] whitespace-nowrap hidden sm:inline">{usLabel}</span>
          <span className="text-[var(--text-muted)] opacity-40 hidden sm:inline">·</span>

          {/* 국내 */}
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isKrOpen ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'
            }`} />
            <span className="text-[var(--text-muted)] whitespace-nowrap">
              {isKrOpen ? '국내장개장' : '국내장마감'}
            </span>
          </div>
          <span className="text-[var(--text-muted)] opacity-40">·</span>
          <span className="text-[var(--text-muted)] whitespace-nowrap hidden md:inline">{krLabel}</span>
        </div>

        {/* ── Center: 로고 ── */}
        <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none">
          <h1 className="text-sm font-bold tracking-widest text-[var(--text)]">KOSPI LAB</h1>
          <p className="text-[10px] text-[var(--text-muted)] leading-none mt-0.5">실시간 시세 제공</p>
        </div>

        {/* ── Right: 환율 + 시계 + 토글 ── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* USD/KRW */}
          {usdkrw && <FxPill label="USD/KRW" rate={usdkrw} />}

          {/* JPY/KRW (per 100엔) */}
          {jpykrw && (
            <div className="hidden md:flex items-center gap-1.5 text-xs border border-[var(--border)] rounded-full px-3 py-1 bg-white/[0.03]">
              <span className="text-[var(--text-muted)] font-medium">JPY/KRW</span>
              <span className="text-[var(--text)] font-bold font-mono">
                ₩{Math.round(jpykrw.value).toLocaleString('ko-KR')}
              </span>
              <span className={`font-mono ${jpykrw.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {jpykrw.change >= 0 ? '+' : ''}{jpykrw.change.toFixed(2)}
              </span>
              <span className="text-[var(--text-muted)] opacity-50 text-[10px]">100엔</span>
            </div>
          )}

          {/* 시계 */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-[var(--text-muted)] font-mono border border-[var(--border)] rounded-full px-3 py-1 bg-white/[0.03]">
            {/* 새로고침 아이콘 */}
            <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{time}</span>
          </div>

          <ThemeToggle />

          {/* 유저 아이콘 */}
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>

      </div>
    </header>
  );
}
