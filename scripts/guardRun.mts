// 포지션 가드 1회 실행 — GitHub Actions(.github/workflows/guard.yml)용. 로직·알림 규칙은 lib/guard.ts(= /api/guard 와 같음).
// 실행 주기는 Supabase pg_cron 이 5분마다 이 워크플로를 workflow_dispatch 로 깨운다(supabase/migrations/2026-11-02-guard-github-dispatch.sql).
// Vercel 함수 대신 여기서 돌리는 이유: 5분 주기 호출이 Vercel Active CPU 를 계속 쓰고(월 8,640회), 공개 저장소 Actions 는 무료.
// 발화 기록은 Supabase guard-state 를 공유하므로 /api/guard·coin-track 과 같은 알림을 두 번 보내지 않는다.
import { runGuard } from '../lib/guard.ts';

const dry = process.argv.includes('--dry');
const r = await runGuard({ dry });
console.log(`guard ok=${r.ok}${r.skipped ? ` skipped=${r.skipped}` : ''} positions=${r.positions} alerts=${r.alerts.length} sent=${r.sent} stateSaved=${r.stateSaved}`);
if (!r.ok && !r.skipped) process.exit(1);
