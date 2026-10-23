import { NextRequest, NextResponse } from 'next/server';
import { sendBriefTelegram } from '@/lib/briefTelegram';
import { dailyReviewMessage } from '@/lib/dailyReview';
import { bitgetKeysConfigured } from '@/lib/bitget';

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
    // 두 번째 메시지: 지난 24시간 Bitget 청산 매매 복기(청산 0건·키 없음·실패면 보내지 않음 — 브리핑 발송엔 영향 없음)
    const review = await sendReview(dry).catch((e) => ({ ok: false, error: String(e) }));
    const code = res.skipped ? 500 : res.ok || dry ? 200 : 502;
    return NextResponse.json({ ...res, dryText: dry ? res.dryText : undefined, review }, { status: code });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

async function sendReview(dry: boolean): Promise<{ ok: boolean; n?: number; skipped?: string; error?: string; dryText?: string }> {
  if (!bitgetKeysConfigured()) return { ok: false, skipped: 'Bitget 키 없음' };
  const { text, n } = await dailyReviewMessage({ base: BASE, hours: 24 });
  if (!text) return { ok: true, n: 0, skipped: '청산 매매 없음' };
  if (dry) return { ok: true, n, dryText: text };
  const token = process.env.KL_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.KL_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { ok: false, skipped: '토큰/채팅 미설정' };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: !!(body as { ok?: boolean }).ok, n };
}
