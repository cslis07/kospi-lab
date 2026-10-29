/**
 * 홈 Quick Actions(2.0 기획서 §2·§5.1) — 매일 손이 가는 4곳을 작은 버튼 한 줄로(브리핑·코인 분석·복기·리스크 계산).
 * 항목·아이콘은 lib/menu 단일 소스(BY_HREF). 터치 높이 40px · 폰은 가로 스크롤.
 */
import Link from 'next/link';
import { BY_HREF, ICON } from '@/lib/menu';

const QUICK: [string, string][] = [['/brief', '모닝 브리핑'], ['/coin-analysis', '코인 분석'], ['/review', '매매 복기'], ['/simulate', '리스크 계산']];

export default function QuickChips() {
  return (
    <nav aria-label="빠른 이동" className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'none' }}>
      {QUICK.map(([href, label]) => {
        const it = BY_HREF.get(href);
        return (
          <Link key={href} href={href} className="btn-2nd shrink-0 min-h-[40px] px-3.5 text-[13px] font-semibold">
            <svg className="w-4 h-4 text-[var(--accent-ink)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={ICON[it?.icon ?? 'tools']} />
            </svg>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
