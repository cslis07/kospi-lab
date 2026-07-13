'use client';

import { useState } from 'react';

/**
 * 잠긴 페이지에서 토큰을 붙여넣어 브라우저를 인증하는 폼.
 * POST /api/unlock 으로 쿠키를 설정하고, 성공 시 페이지를 새로고침한다.
 */
export default function UnlockGate() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    if (!t || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        // 쿠키가 심어졌으니 새로고침하면 계좌 데이터가 실린다
        window.location.reload();
        return;
      }
      setError(j.error ?? '인증에 실패했습니다.');
    } catch {
      setError('요청을 보내지 못했습니다. 잠시 후 다시 시도하세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-5">
      <p className="text-sm font-semibold text-sky-400 mb-2">🔒 잠긴 페이지입니다</p>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">
        계좌 잔고는 본인만 볼 수 있습니다. 접근 토큰을 입력해 이 브라우저를 인증하세요.
        한 번 인증하면 이 기기에서 1년간 유지됩니다.
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="접근 토큰 (APP_ACCESS_TOKEN)"
          autoComplete="off"
          className="flex-1 min-w-[200px] px-3 py-1.5 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-[var(--text)] outline-none focus:border-sky-500/50"
        />
        <button
          type="submit"
          disabled={busy || !token.trim()}
          className="px-4 py-1.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? '인증 중…' : '인증'}
        </button>
      </form>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      <p className="text-[10px] text-[var(--text-muted)] mt-2.5">
        토큰은 배포 시 설정한 <code className="text-sky-400">APP_ACCESS_TOKEN</code> 값입니다.
      </p>
    </div>
  );
}
