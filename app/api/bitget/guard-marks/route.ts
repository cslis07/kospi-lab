// 복기 달력 표시용 — 가드가 보낸 규율 경보(서킷브레이커·복구 매매·단타) 시각. 게이트 뒤(/api/bitget/*). 로직은 lib/guard.guardMarks.
import { NextResponse } from 'next/server';
import { guardMarks } from '@/lib/guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, marks: await guardMarks() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), marks: [] }, { status: 502 });
  }
}
