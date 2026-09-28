import type { Metadata } from 'next';
import TodayRisk from '@/components/home/TodayRisk';

export const metadata: Metadata = {
  title: '오늘의 리스크',
  description: '오늘 더 매매해도 되는가 — 서킷브레이커·오늘 실현손익·연속 손절·미청산·7일 내 고영향 이벤트.',
};

export default function TodayPage() {
  return (
    <div className="max-w-lg mx-auto pb-10">
      <TodayRisk />
    </div>
  );
}
