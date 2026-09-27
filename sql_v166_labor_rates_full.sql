-- v166-full : 작업단가가 화면에 안 나올 때 — 표 생성 · 권한 · 자료 등록을 한 번에
-- Supabase SQL Editor 에서 통째로 실행하고, 맨 아래 SELECT 결과를 확인하세요.

-- 1) 표가 없으면 만든다 (이미 있으면 그대로)
create table if not exists public.labor_rates(
  rate_code     text primary key,       -- MF · LS · … / ASM(조립 공통) / MCH(가공 공통)
  rate_name     text,
  rate_type     text,                   -- 조립 / 가공
  rate_per_hour numeric not null default 30000,
  remark        text,
  updated_at    timestamptz default now());

-- 2) 빠진 칸이 있으면 채운다 (예전에 다른 모양으로 만들었을 때)
alter table public.labor_rates add column if not exists rate_name     text;
alter table public.labor_rates add column if not exists rate_type     text;
alter table public.labor_rates add column if not exists rate_per_hour numeric default 30000;
alter table public.labor_rates add column if not exists remark        text;
alter table public.labor_rates add column if not exists updated_at    timestamptz default now();

-- 3) 읽기/쓰기 권한 (RLS 가 켜져 있는데 정책이 없으면 화면에 아무것도 안 보입니다)
alter table public.labor_rates enable row level security;
drop policy if exists labor_rates_read  on public.labor_rates;
drop policy if exists labor_rates_write on public.labor_rates;
create policy labor_rates_read  on public.labor_rates for select using (true);
create policy labor_rates_write on public.labor_rates for all to authenticated
  using (true) with check (true);
grant select on public.labor_rates to anon, authenticated;
grant insert, update, delete on public.labor_rates to authenticated;

-- 4) 가공 단가 등록 — 모두 30,000원/h
insert into public.labor_rates (rate_code, rate_name, rate_type, rate_per_hour) values
  ('MF' ,'MF(연삭)'    ,'가공',30000),
  ('LS' ,'LS(선반)'    ,'가공',30000),
  ('MS' ,'MS(밀링小)'  ,'가공',30000),
  ('ML' ,'ML(밀링大)'  ,'가공',30000),
  ('RD' ,'RD(레디얼)'  ,'가공',30000),
  ('MCT','MCT'         ,'가공',30000),
  ('GL' ,'GL(평면연마)','가공',30000),
  ('GS' ,'GS(성형연마)','가공',30000),
  ('JIG','JIG/방전탭'  ,'가공',30000),
  ('WC' ,'WC(와이어)'  ,'가공',30000),
  ('WD' ,'WD(방전)'    ,'가공',30000),
  ('MCH','가공 공통'   ,'가공',30000),
  ('ASM','조립 공통'   ,'조립',30000)
on conflict (rate_code) do update
  set rate_name     = coalesce(public.labor_rates.rate_name, excluded.rate_name),
      rate_type     = excluded.rate_type,
      rate_per_hour = excluded.rate_per_hour;

-- 5) 확인 — 여기에 13줄이 나와야 정상입니다
select rate_code, rate_name, rate_type, rate_per_hour
  from public.labor_rates
 order by rate_type, rate_code;
