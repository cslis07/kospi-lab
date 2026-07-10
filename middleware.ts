import { NextRequest, NextResponse } from 'next/server';

/**
 * 민감 라우트 게이트 — 내 거래소 계좌(/api/bitget/*)와 과금 라우트(/api/analyze).
 * 시세·분석 페이지는 공개 유지.
 *
 * 통과 조건: 쿠키 kl_auth 또는 헤더 x-app-token 이 APP_ACCESS_TOKEN 과 일치.
 * 쿠키는 /api/unlock?token=... 방문 시 발급된다.
 */

export const AUTH_COOKIE = 'kl_auth';

/** 길이 노출은 감수하되 내용 비교는 조기 종료하지 않는다 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const secret = process.env.APP_ACCESS_TOKEN ?? '';

  if (!secret) {
    // 토큰 미설정 시 프로덕션은 잠금(fail-closed), 로컬은 통과
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();
    return NextResponse.json(
      { locked: true, error: 'APP_ACCESS_TOKEN이 설정되지 않았습니다.' },
      { status: 503 },
    );
  }

  const presented =
    req.cookies.get(AUTH_COOKIE)?.value ?? req.headers.get('x-app-token') ?? '';

  if (presented && timingSafeEqual(presented, secret)) return NextResponse.next();

  return NextResponse.json({ locked: true, error: '인증이 필요합니다.' }, { status: 401 });
}

export const config = {
  matcher: ['/api/bitget/:path*', '/api/analyze'],
};
