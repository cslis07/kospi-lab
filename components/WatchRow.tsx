'use client';

/**
 * 관심종목·시세 목록의 밀도 높은 한 줄(모바일 우선).
 * [종목 배지] 이름·코드 [⋮ 박스] ······ 가격 [등락률] [분석]
 * 행 전체 탭 = 상세로 이동(router). ⋮·분석 버튼은 이벤트 전파를 막아 각자 동작.
 * 등락 알약은 한국 관행 채움색(상승=빨강·하락=파랑·보합=회색). 배지 색은 종목 문자열 해시로 고정.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const TINTS = ['tint-blue', 'tint-violet', 'tint-green', 'tint-amber', 'tint-rose', 'tint-teal', 'tint-indigo'];
export function badgeTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export default function WatchRow({
  href, title, sub, badge, price, changeRate, onMore, loading = false, analyzeHref, actions,
}: {
  href: string;
  title: string;
  sub: string;
  badge: string;
  price: string;
  changeRate: number | null | undefined;
  onMore?: () => void;
  loading?: boolean;
  /** 있으면 행 오른쪽에 '분석' 버튼(자동 실행 링크) */
  analyzeHref?: string;
  /** 있으면 종목명 바로 옆에 붙는 액션 버튼들(상세·분석·삭제 등) */
  actions?: ReactNode;
}) {
  const router = useRouter();
  const cr = changeRate ?? null;
  const dir = cr == null || cr === 0 ? 'flat' : cr > 0 ? 'up' : 'down';
  const go = () => router.push(href);
  return (
    <div className="wl-row" role="link" tabIndex={0} onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
      <span className={`wl-badge ${badgeTint(title + sub)}`} aria-hidden>{badge}</span>
      <span className="wl-name">
        <b className="truncate">{title}</b>
        <small className="truncate">{sub}</small>
      </span>
      {onMore && (
        <button type="button" className="wl-menu" aria-label={`${title} 메뉴`}
          onClick={(e) => { e.stopPropagation(); onMore(); }}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
        </button>
      )}
      {actions && (
        <span className="wl-actions" onClick={(e) => e.stopPropagation()}>{actions}</span>
      )}
      <span className="wl-tail">
        {loading ? (
          <span className="flex flex-col items-end gap-1.5">
            <span className="skeleton h-3.5 w-16" /><span className="skeleton h-5 w-[64px] rounded-md" />
          </span>
        ) : (
          <span className="wl-right">
            <b className="tabular-nums">{price}</b>
            <span className={`wl-chg ${dir} tabular-nums`}>{cr == null ? '—' : `${cr > 0 ? '+' : ''}${cr.toFixed(2)}%`}</span>
          </span>
        )}
        {analyzeHref && (
          <Link href={analyzeHref} className="wl-analyze" aria-label={`${title} 분석`} onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-3.5-3.5" /></svg>
            분석
          </Link>
        )}
      </span>
    </div>
  );
}
