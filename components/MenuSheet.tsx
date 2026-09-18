'use client';

/**
 * 전체 메뉴 시트 — 앱바 ☰ 가 연다. 5섹션 전체 + 보조 도구(더보기) + 설정(테마·동기화·가이드).
 * 하단 탭이 섹션 이동을 맡으므로 여기는 '모든 화면으로 가는 지도' 역할만 한다.
 */
import { Suspense } from 'react';
import BottomSheet from './ui/BottomSheet';
import HomeMenu from './HomeMenu';
import ThemeToggle from './ThemeToggle';
import SyncIndicator from './SyncIndicator';
import { GUIDE } from '@/lib/menu';

export default function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="전체 메뉴" full>
      <Suspense fallback={<div className="skeleton h-48" />}>
        <HomeMenu onNavigate={onClose} />
      </Suspense>

      <h3 className="text-[11px] font-semibold text-[var(--text-muted)] mt-7 mb-2.5 uppercase tracking-wide">설정 · 정보</h3>
      <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="list-row">
          <span className="text-sm font-semibold">테마</span>
          <span className="ml-auto"><ThemeToggle /></span>
        </div>
        <div className="list-row">
          <span className="text-sm font-semibold">클라우드 동기화</span>
          <span className="ml-auto"><SyncIndicator /></span>
        </div>
        <a href={GUIDE.href} className="list-row" onClick={onClose}>
          <span className="text-sm font-semibold">{GUIDE.label}</span>
          <svg className="w-4 h-4 text-[var(--text-dim)] ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
        </a>
      </div>
    </BottomSheet>
  );
}
