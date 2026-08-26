/**
 * 클라우드 동기화 계층 — localStorage 를 정본으로 두고 그 위에 얹는다.
 *
 * 설계 원칙:
 *  1. **기존 훅 11개를 건드리지 않는다.** 각 훅은 지금처럼 localStorage 만 읽고 쓴다.
 *     이 계층은 바깥에서 스냅샷을 관찰(해시 비교)해 밀어 올리고, 내려받은 것을 되돌려 놓는다.
 *     → 훅 하나가 깨져도 동기화가 데이터를 망가뜨리지 않고, 서버가 죽어도 앱은 그대로 돈다.
 *  2. **오프라인 우선.** 서버 미구성·401·네트워크 실패는 전부 '조용한 비활성'이다. 앱 기능은 무손실.
 *  3. **키 단위 Last-Write-Wins.** 저널·관심종목·후보는 서로 독립이라 키별 최신본이 이긴다.
 *     (같은 키를 두 기기에서 동시에 편집하면 나중 것이 이긴다 — 개인용 단일 사용자 전제)
 *
 * 병합이 아니라 LWW 인 이유: 배열 병합은 '삭제'와 '미수신'을 구별할 수 없어 지운 항목이
 * 되살아난다. 개인용에서는 예측 가능한 LWW 가 조용한 부활보다 낫다.
 */

export const SYNC_PREFIX = 'kospi-lab-';
/** 동기화 제외 — 메타 자신과 기기별 UI 상태(탭 위치가 기기 간에 튀면 성가시다) */
export const SYNC_EXCLUDE = new Set(['kospi-lab-sync-meta', 'kospi-lab-my-stocks-tab']);
const META_KEY = 'kospi-lab-sync-meta';

export interface SyncItem { id: string; data: unknown; updatedAt: number }
export interface SyncMetaEntry { hash: string; updatedAt: number }
export type SyncMeta = Record<string, SyncMetaEntry>;

/** djb2 — 내용 변경 감지용(암호학적 용도 아님) */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function isSyncKey(k: string): boolean {
  return k.startsWith(SYNC_PREFIX) && !SYNC_EXCLUDE.has(k);
}

/**
 * 비어 있는 값인가 — 빈 배열/빈 객체/null/빈 문자열.
 *
 * 빈 값은 절대 올려보내지 않는다. 새 기기에서 앱을 한 번 열어 빈 목록이 저장되는 것만으로
 * 다른 기기의 매매일지 전체를 덮어써 지워버릴 수 있기 때문이다.
 * 그 대가로 "마지막 한 건까지 지운 것"은 다른 기기에 전파되지 않는다 —
 * 데이터가 되살아나는 불편은 되돌릴 수 있지만, 지워진 기록은 되돌릴 수 없다.
 */
export function isEmptyData(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'string') return v.trim() === '' || v.trim() === '[]' || v.trim() === '{}';
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/**
 * 첫 동기화 충돌 감지 — 이 기기에도, 서버에도 내용이 있는 키.
 *
 * 이 기기가 서버 데이터를 한 번도 받아본 적이 없다면(메타 없음) 두 쪽은 서로 다른 역사를
 * 가진 것이고, 어느 쪽이 최신인지 판단할 근거가 없다. 이럴 때 자동으로 한쪽을 밀어버리면
 * 사용자는 기록이 사라진 사실조차 모른다. 그래서 자동 진행을 멈추고 사람에게 묻는다.
 */
export function findFirstSyncConflicts(remote: SyncItem[], meta: SyncMeta): string[] {
  const local = collectLocal();
  const out: string[] = [];
  for (const it of remote) {
    if (!it?.id || meta[it.id]) continue;            // 이미 동기화 이력이 있으면 LWW 로 처리
    if (isEmptyData(it.data)) continue;               // 서버가 비었으면 충돌 아님
    const raw = local[it.id];
    if (raw == null) continue;                        // 이 기기에 없으면 그냥 받으면 된다
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
    if (isEmptyData(parsed)) continue;                // 이 기기가 비었으면 충돌 아님
    out.push(it.id);
  }
  return out;
}

export function readMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as SyncMeta) : {};
  } catch { return {}; }
}
export function writeMeta(m: SyncMeta): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch {}
}

/** 현재 localStorage 의 동기화 대상 스냅샷 (raw 문자열 그대로) */
export function collectLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !isSyncKey(k)) continue;
      const v = localStorage.getItem(k);
      if (v != null) out[k] = v;
    }
  } catch {}
  return out;
}

/**
 * 로컬 변경을 감지해 메타를 갱신하고, 올려보낼 항목을 만든다.
 * 메타가 비어 있으면(첫 실행) 전부 변경으로 보아 초기 업로드가 일어난다.
 */
export function detectLocalChanges(now = Date.now()): { items: SyncItem[]; meta: SyncMeta; changed: string[] } {
  const local = collectLocal();
  const meta = readMeta();
  const changed: string[] = [];
  const items: SyncItem[] = [];

  for (const [k, raw] of Object.entries(local)) {
    const h = hashString(raw);
    const prev = meta[k];
    if (!prev || prev.hash !== h) {
      meta[k] = { hash: h, updatedAt: now };
      changed.push(k);
    }
    let data: unknown;
    try { data = JSON.parse(raw); } catch { data = raw; }
    // 빈 값은 올려보내지 않는다 — 새 기기의 빈 목록이 다른 기기 기록을 지우는 사고를 막는다
    if (!isEmptyData(data)) items.push({ id: k, data, updatedAt: meta[k].updatedAt });
  }
  return { items, meta, changed };
}

/**
 * 서버 항목을 로컬에 반영한다. 서버가 더 최신인 키만 덮어쓴다.
 * @returns 실제로 갱신된 키 목록 (비어 있지 않으면 화면 새로고침이 필요하다 —
 *          기존 훅들은 마운트 때 한 번만 localStorage 를 읽기 때문)
 */
export function applyRemote(remote: SyncItem[], meta: SyncMeta): { applied: string[]; meta: SyncMeta } {
  const applied: string[] = [];
  for (const it of remote) {
    if (!it?.id || !isSyncKey(it.id)) continue;
    const localAt = meta[it.id]?.updatedAt ?? 0;
    if (!(it.updatedAt > localAt)) continue;
    const raw = typeof it.data === 'string' ? it.data : JSON.stringify(it.data);
    try {
      localStorage.setItem(it.id, raw);
      meta[it.id] = { hash: hashString(raw), updatedAt: it.updatedAt };
      applied.push(it.id);
    } catch {}
  }
  return { applied, meta };
}

/** 사람이 읽는 라벨 — 동기화 상태 패널에서 "무엇이 오갔는지" 보여준다 */
export const KEY_LABEL: Record<string, string> = {
  'kospi-lab-coin-journal': '코인 매매일지',
  'kospi-lab-stock-journal': '주식 매매일지',
  'kospi-lab-candidates': '성장주 후보',
  'kospi-lab-watchlist': '국내 관심종목',
  'kospi-lab-overseas-watchlist': '해외 관심종목',
  'kospi-lab-crypto-watchlist': '코인 관심종목',
  'kospi-lab-portfolio': '보유 포트폴리오',
  'kospi-lab-virtual': '가상투자',
  'kospi-lab-alerts': '주식 알림규칙',
  'kospi-lab-coin-alerts': '코인 알림규칙',
};
export const labelFor = (k: string) => KEY_LABEL[k] ?? k.replace(SYNC_PREFIX, '');
