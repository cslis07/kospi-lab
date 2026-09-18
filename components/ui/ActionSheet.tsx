'use client';

/**
 * 액션 시트(⋮ 팝업 메뉴) — 행·헤더의 '더보기' 버튼이 여는 동작 목록. 바텀시트 위에 얹는다.
 * 링크 항목은 이동 후 닫고, 버튼 항목은 실행 후 닫는다. danger 는 삭제 등 되돌리기 어려운 동작.
 */
import Link from 'next/link';
import BottomSheet from './BottomSheet';
import { ICON } from '@/lib/menu';

export interface SheetAction {
  label: string;
  sub?: string;
  icon?: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  danger?: boolean;
}

function Glyph({ name }: { name?: string }) {
  if (!name || !ICON[name]) return <span className="act-ic" aria-hidden />;
  return (
    <span className="act-ic" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={ICON[name]} /></svg>
    </span>
  );
}

export default function ActionSheet({ open, onClose, title, actions }: {
  open: boolean; onClose: () => void; title?: string; actions: SheetAction[];
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="act-list">
        {actions.map((a) => {
          const inner = (
            <>
              <Glyph name={a.icon} />
              <span className="act-tx">
                <b>{a.label}</b>
                {a.sub && <small>{a.sub}</small>}
              </span>
            </>
          );
          const cls = `act-item ${a.danger ? 'danger' : ''}`;
          if (a.href && a.external) return <a key={a.label} href={a.href} target="_blank" rel="noopener noreferrer" className={cls} onClick={onClose}>{inner}</a>;
          if (a.href) return <Link key={a.label} href={a.href} className={cls} onClick={onClose}>{inner}</Link>;
          return <button key={a.label} type="button" className={cls} onClick={() => { a.onClick?.(); onClose(); }}>{inner}</button>;
        })}
      </div>
    </BottomSheet>
  );
}

/** ⋮ 버튼 */
export function KebabButton({ onClick, label = '더보기' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="kebab" onClick={onClick} aria-label={label}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="5.5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="18.5" r="1.7" /></svg>
    </button>
  );
}
