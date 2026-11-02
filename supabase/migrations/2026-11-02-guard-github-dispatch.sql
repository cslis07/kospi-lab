-- 포지션 가드 5분 실행을 Vercel(/api/guard) 대신 GitHub Actions(.github/workflows/guard.yml)로 옮긴다.
-- 이유: 5분마다 Vercel 함수가 돌아 Active CPU 를 계속 소모(월 8,640회). 공개 저장소 Actions 는 무료.
-- 로직은 그대로 lib/guard.ts(runGuard) — 발화 기록은 Supabase guard-state 공유라 중복 알림 없음.
--
-- 준비(사용자): GitHub → Settings → Developer settings → Fine-grained token
--   저장소: cslis07/kospi-lab 하나만 · 권한: Actions = Read and write (나머지 없음) · 만료일 지정
-- 실행: Supabase 대시보드 → SQL Editor 에 아래를 붙여넣고 <GITHUB_TOKEN> 자리에 토큰을 넣어 실행.
--       (토큰 값은 이 파일에 저장하지 말 것 — 저장소가 public)
-- 확인: select * from cron.job where jobname = 'kospi-lab-guard';
--       select status_code, created from net._http_response order by created desc limit 5;   -- 204 면 정상(깨우기 성공)
--       GitHub → Actions → '포지션 가드' 실행 기록이 5분마다 생기는지
-- 되돌리기: 2026-10-23-guard-cron.sql 을 다시 실행(Vercel /api/guard 호출로 복귀). /api/guard 라우트는 그대로 남아 있다.
-- 끄기: select cron.unschedule('kospi-lab-guard');

select cron.unschedule('kospi-lab-guard') where exists (select 1 from cron.job where jobname = 'kospi-lab-guard');

select cron.schedule(
  'kospi-lab-guard',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://api.github.com/repos/cslis07/kospi-lab/actions/workflows/guard.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <GITHUB_TOKEN>',
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'kospi-lab-pg-cron'
    ),
    body := jsonb_build_object('ref', 'main'),
    timeout_milliseconds := 10000
  );
  $$
);
