-- v161 : 사내가공 체크 저장 + 사내가공 실적(가공시간)
-- Supabase SQL Editor 에서 한 번만 실행하세요.

-- 1) 가공계획 부품행에 '사내' 체크 저장 칸
--    steps(공정 목록)와 같은 순서의 true/false 배열입니다.
alter table public.machining_plan_parts add column if not exists inhouse jsonb default '[]'::jsonb;

-- 기준공정에도 같은 칸 (기준공정에서 사내 여부를 미리 정해 두는 경우)
alter table public.machining_standard_routes add column if not exists inhouse jsonb default '[]'::jsonb;

-- 2) 사내가공 실적이 들어가는 design_results 에 필요한 칸 (없으면 추가)
alter table public.design_results add column if not exists machining_process_code text;
alter table public.design_results add column if not exists machining_process_name text;
alter table public.design_results add column if not exists equipment_code text;
alter table public.design_results add column if not exists work_minutes  numeric;
alter table public.design_results add column if not exists headcount     integer;
alter table public.design_results add column if not exists hourly_rate   numeric;
alter table public.design_results add column if not exists labor_cost    numeric;

-- 3) 같은 제번+공정+품번이 두 줄로 생기지 않도록 (이미 있으면 그대로 둡니다)
do $$
begin
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and indexname='machining_plan_parts_uk') then
    create unique index machining_plan_parts_uk
      on public.machining_plan_parts (job_no, process_code, part_no);
  end if;
exception when others then
  raise notice '중복 행이 있어 유니크 인덱스를 만들지 못했습니다. 아래로 중복을 먼저 확인하세요.';
end $$;

-- 중복 확인용
-- select job_no, process_code, part_no, count(*)
--   from public.machining_plan_parts
--  group by 1,2,3 having count(*) > 1;

-- 4) 확인
-- select column_name from information_schema.columns
--  where table_name='machining_plan_parts' and column_name='inhouse';
