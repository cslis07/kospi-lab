import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '국내주식 분석',
  description: '룰엔진·투자자 수급·공시·정책·AI 브리핑으로 매수우위/중립/비중축소를 판정합니다.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
