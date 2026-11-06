import { NextRequest, NextResponse } from 'next/server';
import { nfAllowed } from '@/lib/nf';
import { loadNf } from '@/lib/nfLoad';
import { PRIVATE } from '@/lib/cdn';

/**
 * Nowflation 여러 파일을 한 번에 — /inflation 대시보드가 파일 12개를 따로 불러 함수가 12번 돌던 것(콜드 1.4~1.5초씩)을 1번으로.
 * GET /api/nf/bundle?n=pulse.json,compare_daily.json,…  → { "pulse.json": {...} | null, … }
 * 게이트(middleware '/api/nf/:path*') 뒤 · 개별 라우트와 같은 로더(상류 6h 캐시 → seed 폴백) · 브라우저만 30분(private).
 */
export const maxDuration = 15;
const MAX_FILES = 16;

export async function GET(req: NextRequest) {
  const names = [...new Set((req.nextUrl.searchParams.get('n') ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
  if (!names.length || names.length > MAX_FILES || !names.every(nfAllowed)) {
    return NextResponse.json({ error: '허용되지 않은 파일 목록' }, { status: 400 });
  }
  const out: Record<string, unknown> = {};
  await Promise.all(names.map(async (n) => {
    const body = await loadNf(n);
    try { out[n] = body == null ? null : JSON.parse(body); } catch { out[n] = null; }
  }));
  return NextResponse.json(out, { headers: { 'Cache-Control': PRIVATE(1800) } });
}
