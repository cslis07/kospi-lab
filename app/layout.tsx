import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import NavTabs from '@/components/NavTabs';
import BottomNav from '@/components/BottomNav';
import PwaRegister from '@/components/PwaRegister';

export const metadata: Metadata = {
  metadataBase: new URL('https://kospi-lab.vercel.app'),
  title: { default: 'KOSPI LAB — 투자 리스크 관리 대시보드', template: '%s | KOSPI LAB' },
  description: '국내주식·코인선물 손절·사이징·청산가 계산과 매매 기록. 룰엔진 체크리스트와 실시간 시세. 매매 신호를 제공하지 않습니다.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KOSPI LAB',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

// Copilot Money 디자인 — Jokker/Matter(상용)의 대체재. 라틴·숫자만 담당하고 한글은 Pretendard 로 폴백.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk', display: 'swap' });

export const viewport: Viewport = {
  // 기본 다크(미드나잇 캔버스). 라이트 전환 시 ThemeToggle 이 meta theme-color 를 갱신.
  themeColor: '#000814',
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
  // 노치·제스처바 안전영역(env(safe-area-inset-*))을 쓰려면 cover 필요 — 하단 탭바 여백에 사용
  viewportFit: 'cover',
};

// 페인트 전에 저장된 테마를 html 클래스로 적용(FOUC 방지). 기본 = 다크.
// 우선순위: ?theme=light|dark 쿼리(딥링크·공유·테스트, 지정 시 저장) → localStorage → 다크.
const themeInit = `(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=(q==='light'||q==='dark')?q:localStorage.getItem('kl-theme');t=(t==='light')?'light':'dark';if(q==='light'||q==='dark'){try{localStorage.setItem('kl-theme',t);}catch(_){}}var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#ffffff':'#000814');}catch(_){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // 기본 다크(className 에 dark) + 인라인 스크립트가 저장값이 light 면 교체. DOM 클래스가 진실원.
  return (
    <html lang="ko" suppressHydrationWarning className={`h-full dark ${inter.variable} ${grotesk.variable}`}>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <PwaRegister />
        <Header />
        <div className="flex-1 max-w-[1200px] mx-auto w-full px-4 sm:px-6 pt-4 md:pt-6">
          <NavTabs />
          {children}
        </div>
        {/* 푸터 — 모바일은 한 줄 + 접기(벽 텍스트가 매 화면 반복되지 않게), 데스크탑은 전문 */}
        <footer className="app-footer border-t border-[var(--border)] py-4 text-center text-[11px] text-[var(--text-muted)] mt-8 px-4 leading-relaxed">
          <div className="md:hidden">
            데이터 출처: 네이버 금융·KIS·KRX·DART·Bitget · 투자 참고용
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[var(--accent)] font-semibold list-none">투자 유의 · 측정 결과 보기</summary>
              <p className="mt-2 opacity-80 text-left">
                모든 분석·점수는 자동 계산 참고 정보이며 투자 권유가 아닙니다. 자체 대규모 측정에서 코인(727건 49.7% · 81건 41.7%)·주식(362건 54.1%, 진입필터 없는 대조군 54.8%보다 낮음) 모두 예측 우위가 확인되지 않았습니다 — 체크리스트로만 사용하세요. 투자 손실의 책임은 본인에게 있으며, 레버리지 상품은 원금 초과 손실이 발생할 수 있습니다.
              </p>
            </details>
          </div>
          <div className="hidden md:block">
            데이터 출처: 네이버 금융·KIS·KRX·DART·Bitget · 투자 참고용<br />
            <span className="opacity-70">
              본 서비스의 모든 분석·점수는 자동 계산 참고 정보이며 투자 권유가 아닙니다.
              <strong className="opacity-100"> 자체 대규모 측정에서 코인(727건 49.7% · 81건 41.7%)·주식(362건 54.1%, 진입필터 없는 대조군 54.8%보다 낮음) 모두 예측 우위가 확인되지 않았습니다</strong> —
              체크리스트로만 사용하세요. 투자 손실의 책임은 본인에게 있으며, 레버리지 상품은 원금 초과 손실이 발생할 수 있습니다.
            </span>
          </div>
        </footer>
        <BottomNav />
      </body>
    </html>
  );
}
