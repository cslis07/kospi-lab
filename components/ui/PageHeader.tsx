/**
 * 페이지 머리(기획서 §4.2·P1) — 제목(26~30px) · 한 줄 설명 · 오른쪽 상태/동작 자리.
 * 이 컴포넌트를 쓰는 화면은 본문이 <h1>을 가지므로 lib/menu OWN_H1_ROUTES 에 경로를 넣어야 한다(headings 테스트).
 */
import type { ReactNode } from 'react';

export default function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-h">
      <div className="min-w-0">
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-act">{actions}</div>}
    </div>
  );
}
