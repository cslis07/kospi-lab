import InflationNav from '@/components/inflation/InflationNav';

/** /inflation 허브 공통 레이아웃 — 서브내비 + 가운데 정렬 컨테이너(각 페이지는 컨테이너를 다시 감싸지 않는다). */
export default function InflationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto pb-12">
      <InflationNav />
      {children}
    </div>
  );
}
