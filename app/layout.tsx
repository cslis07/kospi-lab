import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'KOSPI LAB — 한국 주식 실시간 시세',
  description: '한국 주식 실시간 시세 대시보드. 관심 종목 추가 및 뉴스 소식 확인.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--text-muted)]">
          데이터 출처: 네이버 금융 · 5초 간격 갱신 · 투자 참고용
        </footer>
      </body>
    </html>
  );
}
