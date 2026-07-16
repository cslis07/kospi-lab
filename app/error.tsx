'use client';

import { useEffect } from 'react';

/** 라우트 크래시 시 흰 화면 대신 복구 UI (외부 API가 예상 못한 형태를 줄 때 등) */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[page-error]', error); }, [error]);
  return (
    <div className="max-w-md mx-auto mt-24 rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
      <p className="text-3xl mb-3">⚠️</p>
      <h2 className="text-base font-bold text-[var(--text)] mb-2">화면을 그리다 문제가 생겼습니다</h2>
      <p className="text-xs text-[var(--text-muted)] mb-5 leading-relaxed">
        일시적인 데이터 오류일 수 있습니다. 다시 시도해 보세요.
        {error.digest && <span className="block mt-1 opacity-60">오류 코드: {error.digest}</span>}
      </p>
      <div className="flex items-center justify-center gap-2">
        <button onClick={reset}
          className="px-4 py-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40 text-sm font-semibold">
          다시 시도
        </button>
        <a href="/" className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
          홈으로
        </a>
      </div>
    </div>
  );
}
