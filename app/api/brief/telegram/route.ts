import { NextRequest, NextResponse } from 'next/server';
import { sendBriefTelegram } from '@/lib/briefTelegram';

// 모닝 브리핑 텔레그램 발송 — Vercel 크론(vercel.json crons, 매일 07:30 KST)이 호출.
// GitHub Actions 크론은 수 시간 지각하므로 정시성은 Vercel 크론으로. (GitHub 발송 스텝은 제거됨)
export const maxDuration = 60;
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

const BASE = process.env.BRIEF_BASE || 'https://kospi-lab.vercel.app';

export async function GET(req: NextRequest) {
  // 보호: CRON_SECRET 설정 시 Vercel 크론의 Authorization: Bearer <CRON_SECRET> 만 허용.
  // (미설정이면 아무나 그룹에 발송할 수 있으므로 거부 — 설정은 사용자 몫)
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET 미설정 — Vercel 환경변수에 추가 후 사용' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const res = await sendBriefTelegram({
      base: BASE,
      token: process.env.KL_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
      chat: process.env.KL_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID,
      dry,
    });
    const code = res.skipped ? 500 : res.ok || dry ? 200 : 502;
    return NextResponse.json({ ...res, dryText: dry ? res.dryText : undefined }, { status: code });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
