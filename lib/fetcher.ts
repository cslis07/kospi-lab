/**
 * SWR 공용 fetcher — 실패를 삼키지 않는다.
 *
 * 기존 `fetch(url).then(r => r.json())` 는 non-2xx 도 그대로 통과시키고,
 * 504(HTML 응답)에서는 r.json() 이 reject 되는데 호출부가 SWR 의 error 를
 * 읽지 않아 **직전 성공 데이터가 현재 판정처럼 남는** 문제가 있었다.
 * 분석 결과는 주문 근거로 쓰이므로 실패를 반드시 화면에 노출해야 한다.
 */
export class ApiError extends Error {
  status: number;
  /** 미들웨어 인증 게이트에 막힌 경우(401/503) */
  locked: boolean;
  constructor(status: number, message: string, locked = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.locked = locked;
  }
}

export async function jsonFetcher(url: string) {
  const res = await fetch(url);

  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`;
    let locked = false;
    try {
      const body = await res.json();
      if (body?.error) message = String(body.error);
      locked = Boolean(body?.locked);
    } catch {
      // HTML 오류 페이지(게이트웨이 타임아웃 등) — 상태코드로 안내
      if (res.status === 504) message = '분석이 시간 내에 끝나지 않았습니다 (서버 30초 제한). AI 브리핑이 느릴 때 발생합니다.';
      else if (res.status >= 500) message = `서버 오류 (HTTP ${res.status})`;
    }
    throw new ApiError(res.status, message, locked);
  }

  return res.json();
}

/**
 * 게이트 API(/api/bitget·/api/nf·분석 등)용 — 401(잠금)만 예전처럼 본문을 데이터로 돌려준다({ locked: true, … }).
 * 화면들이 `data?.locked` 로 잠금 안내(UnlockGate)를 띄우기 때문에 그 경로는 그대로 두고,
 * 그 밖의 실패(5xx·HTML 오류 페이지)는 jsonFetcher 처럼 예외로 — SWR 이 직전 값을 유지하고 error 로 알린다(KL-012 후속).
 * 401 이면 이 탭은 잠김으로 기억한다(lib/unlockHint — 다른 게이트 호출을 줄인다).
 */
export async function gatedJsonFetcher(url: string) {
  const res = await fetch(url);
  if (res.status === 401) {
    try { (await import('./unlockHint')).markLocked(); } catch { /* 서버·테스트 환경 무시 */ }
    let body: Record<string, unknown> = {};
    try { body = await res.json(); } catch { /* 본문 없음 */ }
    return { ...body, locked: true };
  }
  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`;
    try { const b = await res.json(); if (b?.error) message = String(b.error); } catch { if (res.status >= 500) message = `서버 오류 (HTTP ${res.status})`; }
    throw new ApiError(res.status, message, false);
  }
  return res.json();
}
