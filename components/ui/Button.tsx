/**
 * 버튼 4종 중 3종(기획서 §4.3) — 스타일은 globals.css(.btn-3d · .btn-2nd · .btn-icon), 여기는 얇은 래퍼.
 *  · Primary3D: '분석 실행'·'리스크 계산'·'저장' 같은 주요 동작에만. 아랫면 3px 그림자, 누르면 내려앉음.
 *  · SecondaryElevated: 설정·보기 전환 등 보조 동작.
 *  · IconButton: 검색·알림·테마·접기 — 44×44 터치 영역, aria-label 필수(툴팁 = title).
 * 네 번째 SegmentedControl 은 ./Segmented. 시세 필터·랭킹·차트 기간은 3D 금지(평면 세그먼트).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Btn = ButtonHTMLAttributes<HTMLButtonElement>;

export function Primary3D({ className = '', type = 'button', ...p }: Btn) {
  return <button type={type} className={`btn-3d px-4 min-h-[44px] text-[14px] ${className}`} {...p} />;
}

export function SecondaryElevated({ className = '', type = 'button', ...p }: Btn) {
  return <button type={type} className={`btn-2nd px-3.5 min-h-[40px] text-[13px] ${className}`} {...p} />;
}

export function IconButton({ label, children, className = '', type = 'button', ...p }: Btn & { label: string; children: ReactNode }) {
  return <button type={type} aria-label={label} title={label} className={`btn-icon ${className}`} {...p}>{children}</button>;
}
