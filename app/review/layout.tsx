import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '복기 대시보드',
  description: '일별 진입·매매 횟수, 손익 분해, 비용 분석, 수수료 진단 — 복기에 꼭 필요한 4가지만 한 화면에.',
};

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
