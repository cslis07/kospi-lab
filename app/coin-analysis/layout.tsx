import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '코인선물 분석',
  description: '다중 타임프레임 룰엔진·파생 수급·오더북·진입 플랜·레버리지 계산 — BTC·ETH·XRP·SOL.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
