import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { AUTH_COOKIE } from '@/middleware';

/**
 * 브라우저에 인증 쿠키를 심는다. 두 가지 경로:
 *  - GET  `/api/unlock?token=<APP_ACCESS_TOKEN>&next=/bitget` → 쿠키 설정 후 리다이렉트 (URL 방식)
 *  - POST `{ token }` (JSON) → 쿠키 설정 후 JSON 응답 (잠금 화면의 입력 폼용)
 * 설정되면 /api/bitget/*, /api/analyze 요청에 쿠키가 자동으로 실린다.
 *
 * 토큰 추측을 막기 위해 IP당 5분에 5회로 제한한다.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
};

/** next 파라미터는 오픈 리다이렉트 방지를 위해 내부 절대경로만 허용 */
function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/bitget';
}

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

  const res = NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get('next')), req.url));
  res.cookies.set(AUTH_COOKIE, secret, cookieOpts);
  return res;
}

export async function POST(req: NextRequest) {
  const gate = rateLimit(`unlock:${clientIp(req)}`, 5, 5 * 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: `시도 횟수를 초과했습니다. ${gate.retryAfter}초 후 다시 시도하세요.` },
      { status: 429, headers: { 'retry-after': String(gate.retryAfter) } },
    );
  }

  const secret = process.env.APP_ACCESS_TOKEN ?? '';
  let given = '';
  try {
    const body = await req.json();
    given = String(body?.token ?? '').trim();
  } catch { /* 빈 본문 → 인증 실패로 처리 */ }

  if (!secret) {
    return NextResponse.json({ ok: false, error: '서버에 토큰이 설정되지 않았습니다.' }, { status: 503 });
  }
  if (given !== secret) {
    return NextResponse.json({ ok: false, error: '토큰이 올바르지 않습니다.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, secret, cookieOpts);
  return res;
}
