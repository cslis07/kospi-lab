/**
 * 포지션 가드 수동 실행·미리보기 — 로직은 lib/guard.ts(정시 실행은 Supabase pg_cron → /api/guard, 5분).
 *   GUARD_DRY=1 npx tsx --env-file=.env.local scripts/guard.mts   # 발송·상태저장 없이 알림 목록만
 */
import { runGuard } from '../lib/guard';

const dry = !!process.env.GUARD_DRY;
runGuard({ dry })
  .then((r) => {
    console.log(`positions=${r.positions} alerts=${r.alerts.length} sent=${r.sent} stateSaved=${r.stateSaved}${r.skipped ? ` skipped=${r.skipped}` : ''}`);
    for (const a of r.alerts) console.log(`--- ${a.key}\n${a.text}`);
  })
  .catch((e) => { console.error('guard fail', e); process.exit(1); });
