/**
 * 홈 맨 위 바로가기 한 줄 — 매일 손이 가는 4곳(브리핑·코인 분석·매매일지·계산기 — 진입 전 비용)을 탭 깊이 없이 한 번에.
 * 항목·아이콘은 lib/menu 단일 소스(BY_HREF)에서 가져온다. 터치 영역 높이 44px.
 */
import Link from 'next/link';
import { BY_HREF, ICON } from '@/lib/menu';

const QUICK: [string, string][] = [['/brief', '브리핑'], ['/coin-analysis', '코인 분석'], ['/journal', '매매일지'], ['/simulate', '계산기']];

export default function QuickChips() {
  return (
    <nav aria-label="바로가기" className="grid grid-cols-4 gap-2 mb-3">
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
