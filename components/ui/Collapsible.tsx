/**
 * 접기/펼치기 카드 — 모바일에서 부가 정보(재무·공시·배당 등)를 제목만 남기고 숨긴다.
 * 네이티브 <details> 라 JS 없이 동작하고 키보드·스크린리더 접근성이 기본 제공된다.
 * 데이터가 없으면 호출 컴포넌트가 null 을 반환해 카드째 사라지게 한다(빈 접힘 카드 방지).
 */
import type { ReactNode } from 'react';

export default function Collapsible({
  title, sub, right, defaultOpen = false, children,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="clp" open={defaultOpen}>
      <summary>
        <span className="clp-t">{title}</span>
        {sub && <span className="clp-s">{sub}</span>}
        <span className="flex-1" />
        {right}
        <svg className="clp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="clp-body">{children}</div>
    </details>
  );
}
