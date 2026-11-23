/**
 * 데이터 백업·복원 순수 로직(KL-005) — components/BackupPanel 이 쓰고 tests/backup.test.ts 가 고정한다.
 * 형식: v2 = { version: 2, exportedAt, keys: { 'kospi-lab-…': '<문자열 그대로>' }, keyCount } · v1(하위호환) = { version: 1, watchlist, virtual, cryptoWatchlist }
 * 복원 = 키 단위 덮어쓰기(같은 파일을 두 번 복원해도 결과 동일 — 항목이 늘거나 중복되지 않음). 백업에 없는 키는 그대로 둔다.
 * 파일 전체를 먼저 검증한 뒤에만 쓴다(중간에 실패해 반쯤 덮이는 일 없음). 이 앱보다 새 형식이면 거부.
 */
export const LS_PREFIX = 'kospi-lab-';
export const BACKUP_VERSION = 2;
export const V1_KEYS = { watchlist: 'kospi-lab-watchlist', virtual: 'kospi-lab-virtual', cryptoWatchlist: 'kospi-lab-crypto-watchlist' } as const;
/**
 * 기기 고유·동기화 장부 키는 백업에서 뺀다 — 동기화 메타(해시·수정 시각)까지 복원하면 '로컬 변경 없음'으로 판정돼
 * 서버의 더 새 값이 복원 데이터를 다시 덮어썼고(복원이 조용히 무효), 다른 기기에 복원하면 기기 ID 까지 복제됐다.
 */
export const DEVICE_ONLY_KEYS = new Set(['kospi-lab-sync-meta', 'kospi-lab-device-id']);

export interface KV { length: number; key(i: number): string | null; getItem(k: string): string | null; setItem(k: string, v: string): void }

export interface BackupPlan {
  version: number;
  exportedAt: string | null;
  /** 실제로 쓸 [키, 값] — 검증 통과분만 */
  entries: [string, string][];
  /** 형식이 맞지 않아 건너뛴 항목 수 */
  skipped: number;
}

const restorable = (k: string) => k.startsWith(LS_PREFIX) && !DEVICE_ONLY_KEYS.has(k);

export function collectBackup(store: KV): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && restorable(k)) {
      const v = store.getItem(k);
      if (v !== null) out[k] = v;
    }
  }
  return out;
}

export function buildBackupPayload(keys: Record<string, string>, now = new Date()) {
  return { version: BACKUP_VERSION, exportedAt: now.toISOString(), keys, keyCount: Object.keys(keys).length };
}

/** 파일 내용 → 복원 계획. 형식이 틀리면 한국어 사유로 throw(아무것도 쓰지 않은 상태) */
export function parseBackup(text: string): BackupPlan {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('JSON 형식이 아닙니다 — KOSPI LAB 백업 파일인지 확인하세요.'); }
  if (!data || typeof data !== 'object') throw new Error('올바른 백업 파일이 아닙니다.');
  const d = data as Record<string, unknown>;
  const version = Number(d.version);
  if (!Number.isFinite(version) || version < 1) throw new Error('올바른 백업 파일이 아닙니다(버전 없음).');
  if (version > BACKUP_VERSION) throw new Error(`이 앱보다 새 형식(v${version})의 백업입니다 — 앱을 새로고침해 최신 버전으로 복원하세요.`);
  const exportedAt = typeof d.exportedAt === 'string' ? d.exportedAt : null;

  const entries: [string, string][] = [];
  let skipped = 0;
  if (version >= 2) {
    if (!d.keys || typeof d.keys !== 'object' || Array.isArray(d.keys)) throw new Error('백업 파일에 데이터(keys)가 없습니다.');
    for (const [k, v] of Object.entries(d.keys as Record<string, unknown>)) {
      if (restorable(k) && typeof v === 'string') entries.push([k, v]); else skipped++;
    }
  } else {
    for (const [field, key] of Object.entries(V1_KEYS)) {
      if (d[field] != null) entries.push([key, JSON.stringify(d[field])]);
    }
  }
  if (!entries.length) throw new Error('복원할 항목이 없습니다.');
  return { version, exportedAt, entries, skipped };
}

/** 계획대로 쓴다 — 덮어쓴 키 목록을 돌려준다(동기화 메타 정리용) */
export function applyBackup(plan: BackupPlan, store: Pick<KV, 'setItem'>): string[] {
  for (const [k, v] of plan.entries) store.setItem(k, v);
  return plan.entries.map(([k]) => k);
}

/** 복원 미리보기 — 현재 값과 다른 항목·새로 생기는 항목 수 */
export function previewBackup(plan: BackupPlan, store: Pick<KV, 'getItem'>): { total: number; changed: number; added: number } {
  let changed = 0, added = 0;
  for (const [k, v] of plan.entries) {
    const cur = store.getItem(k);
    if (cur === null) added++; else if (cur !== v) changed++;
  }
  return { total: plan.entries.length, changed, added };
}
