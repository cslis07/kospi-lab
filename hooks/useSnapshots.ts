'use client';

/**
 * 매매 복기용 차트 스냅샷(IndexedDB) 훅 — 어떤 매매에 이미지가 있는지(ids)와 저장·삭제·로드.
 * 이미지는 이 기기에만 저장된다(클라우드 동기화 제외).
 */
import { useCallback, useEffect, useState } from 'react';
import { listSnapshotIds, putSnapshot, deleteSnapshot, getSnapshot } from '@/lib/snapshotStore';

export function useSnapshots() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(async () => {
    try { setIds(new Set(await listSnapshotIds())); } catch { /* 무시 */ }
  }, []);

  useEffect(() => { setMounted(true); void refresh(); }, [refresh]);

  const save = useCallback(async (id: string, file: Blob) => {
    await putSnapshot(id, file);
    setIds((prev) => new Set(prev).add(id));
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteSnapshot(id);
    setIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }, []);

  /** 이미지 blob을 object URL로 — 쓰고 나면 호출부가 URL.revokeObjectURL 할 것 */
  const load = useCallback(async (id: string): Promise<{ url: string; w: number; h: number } | null> => {
    const rec = await getSnapshot(id);
    if (!rec) return null;
    return { url: URL.createObjectURL(rec.blob), w: rec.w, h: rec.h };
  }, []);

  return { ids, mounted, save, remove, load, refresh };
}
