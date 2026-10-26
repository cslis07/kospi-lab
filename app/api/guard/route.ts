import { NextRequest, NextResponse } from 'next/server';
import { runGuard } from '@/lib/guard';

/**
 * 포지션 가드 — Supabase pg_cron 이 5분마다 호출(Vercel Hobby 크론은 하루 1회·2개 한도라 못 씀).
 * 보호: Authorization: Bearer <CRON_SECRET>. ?dry=1 이면 발송·상태저장 없이 알림 목록만.
 * 로직·알림 규칙은 lib/guard.ts.
 */
export const maxDuration = 30;
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET 미설정' }, { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const r = await runGuard({ dry: req.nextUrl.searchParams.get('dry') === '1' });
    console.log(`[guard] positions=${r.positions} alerts=${r.alerts.length} sent=${r.sent}`);
    return NextResponse.json({ ...r, alerts: r.alerts.map((a) => a.key) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
