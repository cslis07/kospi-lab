import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';

/**
 * 브라우저에 인증 쿠키를 심는다. `/api/unlock?token=<APP_ACCESS_TOKEN>` 한 번 방문하면
 * 이후 /api/bitget/*, /api/analyze 요청에 쿠키가 자동으로 실린다.
 *
 * 토큰 추측을 막기 위해 IP당 5분에 5회로 제한한다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = rateLimit(`unlock:${clientIp(req)}`, 5, 5 * 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: '시도 횟수를 초과했습니다.' },
      { status: 429, headers: { 'retry-after': String(gate.retryAfter) } },
    );
  }

  const secret = process.env.APP_ACCESS_TOKEN ?? '';
  const given = req.nextUrl.searchParams.get('token') ?? '';

  if (!secret || given !== secret) {
    return NextResponse.json({ ok: false, error: '토큰이 올바르지 않습니다.' }, { status: 401 });
  }

  const res = NextResponse.redirect(new URL('/bitget', req.url));
  res.cookies.set('kl_auth', secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
