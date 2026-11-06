import { NextRequest, NextResponse } from 'next/server';
import { nfAllowed } from '@/lib/nf';
import { loadNf } from '@/lib/nfLoad';
import { PRIVATE } from '@/lib/cdn';

/**
 * Nowflation 공개 데이터(CC BY 4.0) 중계 라우트. middleware 로 게이트(개인 전용).
 * - 상류 fetch 성공 → 그대로 반환(Next Data Cache 6h, `?refresh=1` 은 무캐시).
 * - 실패 → `seed/nf/` 스냅샷 폴백(next.config outputFileTracingIncludes 로 함수에 포함).
 * - 게이트 뒤라 CDN 공유 캐시 금지(withCdn 쓰지 말 것) — 브라우저만 30분 보관(private), `?refresh=1` 은 no-store.
 *   매 요청 함수 실행을 줄이려는 것(상류 데이터는 6시간 단위로만 바뀜).
 */
export const maxDuration = 15;

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string[] }> }) {
  const { name: segs } = await params;
  const name = (segs ?? []).join('/');
  if (!nfAllowed(name)) {
    return NextResponse.json({ error: '허용되지 않은 파일' }, { status: 404 });
  }

  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  const body = await loadNf(name, refresh);
  if (body == null) {
    return NextResponse.json({ error: '데이터 없음' }, { status: 404 });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': refresh ? 'no-store' : PRIVATE(1800),
    },
  });
}
