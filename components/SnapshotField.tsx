'use client';

/**
 * 매매 복기용 차트 스냅샷 필드(편집 시트 안) — 이미지 1장 첨부·썸네일·크게 보기·삭제.
 * 저장은 IndexedDB(useSnapshots). 이 기기에만 저장된다.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

export default function SnapshotField({ id, has, onSave, onRemove, onLoad }: {
  id: string;
  has: boolean;
  onSave: (id: string, file: Blob) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onLoad: (id: string) => Promise<{ url: string; w: number; h: number } | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  const setUrlSafe = (u: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = u;
    setUrl(u);
  };

  // id가 바뀌거나 이미지 유무가 바뀌면 썸네일 로드
  useEffect(() => {
    let alive = true;
    if (has) {
      onLoad(id).then((r) => { if (alive && r) setUrlSafe(r.url); }).catch(() => {});
    } else {
      setUrlSafe(null);
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, has]);

  // 언마운트 시 object URL 해제
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const pick = () => fileRef.current?.click();
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 다시 선택 가능하게
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr('이미지 파일만 첨부할 수 있어요.'); return; }
    setBusy(true); setErr(null);
    try { await onSave(id, f); const r = await onLoad(id); if (r) setUrlSafe(r.url); }
    catch (x) { setErr(x instanceof Error ? x.message : '저장 실패'); }
    finally { setBusy(false); }
  };
  const del = async () => { setBusy(true); try { await onRemove(id); setUrlSafe(null); } finally { setBusy(false); } };

  return (
    <div>
      <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5">차트 스냅샷 <span className="font-normal">· 복기용 이미지 1장(이 기기에만 저장)</span></p>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      {url ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setView(true)} className="shrink-0 rounded-lg overflow-hidden border border-[var(--border)]" aria-label="차트 이미지 크게 보기">
            {/* 로컬 blob 미리보기 — next/image 대상 아님 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="첨부한 차트" className="h-16 w-auto max-w-[140px] object-cover block" />
          </button>
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={pick} disabled={busy} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[12px] text-[var(--text-muted)] font-semibold disabled:opacity-40">교체</button>
            <button type="button" onClick={del} disabled={busy} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[12px] text-red-400 font-semibold disabled:opacity-40">삭제</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={pick} disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-[var(--border)] text-[13px] text-[var(--text-muted)] font-semibold disabled:opacity-40">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          {busy ? '저장 중…' : '차트 이미지 첨부'}
        </button>
      )}
      {err && <p className="text-[11px] text-red-400 mt-1">⚠ {err}</p>}

      {view && url && (
        <div className="fixed inset-0 z-[80] bg-black/85 grid place-items-center p-4" role="dialog" aria-modal="true" onClick={() => setView(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="첨부한 차트(크게)" className="max-h-[88vh] max-w-full object-contain rounded-lg" />
          <button type="button" onClick={() => setView(false)} aria-label="닫기"
            className="absolute top-4 right-4 w-9 h-9 grid place-items-center rounded-full bg-white/15 text-white">✕</button>
        </div>
      )}
    </div>
  );
}
