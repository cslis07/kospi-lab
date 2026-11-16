/**
 * 새 배포 감지 — 배포 전에 열어 둔 탭·설치 앱이 옛 화면(옛 JS)에 머무는 문제(2026-11-11 '지금 내 상태' 카드).
 *
 * 방식: 빌드할 때 정한 버전(커밋 SHA → 없으면 배포 ID)을 ① 클라이언트 코드에 박고 ② 정적 파일 /version.json 으로 낸다
 * (force-static — 빌드 때 한 번 만들어 CDN 이 내준다, 함수 실행 없음). 화면 이동·앱으로 돌아올 때(5분 간격)
 * /version.json 을 받아 비교하고, 다르면 '다음 화면 이동'을 전체 새로고침으로 바꿔 새 코드를 받게 한다.
 * 같은 새 버전으로는 탭 세션당 한 번만 새로고침한다(값이 계속 달라도 무한 새로고침 금지).
 * 순수 함수만 — 브라우저 연결은 components/VersionWatcher.
 */

export const CHECK_GAP_MS = 5 * 60_000;
export const RELOADED_KEY = 'kl-reloaded-for';

/** 빌드 버전 — next.config 의 env 로 박힌 값(로컬 개발은 빈 문자열 → 감시 안 함) */
export const BUILD_VERSION = process.env.NEXT_PUBLIC_KL_BUILD ?? '';

export function shouldCheck(lastCheckMs: number, nowMs: number, gapMs = CHECK_GAP_MS): boolean {
  return nowMs - lastCheckMs >= gapMs;
}

/** /version.json 응답 → 버전 문자열(모양이 틀리면 null) */
export function parseVersion(raw: unknown): string | null {
  const v = (raw as { v?: unknown } | null)?.v;
  return typeof v === 'string' && v.length >= 4 && v.length <= 80 ? v : null;
}

export type Decision = 'same' | 'stale' | 'blocked' | 'off';
/**
 * current: 이 화면 코드의 버전, latest: 서버의 지금 버전, reloadedFor: 이 탭이 이미 새로고침한 대상 버전.
 * stale = 다음 이동을 새로고침으로. blocked = 같은 버전으로 이미 한 번 새로고침했는데도 다름(캐시 등) → 더 하지 않음.
 */
export function decide(current: string, latest: string | null, reloadedFor: string | null): Decision {
  if (!current || !latest) return 'off';
  if (latest === current) return 'same';
  return reloadedFor === latest ? 'blocked' : 'stale';
}

export interface ClickLike {
  button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean;
}
export interface AnchorLike { href: string; target: string; hasDownload: boolean }

/**
 * 이 클릭을 '전체 새로고침 이동'으로 바꿔도 되는가 — 같은 사이트 안 다른 화면으로 가는 평범한 왼쪽 클릭만.
 * 새 탭·다운로드·외부 주소·같은 화면 안 #앵커는 건드리지 않는다.
 */
export function isPlainInternalNav(e: ClickLike, a: AnchorLike, location: { origin: string; pathname: string; search: string }): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.hasDownload || (a.target && a.target !== '_self')) return false;
  let u: URL;
  try { u = new URL(a.href, location.origin); } catch { return false; }
  if (u.origin !== location.origin) return false;
  if (u.pathname.startsWith('/api/')) return false;
  if (u.pathname === location.pathname && u.search === location.search) return false; // 같은 화면(#앵커 포함)
  return true;
}
