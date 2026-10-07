/**
 * 모닝 브리핑 텔레그램 발송 — 수동/미리보기용 얇은 래퍼. 로직은 lib/briefTelegram.ts 공용.
 *
 * 정시 발송은 Vercel 크론(vercel.json crons → /api/brief/telegram)이 담당한다(GitHub 크론은 수 시간 지각).
 * 이 스크립트는 미리보기(BRIEF_TG_DRY=1)·수동 발송용으로 남겨 둔다.
 *   BRIEF_TG_DRY=1 npx tsx scripts/briefTelegram.mts   # 토큰 없이 메시지만 출력
 *
 * 토큰: KL_TELEGRAM_BOT_TOKEN||TELEGRAM_BOT_TOKEN · KL_TELEGRAM_CHAT_ID||TELEGRAM_CHAT_ID.
 */
import { sendBriefTelegram } from '../lib/briefTelegram';

const BASE = process.env.BRIEF_BASE || 'https://kospi-lab.vercel.app';
const DRY = !!process.env.BRIEF_TG_DRY;

async function main() {
  const res = await sendBriefTelegram({
    base: BASE,
    token: process.env.KL_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
    chat: process.env.KL_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID,
    dry: DRY,
  });
  if (DRY) { console.log(`[DRY] ${res.len}자 (한도 4096)\n----\n${res.dryText}\n----`); return; }
  if (res.skipped) { console.log(`telegram: ${res.skipped} — 발송 생략`); return; }
  console.log(`telegram: ${res.status} ok=${res.ok} · ${res.len}자`);
  if (!res.ok) process.exit(1);
}

main().catch((e) => { console.error('briefTelegram fail', e); process.exit(1); });
