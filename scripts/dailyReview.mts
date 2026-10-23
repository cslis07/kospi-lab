/**
 * 일일 매매 복기 미리보기(로컬) — Bitget 키가 .env.local 에 있어야 한다. 발송하지 않고 텍스트만 출력.
 *   npx tsx --env-file=.env.local scripts/dailyReview.mts          # 지난 24시간
 *   REVIEW_HOURS=72 npx tsx --env-file=.env.local scripts/dailyReview.mts
 * 정시 발송은 /api/brief/telegram(모닝 브리핑 두 번째 메시지).
 */
import { dailyReviewMessage } from '../lib/dailyReview';

const hours = Number(process.env.REVIEW_HOURS || 24);
dailyReviewMessage({ base: 'https://kospi-lab.vercel.app', hours })
  .then((r) => console.log(r.text ? `[${r.n}건 · ${r.text.length}자 / 4096]\n----\n${r.text}` : `지난 ${hours}시간 청산 매매 없음 — 발송 안 함`))
  .catch((e) => { console.error('dailyReview fail', e); process.exit(1); });
