/**
 * 관심종목·시세 목록의 밀도 높은 한 줄(모바일 우선).
 * [종목 배지] 이름·코드 ········ 가격 [등락률 알약] [⋮]
 * 등락 알약은 한국 관행 채움색(상승=빨강·하락=파랑·보합=회색). 배지 색은 종목 문자열 해시로 고정.
 */
import Link from 'next/link';
import { KebabButton } from './ui/ActionSheet';

const TINTS = ['tint-blue', 'tint-violet', 'tint-green', 'tint-amber', 'tint-rose', 'tint-teal', 'tint-indigo'];
export function badgeTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export default function WatchRow({
  href, title, sub, badge, price, changeRate, onMore, loading = false,
}: {
  href: string;
  title: string;
  sub: string;
  badge: string;
  price: string;
  changeRate: number | null | undefined;
  onMore?: () => void;
  loading?: boolean;
}) {
  const cr = changeRate ?? null;
  const dir = cr == null || cr === 0 ? 'flat' : cr > 0 ? 'up' : 'down';
  return (
    <div className="wl-row">
      <Link href={href} className="wl-main">
        <span className={`wl-badge ${badgeTint(title + sub)}`} aria-hidden>{badge}</span>
        <span className="wl-name">
          <b className="truncate">{title}</b>
          <small className="truncate">{sub}</small>
        </span>
        {loading ? (
          <span className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="skeleton h-3.5 w-16" /><span className="skeleton h-5 w-[64px] rounded-md" />
          </span>
        ) : (
          <span className="wl-right">
            <b className="tabular-nums">{price}</b>
            <span className={`wl-chg ${dir} tabular-nums`}>{cr == null ? '—' : `${cr > 0 ? '+' : ''}${cr.toFixed(2)}%`}</span>
          </span>
        )}
      </Link>
      {onMore && <KebabButton onClick={onMore} label={`${title} 메뉴`} />}
    </div>
  );
}
