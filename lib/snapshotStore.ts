/**
 * 매매 복기용 차트 스냅샷 이미지 저장소 — 참고: Edgewonk·TradingView.
 * 이미지는 용량이 커 localStorage에 못 넣으므로 **IndexedDB**에 둔다. 이 기기에만 저장되며 클라우드 동기화에 포함하지 않는다.
 * 매매(positionId) 하나당 이미지 1장(새로 넣으면 교체). 브라우저 전용 — 서버/SSR에서는 호출하지 않는다.
 */

const DB = 'kospi-lab-snapshots';
const STORE = 'img';

export interface SnapshotRecord { id: string; blob: Blob; w: number; h: number; ts: number }

function hasIDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

/** 이미지 파일을 긴 변 maxPx로 축소한 JPEG로 변환(용량·IndexedDB 절약) */
export async function downscaleImage(file: Blob, maxPx = 1280, quality = 0.82): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  let w = bmp.width, h = bmp.height;
  const scale = Math.min(1, maxPx / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bmp.close(); throw new Error('canvas 2d 컨텍스트를 만들 수 없습니다'); }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('이미지 변환 실패');
  return { blob, w, h };
}

export async function putSnapshot(id: string, file: Blob): Promise<void> {
  if (!hasIDB()) throw new Error('이 브라우저는 IndexedDB를 지원하지 않습니다');
  const { blob, w, h } = await downscaleImage(file);
  await tx('readwrite', (s) => s.put({ id, blob, w, h, ts: Date.now() } as SnapshotRecord));
}

export async function getSnapshot(id: string): Promise<SnapshotRecord | null> {
  if (!hasIDB()) return null;
  const r = await tx<SnapshotRecord | undefined>('readonly', (s) => s.get(id) as IDBRequest<SnapshotRecord | undefined>);
  return r ?? null;
}

export async function deleteSnapshot(id: string): Promise<void> {
  if (!hasIDB()) return;
  await tx('readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>);
}

/** 이미지가 있는 positionId 목록(행 표식·개수용) */
export async function listSnapshotIds(): Promise<string[]> {
  if (!hasIDB()) return [];
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  return keys.map(String);
}
