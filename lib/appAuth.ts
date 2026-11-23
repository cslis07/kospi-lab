/**
 * 라우트 안에서 한 번 더 하는 접근 확인(KL-003 다층 방어) — middleware 게이트와 같은 규칙.
 * middleware matcher 에서 경로가 빠지거나 바뀌어도 개인 데이터 라우트가 스스로 401 을 내도록 한다.
 * 규칙: 쿠키 kl_auth 또는 헤더 x-app-token 이 APP_ACCESS_TOKEN 과 일치. 토큰 미설정이면 로컬만 통과(프로덕션 잠금, fail-closed).
 */
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE, timingSafeEqual } from '@/middleware';

export function isAuthorizedRequest(req: NextRequest): boolean {
  const secret = process.env.APP_ACCESS_TOKEN ?? '';
  if (!secret) return process.env.NODE_ENV !== 'production';
  const presented = req.cookies.get(AUTH_COOKIE)?.value ?? req.headers.get('x-app-token') ?? '';
  return !!presented && timingSafeEqual(presented, secret);
}

/** 개인 응답 공통 헤더 — CDN·공유 캐시 금지 */
export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;
