/**
 * 카드(기획서 §4.4) — .fin-card 래퍼 + Bento 크기·강조 변형.
 *   span: 12열 그리드(.bento) 안 데스크톱 폭(4·5·6·7·8·12) · tone: 'ai'(보라 마커) | 'emph'(경고 테두리)
 *   title/more: 카드 머리(제목 + 오른쪽 링크·상태)
 */
import type { ReactNode } from 'react';
import Link from 'next/link';

export default function Card({ span, tone, title, right, more, className = '', children }: {
  span?: 4 | 5 | 6 | 7 | 8 | 12; tone?: 'ai' | 'emph'; title?: ReactNode; right?: ReactNode;
  more?: { href: string; label?: string }; className?: string; children: ReactNode;
}) {
  return (
    <section className={`fin-card p-4 lg:p-5 ${tone ?? ''} ${span ? `b-${span}` : ''} ${className}`}>
      {(title || right || more) && (
        <div className="dash-h">
          {title && <h2>{title}</h2>}
          {right && <span className="ml-auto flex items-center gap-2">{right}</span>}
          {more && <Link href={more.href} className={`dash-more ${right ? '!ml-2' : ''}`}>{more.label ?? '전체보기'} →</Link>}
        </div>
      )}
      {children}
    </section>
  );
}
