import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, timingSafeEqual } from '@/middleware';
import { UNLOCK_HINT_COOKIE } from '@/lib/unlockHint';

/**
 * 이 브라우저가 잠금 해제돼 있는가 — 게이트 밖(401 대신 200 {unlocked}) 이라 잠긴 기기에서도 콘솔 오류가 나지 않는다.
 * 해제돼 있으면 화면용 표시 쿠키(kl_unlocked=1, 비밀 아님)를 심어 다음부터는 이 확인도 건너뛰게 한다(lib/unlockHint).
 * 개인 데이터는 주지 않는다. 표시 쿠키가 없는 기기만 탭당 한 번 부른다.
 */
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const secret = process.env.APP_ACCESS_TOKEN ?? '';
  const presented = req.cookies.get(AUTH_COOKIE)?.value ?? req.headers.get('x-app-token') ?? '';
  // 토큰 미설정: 로컬은 게이트가 통과시키므로 해제로 본다, 프로덕션은 게이트가 잠그므로 잠금
  const unlocked = secret ? !!presented && timingSafeEqual(presented, secret) : process.env.NODE_ENV !== 'production';
  const res = NextResponse.json({ unlocked }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (unlocked) res.cookies.set(UNLOCK_HINT_COOKIE, '1', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return res;
}
