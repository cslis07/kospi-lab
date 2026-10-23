-- 포지션 가드 5분 실행 — Supabase pg_cron + pg_net 이 /api/guard 를 호출한다(lib/guard.ts).
-- 이유: GitHub 크론은 '15분' 설정인데 실제 3~5시간 간격이라 1~4시간짜리 매매가 끝난 뒤에야 감시했다.
--       Vercel Hobby 크론은 하루 1회·2개 한도(이미 꽉 참).
--
-- 실행: Supabase 대시보드 → SQL Editor 에서 아래를 붙여넣고, <CRON_SECRET> 자리에 Vercel 의 CRON_SECRET 값을 넣어 실행.
--       (값은 이 파일에 저장하지 말 것 — 저장소가 public)
-- 확인: select * from cron.job where jobname = 'kospi-lab-guard';
--       select status_code, created from net._http_response order by created desc limit 5;   -- 200 이면 정상
-- 끄기: select cron.unschedule('kospi-lab-guard');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('kospi-lab-guard') where exists (select 1 from cron.job where jobname = 'kospi-lab-guard');

select cron.schedule(
  'kospi-lab-guard',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://kospi-lab.vercel.app/api/guard',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 30000
  );
  $$
);
