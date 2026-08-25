import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';
import NavTabs from '@/components/NavTabs';

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
          <span className="opacity-70">
            본 서비스의 모든 분석·점수는 자동 계산 참고 정보이며 투자 권유가 아닙니다.
            <strong className="opacity-100"> 자체 대규모 측정에서 코인(727건 49.7% · 81건 41.7%)·주식(362건 54.1%, 진입필터 없는 대조군 54.8%보다 낮음) 모두 예측 우위가 확인되지 않았습니다</strong> —
            체크리스트로만 사용하세요. 투자 손실의 책임은 본인에게 있으며, 레버리지 상품은 원금 초과 손실이 발생할 수 있습니다.
          </span>
        </footer>
      </body>
    </html>
  );
}
