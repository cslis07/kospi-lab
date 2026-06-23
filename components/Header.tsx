'use client';

import useSWR from 'swr';
import { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';
import GlobalSearch from './GlobalSearch';
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

// SSR-safe: 서버는 빈 값으로 렌더링하고, 클라이언트 마운트 후 실제 계산
function useMarketStatus(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>({
    isKrOpen: false, isUsOpen: false, krLabel: '', usLabel: '',
  });
  useEffect(() => {
    setStatus(calcStatus());
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
    <div className="pill-shadow hidden sm:flex items-center gap-1.5 text-xs border border-[var(--border)] rounded-full px-2.5 py-1 bg-[var(--pill-bg)]">
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
    <header className="site-header border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center gap-3">

        {/* ── Left: 로고 + 시장 상태 ── */}
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <div className="leading-tight">
            <h1 className="text-sm font-bold tracking-wider text-[var(--text)]">KOSPI LAB</h1>
            <p className="text-[9px] text-[var(--text-muted)] leading-none mt-0.5 hidden sm:block">실시간 시세</p>
          </div>
          {/* 시장 상태 dot — md+ 에서만 표시 */}
          <div className="hidden md:flex items-center gap-2 text-xs ml-2 pl-3 border-l border-[var(--border)]">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isUsOpen ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
              <span className="text-[var(--text-muted)] whitespace-nowrap" title={usLabel}>해외</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isKrOpen ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
              <span className="text-[var(--text-muted)] whitespace-nowrap" title={krLabel}>
                {isKrOpen ? '국내 개장' : '국내 마감'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Center: 글로벌 검색 (항상 표시, 모바일에서도) ── */}
        <div className="flex-1 flex justify-center min-w-0">
          <GlobalSearch />
        </div>

        {/* ── Right: 환율 + 시계 + 토글 ── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* USD/KRW — sm+ */}
          {usdkrw && <FxPill label="USD" rate={usdkrw} />}

          {/* JPY/KRW — lg+ */}
          {jpykrw && (
            <div className="pill-shadow hidden lg:flex items-center gap-1.5 text-xs border border-[var(--border)] rounded-full px-3 py-1 bg-[var(--pill-bg)]">
              <span className="text-[var(--text-muted)] font-medium">JPY</span>
              <span className="text-[var(--text)] font-bold font-mono">
                ₩{Math.round(jpykrw.value).toLocaleString('ko-KR')}
              </span>
              <span className={`font-mono ${jpykrw.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {jpykrw.change >= 0 ? '+' : ''}{jpykrw.change.toFixed(2)}
              </span>
            </div>
          )}

          {/* 시계 — md+ */}
          <div className="pill-shadow hidden md:flex items-center gap-1 text-xs text-[var(--text-muted)] font-mono border border-[var(--border)] rounded-full px-3 py-1 bg-[var(--pill-bg)]">
            <span>{time}</span>
          </div>

          <ThemeToggle />
        </div>

      </div>
    </header>
  );
}
