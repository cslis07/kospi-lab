import { NextRequest, NextResponse } from 'next/server';

/**
 * 민감 라우트 게이트 — 내 거래소 계좌(/api/bitget/*), AI 과금 라우트(/api/analyze,
 * /api/stock-analysis, /api/coin-analysis), 디버그 라우트(/api/debug/*).
 * 시세·차트·뉴스 등 값싼 공개 라우트와 페이지 자체는 공개 유지.
 *
 * ⚠ 분석 라우트를 잠근 이유: 두 라우트는 요청당 Anthropic 을 무조건 호출한다(실과금).
 *   저장소가 public 이라 엔드포인트가 알려져 있어 무인증이면 크레딧 소진 유도가 가능하다.
 *   → 잠금 시 분석 페이지는 401 을 받고 "잠금 해제" 안내를 띄운다(UnlockGate).
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
  matcher: [
    '/api/bitget/:path*',    // 내 거래소 계좌
    '/api/analyze',          // 레거시 AI 라우트
    '/api/stock-analysis',   // Anthropic 실과금 — 공개 시 크레딧 소진 유도 가능
    '/api/coin-analysis',    // 동일
    '/api/debug/:path*',     // 디버그 — 요청당 상류 8콜(증폭)
    '/api/sync',             // 내 매매일지·포트폴리오 원본 — 개인 데이터라 반드시 게이트
  ],
  // ⚠ /api/kis/price 는 StockDetailModal 이 쓰므로 /api/kis/:path* 로 묶지 말 것
};
