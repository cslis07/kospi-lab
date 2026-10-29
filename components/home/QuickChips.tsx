/**
 * 홈 맨 위 바로가기 한 줄 — 매일 손이 가는 4곳(브리핑·코인 분석·복기·계산기 — 진입 전 비용)을 탭 깊이 없이 한 번에.
 * 항목·아이콘은 lib/menu 단일 소스(BY_HREF)에서 가져온다. 터치 영역 높이 44px.
 * side=true(홈 KPI 타일 옆): PC(≥1024)에선 넓은 줄 대신 KPI 줄 오른쪽 2×2 작은 상자, 모바일은 그대로 4칸 한 줄.
 */
import Link from 'next/link';
import { BY_HREF, ICON } from '@/lib/menu';

const QUICK: [string, string][] = [['/brief', '브리핑'], ['/coin-analysis', '코인 분석'], ['/review', '복기'], ['/simulate', '계산기']];

export default function QuickChips({ side = false }: { side?: boolean }) {
  return (
    <nav aria-label="바로가기" className={side ? 'grid grid-cols-4 gap-2 mt-3 lg:mt-0 lg:grid-cols-2 lg:w-[212px] lg:shrink-0' : 'grid grid-cols-4 gap-2 mb-3'}>
      {QUICK.map(([href, label]) => {
        const it = BY_HREF.get(href);
        return (
          <Link key={href} href={href} className="fin-card flex flex-col items-center justify-center gap-1 min-h-[56px] px-1 py-2 hover-lift">
            <svg className="w-5 h-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={ICON[it?.icon ?? 'tools']} />
            </svg>
            <span className="text-[12px] font-semibold text-[var(--text)] whitespace-nowrap">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
