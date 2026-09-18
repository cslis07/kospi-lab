'use client';

/**
 * 전체 메뉴(페이지판) — 모바일은 앱바 ☰ 시트가 같은 내용을 띄운다. 검색·자주 쓰는·5섹션·더보기 도구 + 설정.
 * 데스크탑은 상단 알약 내비가 있으므로 이 페이지는 모바일 위주로 쓰인다.
 */
import { Suspense } from 'react';
import HomeMenu from '@/components/HomeMenu';
import ThemeToggle from '@/components/ThemeToggle';
import SyncIndicator from '@/components/SyncIndicator';
import { GUIDE } from '@/lib/menu';

function Chevron() {
  return (
    <svg className="w-4 h-4 text-[var(--text-dim)] ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function MorePage() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <Suspense fallback={<div className="skeleton h-40" />}>
          <HomeMenu />
        </Suspense>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-[var(--text-muted)] mb-2.5 uppercase tracking-wide px-1">설정 · 정보</h2>
        <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="list-row">
            <span className="text-sm font-semibold">테마</span>
            <span className="ml-auto"><ThemeToggle /></span>
          </div>
          <div className="list-row">
            <span className="text-sm font-semibold">클라우드 동기화</span>
            <span className="ml-auto"><SyncIndicator /></span>
          </div>
          <a href={GUIDE.href} className="list-row">
            <span className="text-sm font-semibold">{GUIDE.label}</span>
            <Chevron />
          </a>
        </div>
      </section>
      {/* 데이터 출처·투자 유의는 전역 푸터(접기)가 담당 — 여기서 중복하지 않는다 */}
    </div>
  );
}
