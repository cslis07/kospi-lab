'use client';

/**
 * 새 배포 감시 — 열어 둔 탭·설치 앱이 배포 뒤에도 옛 코드에 머무는 문제를 막는다(lib/appVersion).
 *  - 화면을 보고 있는 동안 5분마다, 앱으로 돌아올 때, 화면을 옮길 때 /version.json(정적 파일)과 내 버전을 비교.
 *  - 새 버전이면: 다음 링크 클릭은 전체 이동(새 HTML·JS)으로, 링크가 아닌 이동(router.push)은 이동 직후 새로고침.
 *  - 같은 새 버전으로는 탭당 한 번만 새로고침(무한 새로고침 방지). 로컬 개발(버전 없음)에서는 아무것도 안 한다.
 * 화면에 아무것도 그리지 않는다.
 */
import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { pollingIdle } from './PollingGovernor';
import { BUILD_VERSION, RELOADED_KEY, CHECK_GAP_MS, decide, isPlainInternalNav, parseVersion, shouldCheck } from '@/lib/appVersion';

export default function VersionWatcher() {
  const pathname = usePathname();
  const stale = useRef<string | null>(null);      // 새 버전(있으면)
  const lastCheck = useRef(0);
  const firstPath = useRef(true);

  const check = useCallback(async (force = false) => {
    if (!BUILD_VERSION || stale.current) return;
    const now = Date.now();
    if (!force && !shouldCheck(lastCheck.current, now)) return;
    lastCheck.current = now;
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (!res.ok) return;
      const latest = parseVersion(await res.json());
      let reloadedFor: string | null = null;
      try { reloadedFor = sessionStorage.getItem(RELOADED_KEY); } catch { /* 저장소 막힘 */ }
      if (decide(BUILD_VERSION, latest, reloadedFor) === 'stale') stale.current = latest;
    } catch { /* 오프라인 등 — 다음에 다시 */ }
  }, []);

  const markReload = () => {
    try { if (stale.current) sessionStorage.setItem(RELOADED_KEY, stale.current); } catch { /* 무시 */ }
  };

  // 링크 클릭 → 새 버전이 있으면 Next 의 화면 안 이동 대신 브라우저 전체 이동(새 코드)
  useEffect(() => {
    if (!BUILD_VERSION) return;
    const onClick = (e: MouseEvent) => {
      if (!stale.current) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      if (!isPlainInternalNav(e, { href: a.href, target: a.target, hasDownload: a.hasAttribute('download') }, window.location)) return;
      markReload();
      e.stopPropagation(); // React(=Next Link)까지 가지 않게 — 기본 동작(전체 이동)은 그대로
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', onVisible);
    // 주기 확인은 보고 있는 화면만(숨긴 탭·10분 무입력이면 쉼 — 복귀 때 visibilitychange·이동 때 다시 확인)
    const id = setInterval(() => { if (!pollingIdle()) void check(); }, CHECK_GAP_MS);
    lastCheck.current = Date.now(); // 막 받은 화면은 최신으로 본다
    return () => { window.removeEventListener('click', onClick, true); document.removeEventListener('visibilitychange', onVisible); clearInterval(id); };
  }, [check]);

  // 링크가 아닌 이동(router.push 등) — 이동 직후 새 버전이면 그 화면을 새로고침
  useEffect(() => {
    if (firstPath.current) { firstPath.current = false; return; }
    if (!BUILD_VERSION) return;
    void (async () => {
      await check();
      if (stale.current) { markReload(); window.location.reload(); }
    })();
  }, [pathname, check]);

  return null;
}
