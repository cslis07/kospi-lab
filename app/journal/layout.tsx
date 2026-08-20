import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '매매일지 성적표',
  description: '코인·주식 매매일지의 실제 승률·기대값·R 분포·실현손익 실측. 엔진 점수가 아니라 내 실제 성적을 본다.',
};

export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
