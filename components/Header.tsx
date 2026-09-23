'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';
import SyncIndicator from './SyncIndicator';
import GlobalSearch from './GlobalSearch';
import SearchSheet from './SearchSheet';
import MenuSheet from './MenuSheet';
import { activeItem, drillTitle } from '@/lib/menu';
import type { FxRate } from '@/lib/types';

// 앱바는 쿼리 없는 메뉴 항목만 판정하므로 빈 파라미터로 충분(useSearchParams 를 쓰면 레이아웃 전체에 Suspense 가 필요해진다)
const NO_QUERY = new URLSearchParams();

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
function FxPill({ label, rate, className = 'hidden sm:flex' }: { label: string; rate: FxRate; className?: string }) {
  const isPos = rate.change >= 0;
  const changeColor = isPos ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className={`pill-shadow ${className} items-center gap-1.5 text-xs border border-[var(--border)] rounded-full px-2.5 py-1 bg-[var(--pill-bg)]`}>
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
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // 앱바 3모드: 홈 섹션=로고 / 다른 섹션=섹션 큰 제목(탭 이동이라 뒤로가기 없음) / 섹션 밖 상세=뒤로가기+제목
  const hit = activeItem(pathname, NO_QUERY);
  const mode: 'home' | 'section' | 'drill' = !hit ? 'drill' : hit.group.key === 'home' ? 'home' : 'section';
  const goBack = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/'); };

  // 화면 이동 시 시트 닫기 + 다른 컴포넌트(빈 관심목록 등)가 검색을 열 수 있게 전역 이벤트 수신
  useEffect(() => { setSearchOpen(false); setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener('kl:open-search', open);
    return () => window.removeEventListener('kl:open-search', open);
  }, []);

  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const usdkrw: FxRate | null = data?.usdkrw ?? null;
  const jpykrw: FxRate | null = data?.jpykrw ?? null;
  const usdtkrw: FxRate | null = data?.usdtkrw ?? null;

  return (
    <header className="site-header border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md sticky top-0 z-40">
      {/* ── 모바일 앱바 (md 미만) ── */}
      <div className="md:hidden appbar px-1.5 flex items-center gap-0.5">
        {mode === 'home' ? (
          <Link href="/" aria-label="홈" className="flex items-center gap-2 pl-2.5 min-w-0 flex-1">
            <span aria-hidden className="grid place-items-center w-7 h-7 rounded-lg text-[13px] font-black text-white shrink-0"
              style={{ background: 'linear-gradient(135deg,#3182f6,#1b64da)', boxShadow: '0 2px 8px rgba(49,130,246,.35)' }}>K</span>
            <span className="text-[17px] font-extrabold tracking-tight text-[var(--text)] truncate">KOSPI LAB</span>
          </Link>
        ) : mode === 'section' ? (
          <h1 className="flex-1 min-w-0 truncate pl-3 text-[21px] font-extrabold tracking-tight text-[var(--text)]">{hit!.group.label}</h1>
        ) : (
          <>
            <button type="button" onClick={goBack} className="appbar-ic" aria-label="뒤로가기">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <h1 className="flex-1 min-w-0 truncate text-[17px] font-bold tracking-tight text-[var(--text)]">{drillTitle(pathname)}</h1>
          </>
        )}
        <button type="button" className="appbar-ic" onClick={() => setSearchOpen(true)} aria-label="종목 검색">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" /></svg>
        </button>
        <button type="button" className="appbar-ic" onClick={() => setMenuOpen(true)} aria-label="전체 메뉴">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M4 6.5h16M4 12h16M4 17.5h16" /></svg>
        </button>
      </div>
      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* ── 데스크탑 헤더 (md+) ── */}
      <div className="hidden md:flex max-w-7xl mx-auto px-3 sm:px-6 h-14 items-center gap-3">

        {/* ── Left: 로고 + 시장 상태 ── */}
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <Link href="/" aria-label="홈으로" className="flex items-center gap-2 leading-tight">
            <span aria-hidden className="grid place-items-center w-7 h-7 rounded-lg text-[13px] font-black text-white"
              style={{ background: 'linear-gradient(135deg,#3182f6,#1b64da)', boxShadow: '0 2px 8px rgba(49,130,246,.35)' }}>K</span>
            <span className="block">
              <h1 className="text-sm font-extrabold tracking-tight text-[var(--text)]">KOSPI LAB</h1>
              <p className="text-[9px] text-[var(--text-muted)] leading-none mt-0.5 hidden sm:block">투자 리스크 관리</p>
            </span>
          </Link>
          {/* 시장 상태 dot — md+ 에서만 표시 */}
          <div className="hidden md:flex items-center gap-2 text-xs ml-2 pl-3 border-l border-[var(--border)]">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isUsOpen ? 'bg-emerald-400 animate-pulse dot-live' : 'bg-gray-600'}`} />
              <span className="text-[var(--text-muted)] whitespace-nowrap" title={usLabel}>해외</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isKrOpen ? 'bg-emerald-400 animate-pulse dot-live' : 'bg-gray-600'}`} />
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

          {/* USDT/KRW (업비트) — md+ */}
          {usdtkrw && <FxPill label="USDT" rate={usdtkrw} className="hidden md:flex" />}

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

          <SyncIndicator />
          <ThemeToggle />

          {/* 전체 메뉴 팝업 버튼 — 홈 하단 바로가기 카드를 대신한다(모바일 ☰ 시트와 동일 내용) */}
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="전체 메뉴"
            className="pill-shadow flex items-center gap-1.5 text-xs font-semibold border border-[var(--border)] rounded-full px-3 py-1.5 bg-[var(--pill-bg)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M4 6.5h16M4 12h16M4 17.5h16" /></svg>
            전체메뉴
          </button>
        </div>

      </div>
    </header>
  );
}
