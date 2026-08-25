-- KOSPI LAB 클라우드 동기화 (2026-08-24)
-- localStorage 자산(매매일지·후보·관심종목·포트폴리오·가상투자·알림)의 기기 간 동기화 저장소.
--
-- ⚠ 이 Supabase 프로젝트는 다른 앱과 공용이므로 테이블 접두사 kl_ 을 붙인다.
-- ⚠ 접근은 서버 라우트(/api/sync)에서 service_role 키로만 한다. 그 라우트는 middleware
--    게이트(APP_ACCESS_TOKEN) 뒤에 있다. 브라우저는 이 테이블에 직접 접근하지 않는다.
--    따라서 RLS 를 켜고 정책을 두지 않는다 — anon/authenticated 로는 한 줄도 못 읽는다.

create table if not exists public.kl_sync (
  id          text primary key,              -- localStorage 키 (예: kospi-lab-coin-journal)
  data        jsonb not null,                -- 해당 키의 값
  updated_at  bigint not null,               -- 클라이언트 논리시계(ms) — 키 단위 Last-Write-Wins 비교용
  device      text,                          -- 마지막으로 올린 기기 라벨 (PC-x1y2 / 모바일-a3b4)
  synced_at   timestamptz not null default now()
);

comment on table public.kl_sync is 'KOSPI LAB 기기 간 동기화 — 키 단위 LWW. 서버 라우트(service_role)에서만 접근.';

-- 갱신 시각 자동 기록
create or replace function public.kl_sync_touch() returns trigger
language plpgsql as $$
begin
  new.synced_at = now();
  return new;
end $$;

drop trigger if exists kl_sync_touch on public.kl_sync;
create trigger kl_sync_touch before insert or update on public.kl_sync
  for each row execute function public.kl_sync_touch();

-- RLS: 켜두고 정책 없음 = service_role 외 전면 차단
alter table public.kl_sync enable row level security;
