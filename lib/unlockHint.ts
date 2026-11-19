/**
 * 잠금 해제 '힌트' — 잠긴 기기(잠금 해제 안 한 브라우저)가 게이트 API 를 불러 401 콘솔 오류를 남기지 않게.
 *  - 인증 쿠키(kl_auth)는 httpOnly 라 화면 코드가 못 읽는다 → 비밀이 아닌 표시 쿠키 kl_unlocked=1 을 따로 둔다.
 *    잠금 해제(/api/unlock), 인증된 게이트 요청(middleware), 확인 주소(/api/unlock/status)가 심는다.
 *  - 표시 쿠키가 없는 기기(예전에 잠금 해제한 기기 포함)는 탭마다 한 번 /api/unlock/status 로 확인한다 — 게이트 밖이라 401 이 아니라
 *    {unlocked:false} 를 200 으로 받는다(콘솔 오류 없음).
 *  - 이 쿠키는 보안 수단이 아니다(지어내도 서버 게이트는 그대로 401). 부를지 말지 고르는 데만 쓴다.
 *  - 쿠키가 있어도 이번 탭에서 401 을 받았으면(토큰 교체 등) 그 탭에서는 더 부르지 않는다.
 *  - 쿠키 없이 '잠김'으로 적은 탭이 그 뒤 잠금 해제하면(같은 탭에서 토큰 주소·입력 폼) 쿠키가 생긴 것을 보고 '잠김'을 지운다.
 */
export const UNLOCK_HINT_COOKIE = 'kl_unlocked';
const LOCKED_KEY = 'kl-locked';

function hasHint(): boolean {
  return typeof document !== 'undefined' && document.cookie.split(/;\s*/).includes(`${UNLOCK_HINT_COOKIE}=1`);
}
/** '1' = 표시 쿠키 없을 때 잠김 확인, 'h' = 쿠키가 있는데도 401(토큰 교체 등) */
function lockedThisTab(): boolean {
  try {
    const v = sessionStorage.getItem(LOCKED_KEY);
    if (!v) return false;
    if (v === '1' && hasHint()) { sessionStorage.removeItem(LOCKED_KEY); return false; }   // 그 뒤 이 탭에서 잠금 해제함
    return true;
  } catch { return false; }
}

/** 브라우저에서만 — 확인 요청 없이 지금 아는 것만으로 게이트 API 를 불러 볼 만한가 */
export function mayBeUnlocked(): boolean {
  if (typeof document === 'undefined' || lockedThisTab()) return false;
  return hasHint();
}

/** 401 을 받았을 때 — 이 탭에서는 더 부르지 않는다 */
export function markLocked(): void {
  try { sessionStorage.setItem(LOCKED_KEY, hasHint() ? 'h' : '1'); } catch { /* 무시 */ }
}

let probe: Promise<boolean> | null = null;
/** 표시 쿠키가 없으면 탭당 한 번 서버에 확인(여러 컴포넌트가 불러도 요청은 하나) */
export function probeUnlocked(): Promise<boolean> {
  if (typeof document === 'undefined' || lockedThisTab()) return Promise.resolve(false);
  if (hasHint()) return Promise.resolve(true);
  probe ??= fetch('/api/unlock/status', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { unlocked: false }))
    .then((j: { unlocked?: boolean }) => { if (!j.unlocked) markLocked(); return !!j.unlocked; })
    .catch(() => false);
  return probe;
}

/** 잠금 해제에 성공했을 때(입력 폼) — 이 탭의 '잠김' 표시와 확인 결과를 지운다 */
export function clearLocked(): void {
  try { sessionStorage.removeItem(LOCKED_KEY); } catch { /* 무시 */ }
  probe = null;
}
