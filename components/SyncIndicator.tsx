'use client';

/**
 * 헤더 동기화 표시등 — 상태를 숨기지 않는다.
 * 동기화는 "됐겠지"로 두면 안 되는 기능이라(안 된 걸 모르면 한쪽 기기 기록이 조용히 갈라진다)
 * 미구성·잠금·실패를 각각 다른 색과 문구로 드러낸다.
 */

import { useState } from 'react';
import { useCloudSync } from '@/hooks/useCloudSync';

const STYLE: Record<string, { dot: string; label: string }> = {
  init:    { dot: 'bg-gray-500',                    label: '확인 중' },
  syncing: { dot: 'bg-sky-400 animate-pulse',       label: '동기화 중' },
  synced:  { dot: 'bg-emerald-400',                 label: '동기화됨' },
  off:     { dot: 'bg-gray-600',                    label: '로컬 전용' },
  locked:  { dot: 'bg-amber-400',                   label: '잠금' },
  error:   { dot: 'bg-red-400',                     label: '동기화 실패' },
};

function ago(ts: number | null): string {
  if (!ts) return '-';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  return `${Math.round(s / 3600)}시간 전`;
}

export default function SyncIndicator() {
  const s = useCloudSync();
  const [open, setOpen] = useState(false);
  const st = STYLE[s.status] ?? STYLE.init;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="pill-shadow flex items-center gap-1.5 text-xs border border-[var(--border)] rounded-full px-2.5 py-1 bg-[var(--pill-bg)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        title={`클라우드 동기화: ${st.label}`}
        aria-label={`클라우드 동기화 상태 ${st.label}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
        <span className="hidden sm:inline">{st.label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 w-72 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl p-3 text-left">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-[var(--text)]">클라우드 동기화</p>
              <span className="text-[10px] text-[var(--text-muted)]">{s.device}</span>
            </div>

            {s.status === 'off' && (
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                <strong className="text-[var(--text)]">로컬 전용으로 동작 중</strong>입니다. 매매일지·관심종목·후보가 이 기기에만 저장됩니다.
                서버에 <code className="text-[10px]">SUPABASE_URL</code>·<code className="text-[10px]">SUPABASE_SERVICE_ROLE_KEY</code>를
                넣으면 기기 간 자동 동기화가 켜집니다.
              </p>
            )}
            {s.status === 'locked' && (
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                잠금 상태라 동기화가 멈춰 있습니다. <strong className="text-[var(--text)]">/bitget</strong> 페이지에서 접근 토큰을 1회 입력하면 켜집니다.
              </p>
            )}
            {s.status === 'error' && (
              <p className="text-[11px] leading-relaxed text-red-400">동기화 실패: {s.error}</p>
            )}
            {(s.status === 'synced' || s.status === 'syncing') && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-[var(--text-muted)]">마지막 동기화 <strong className="text-[var(--text)]">{ago(s.lastSyncAt)}</strong></p>
                {s.pulled.length > 0 && (
                  <p className="text-[11px] text-emerald-400">↓ 내려받음: {s.pulled.join(', ')}</p>
                )}
                {s.pushed.length > 0 && (
                  <p className="text-[11px] text-sky-400">↑ 올림: {s.pushed.join(', ')}</p>
                )}
                {!s.pulled.length && !s.pushed.length && (
                  <p className="text-[11px] text-[var(--text-muted)]">변경 없음 — 모든 기기가 같은 상태입니다.</p>
                )}
              </div>
            )}

            <button
              onClick={() => { s.syncNow(); }}
              className="mt-2.5 w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[11px] text-[var(--text)] hover:border-sky-500/40 transition-colors"
            >
              지금 동기화
            </button>
            <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
              키 단위로 <strong className="text-[var(--text)]">최신본이 이깁니다</strong>. 같은 항목을 두 기기에서 동시에 고치면 나중에 저장한 쪽이 남습니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
