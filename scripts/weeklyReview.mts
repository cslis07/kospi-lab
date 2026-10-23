/**
 * 주간 복기 미리보기(로컬) — Bitget 키가 .env.local 에 있어야 한다. 발송하지 않음.
 *   npx tsx --env-file=.env.local scripts/weeklyReview.mts
 * 정시 발송은 일요일 /api/brief/telegram(모닝 브리핑 세 번째 메시지).
 */
import { weeklyReviewMessage } from '../lib/weeklyReview';

weeklyReviewMessage({ base: 'https://kospi-lab.vercel.app' })
  .then((t) => console.log(`[${t.length}자 / 4096]\n----\n${t}`))
  .catch((e) => { console.error('weeklyReview fail', e); process.exit(1); });
