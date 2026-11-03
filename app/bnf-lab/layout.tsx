import type { Metadata } from 'next';

// 브라우저 탭·방문 기록·화면 낭독기용 제목(루트 템플릿 '%s | KOSPI LAB')
export const metadata: Metadata = { title: 'BNF형 이격도 연구' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
