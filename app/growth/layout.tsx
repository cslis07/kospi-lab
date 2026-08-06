import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '성장주 발굴',
  description: 'PER·PEG·성장률·애널리스트 컨센서스 기반 성장주·기대주 스캔 — KRX 시총 상위 종목 점수화',
};

export default function GrowthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
