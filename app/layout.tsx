import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';
import NavTabs from '@/components/NavTabs';

export const metadata: Metadata = {
  metadataBase: new URL('https://kospi-lab.vercel.app'),
  title: { default: 'KOSPI LAB — 주식·코인 투자 분석', template: '%s | KOSPI LAB' },
  description: '국내주식·코인선물 룰엔진 분석, 백테스트, 실시간 시세 대시보드.',
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

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col">
        <Header />
        <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-6">
          <NavTabs />
          {children}
        </div>
        <footer className="border-t border-[var(--border)] py-4 text-center text-[11px] text-[var(--text-muted)] mt-8 px-4 leading-relaxed">
          데이터 출처: 네이버 금융·KIS·KRX·DART·Bitget · 투자 참고용<br />
          <span className="opacity-70">본 서비스의 모든 분석·신호는 자동 계산 참고 정보이며 투자 권유가 아닙니다. 투자 손실의 책임은 본인에게 있으며, 레버리지 상품은 원금 초과 손실이 발생할 수 있습니다.</span>
        </footer>
      </body>
    </html>
  );
}
