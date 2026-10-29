'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import SyncIndicator from './SyncIndicator';
import GlobalSearch from './GlobalSearch';
import dynamic from 'next/dynamic';
// 검색·전체 메뉴 시트는 누를 때만 필요 → 첫 번들에서 빼고, 화면이 뜬 뒤 한가할 때 마운트(애니메이션은 그대로)
const SearchSheet = dynamic(() => import('./SearchSheet'), { ssr: false });
const MenuSheet = dynamic(() => import('./MenuSheet'), { ssr: false });
import ThemeToggle from './ThemeToggle';
import { activeItem, drillTitle, pageOwnsH1 } from '@/lib/menu';
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
  return (
    <div className={`pill-shadow ${className} items-center gap-1.5 text-xs border border-[var(--border)] rounded-full px-2.5 py-1 bg-[var(--pill-bg)]`}>
      <span className="text-[var(--text-muted)] font-medium">{label}</span>
      <span className="text-[var(--text)] font-bold tabular-nums">
        ₩{Math.round(rate.value).toLocaleString('ko-KR')}
      </span>
      <span className="tabular-nums" style={{ color: rate.change > 0 ? 'var(--up)' : rate.change < 0 ? 'var(--down)' : 'var(--text-muted)' }}>
        {isPos ? '+' : ''}{rate.change.toFixed(2)}
      </span>
    </div>
  );
}

/* ── Header ───────────────────────────────────────────── */
export default function Header() {
  // 앱바 환율·지수 틱커는 전 화면 상주 → 30초 폴링(차트·일지 보는 중 상시 10초 부하 완화)
  const { data } = useSWR('/api/market', fetcher, { refreshInterval: 30000 });
  const { isKrOpen, isUsOpen, krLabel, usLabel } = useMarketStatus();
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // 앱바 3모드: 홈 섹션=로고 / 다른 섹션=섹션 큰 제목(탭 이동이라 뒤로가기 없음) / 섹션 밖 상세=뒤로가기+제목
  const hit = activeItem(pathname, NO_QUERY);
  const mode: 'home' | 'section' | 'drill' = !hit ? 'drill' : hit.group.key === 'home' ? 'home' : 'section';
  // 문서 제목(h1)은 화면당 1개: 본문이 h1을 가지면 양보, 아니면 여기서 sr-only로. 앱바 글자는 장식(span)
  const docTitle = mode === 'home' ? 'KOSPI LAB — 투자 리스크 관리' : mode === 'section' ? (hit!.group.label === hit!.item.label ? hit!.item.label : `${hit!.group.label} · ${hit!.item.label}`) : drillTitle(pathname);
  const goBack = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/'); };

  // 화면 이동 시 시트 닫기 + 다른 컴포넌트(빈 관심목록 등)가 검색을 열 수 있게 전역 이벤트 수신
  useEffect(() => { setSearchOpen(false); setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener('kl:open-search', open);
    return () => window.removeEventListener('kl:open-search', open);
  }, []);

  const [sheetsReady, setSheetsReady] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (h: number) => void };
    if (w.requestIdleCallback) { const h = w.requestIdleCallback(() => setSheetsReady(true)); return () => w.cancelIdleCallback?.(h); }
    const t = window.setTimeout(() => setSheetsReady(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const usdkrw: FxRate | null = data?.usdkrw ?? null;
  const jpykrw: FxRate | null = data?.jpykrw ?? null;
  const usdtkrw: FxRate | null = data?.usdtkrw ?? null;

  return (
    <header className="site-header border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md sticky top-0 z-40">
      {!pageOwnsH1(pathname) && <h1 className="sr-only">{docTitle}</h1>}
      {/* ── 모바일 앱바 (md 미만) ── */}
      <div className="md:hidden appbar px-1.5 flex items-center gap-0.5">
        {mode === 'home' ? (
          <Link href="/" aria-label="홈" className="flex items-center gap-2 pl-2.5 min-w-0 flex-1">
            <span aria-hidden className="grid place-items-center w-7 h-7 rounded-lg text-[13px] font-black text-white shrink-0"
              style={{ background: 'var(--accent)', boxShadow: '0 2px 0 var(--accent-deep)' }}>K</span>
            <span className="text-[17px] font-extrabold tracking-tight text-[var(--text)] truncate">KOSPI LAB</span>
          </Link>
        ) : mode === 'section' ? (
          <span className="flex-1 min-w-0 truncate pl-3 font-display text-[21px] font-extrabold tracking-tight text-[var(--text)]">{hit!.group.label}</span>
        ) : (
          <>
            <button type="button" onClick={goBack} className="appbar-ic" aria-label="뒤로가기">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <span className="flex-1 min-w-0 truncate font-display text-[17px] font-bold tracking-tight text-[var(--text)]">{drillTitle(pathname)}</span>
          </>
        )}
        <ThemeToggle className="appbar-ic" />
        <button type="button" className="appbar-ic" onClick={() => setSearchOpen(true)} aria-label="종목 검색">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" /></svg>
        </button>
        <button type="button" className="appbar-ic" onClick={() => setMenuOpen(true)} aria-label="전체 메뉴">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M4 6.5h16M4 12h16M4 17.5h16" /></svg>
        </button>
      </div>
      {(sheetsReady || searchOpen) && <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />}
      {(sheetsReady || menuOpen) && <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />}

      {/* ── 데스크탑 헤더 (md+) ── */}
      <div className="hidden md:flex max-w-[1760px] mx-auto px-3 sm:px-6 xl:px-8 h-16 items-center gap-3">

        {/* ── Left: 로고 + 시장 상태 ── */}
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          {/* 로고 — lg+ 에선 사이드바에 있어 숨김(.hdr-logo) */}
          <Link href="/" aria-label="홈으로" className="hdr-logo flex items-center gap-2 leading-tight">
            <span aria-hidden className="grid place-items-center w-7 h-7 rounded-lg text-[13px] font-black text-white"
              style={{ background: 'var(--accent)', boxShadow: '0 2px 0 var(--accent-deep)' }}>K</span>
            <span className="block">
              <span className="block font-display text-sm font-extrabold tracking-tight text-[var(--text)]">KOSPI LAB</span>
              <p className="text-[9px] text-[var(--text-muted)] leading-none mt-0.5 hidden sm:block">투자 리스크 관리</p>
            </span>
          </Link>
          {/* 시장 상태 dot — md+ 에서만 표시 */}
          {/* 768~1023px(작은 창·배율 150% 노트북)에선 오른쪽 알약까지 다 담으면 화면 밖으로 넘쳤다 → 넓을 때만 */}
          <div className="hidden lg:flex items-center gap-2 text-xs ml-2 pl-3 border-l border-[var(--border)]">
            <span className={`ds ${isKrOpen ? 'live' : 'closed'}`} title={krLabel}><i aria-hidden />국내 {isKrOpen ? '개장' : '마감'}</span>
            <span className={`ds ${isUsOpen ? 'live' : 'closed'}`} title={usLabel}><i aria-hidden />미국 {isUsOpen ? '개장' : '마감'}</span>
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
          {usdtkrw && <FxPill label="USDT" rate={usdtkrw} className="hidden lg:flex" />}

          {/* 나머지 환율·시각은 펼침(기획서 §5.1 — 헤더엔 USD·USDT 2개만) */}
          {jpykrw && (
            <details className="relative hidden lg:block">
              <summary className="list-none cursor-pointer text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1.5 rounded-lg" aria-label="환율 더보기">환율 ▾</summary>
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-3 text-xs space-y-2" style={{ boxShadow: 'var(--sh-pop)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-muted)]">JPY(100엔)</span>
                  <span className="tabular-nums font-bold text-[var(--text)]">₩{Math.round(jpykrw.value).toLocaleString('ko-KR')}
                    <span className="ml-1.5 font-semibold" style={{ color: jpykrw.change > 0 ? 'var(--up)' : jpykrw.change < 0 ? 'var(--down)' : 'var(--text-muted)' }}>{jpykrw.change >= 0 ? '+' : ''}{jpykrw.change.toFixed(2)}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3"><span className="text-[var(--text-muted)]">현재 시각(KST)</span><span className="tabular-nums text-[var(--text)]"><Clock /></span></div>
                <Link href="/indicators" className="block text-[var(--accent-ink)] font-semibold pt-1">환율·시장지표 전체 →</Link>
              </div>
            </details>
          )}

          <Link href="/alerts" className="btn-icon" aria-label="가격 알림" title="가격 알림">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          </Link>

          <SyncIndicator />

          {/* 다크/라이트 토글 */}
          <ThemeToggle className="btn-icon" />

          {/* 전체 메뉴 팝업 버튼 — 홈 하단 바로가기 카드를 대신한다(모바일 ☰ 시트와 동일 내용) */}
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="전체 메뉴" title="전체 메뉴" className="btn-icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M4 6.5h16M4 12h16M4 17.5h16" /></svg>
          </button>
        </div>

      </div>
    </header>
  );
}

/** 1초 시계 — 헤더 전체가 매초 다시 그려지지 않게 시계만 따로 갱신한다 */
function Clock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{time}</span>;
}
