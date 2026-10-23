/**
 * 모의 선행테스트 리마인더 — 마지막 라운드에서 12시간(문서 규칙 6)이 지났으면 텔레그램으로 현재 판정과 함께 알린다.
 * .github/workflows/paper-remind.yml(하루 2회)이 실행. 판정 로직은 lib/paperJudge(손으로 고치지 않음).
 *   PAPER_DRY=1 npx tsx scripts/paperRemind.mts   # 발송 없이 문구만
 */
import { readFileSync } from 'node:fs';
import { judgeTrade, fetchHourly, remindText, type PaperLog, type Candle } from '../lib/paperJudge';

const log = JSON.parse(readFileSync('data/paper-trades.json', 'utf8')) as PaperLog;
const now = Date.now();
const coins = [...new Set(log.trades.map((t) => t.coin))];
const data = new Map<string, Candle[]>();
for (const c of coins) data.set(c, await fetchHourly(c));
const text = remindText(log, log.trades.map((t) => judgeTrade(t, data.get(t.coin)!, now)), now);
if (!text) { console.log('다음 라운드 아직 — 발송 안 함'); process.exit(0); }
if (process.env.PAPER_DRY) { console.log(text); process.exit(0); }
const token = process.env.KL_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.KL_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
if (!token || !chat) { console.log('텔레그램 미설정 — 발송 생략\n' + text); process.exit(0); }
const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
});
console.log('telegram', r.status);
if (!r.ok) process.exit(1);
