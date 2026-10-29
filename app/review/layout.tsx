import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '복기 대시보드',
  description: '비용 분석(USDT·원화)·진입·매매 횟수 달력·월별 보고서·손익 분해를 한 화면에.',
};

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
