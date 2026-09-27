-- v169 : 조립실적등록(격자형) — 공정 「랩핑,조립」 을 기준정보 가공공정에 보장
-- Supabase SQL Editor 에서 한 번만 실행 (두 번 실행해도 안전)
insert into public.processes (process_code, process_name, sort_order)
select 'AS', '랩핑,조립', coalesce((select max(sort_order) from public.processes),0)+10
where not exists (select 1 from public.processes where process_name like '%랩핑%' or process_name like '%래핑%');

-- 조립 작업단가 (없으면 ASM 30,000 이 쓰인다 — 공정코드별 단가를 두려면 아래 주석 해제)
-- insert into public.labor_rates (rate_code, rate_type, rate_per_hour)
-- select 'AS', '조립', 30000 where not exists (select 1 from public.labor_rates where rate_code='AS');

-- design_results 에 source 열이 없으면 (v162 미실행 시)
alter table public.design_results add column if not exists source text;
alter table public.design_results add column if not exists remark text;

-- ── 검사실적등록(격자형) ─────────────────────────────────────────
-- 기준정보 가공공정에 「검사」 보장 (엑셀 열에 이미 있으면 그 코드를 이름으로 찾아 씀)
insert into public.processes (process_code, process_name, sort_order)
select 'IN', '검사', coalesce((select max(sort_order) from public.processes),0)+20
where not exists (select 1 from public.processes where process_name like '%검사%');

-- 작업단가 : 검사 공통 INS (조립 COM/ASM 과 같은 방식). 이미 있으면 건너뜀
insert into public.labor_rates (rate_code, rate_name, rate_type, rate_per_hour, remark)
select 'INS', '검사 공통', '검사', 30000, '검사실적등록 기본 단가'
where not exists (select 1 from public.labor_rates where rate_code='INS');

-- ── 설계실적등록(격자형) ─────────────────────────────────────────
insert into public.processes (process_code, process_name, sort_order)
select 'DS', '설계', coalesce((select max(sort_order) from public.processes),0)+30
where not exists (select 1 from public.processes where process_name like '%설계%');
insert into public.labor_rates (rate_code, rate_name, rate_type, rate_per_hour, remark)
select 'DSN', '설계 공통', '설계', 30000, '설계실적등록 기본 단가'
where not exists (select 1 from public.labor_rates where rate_code='DSN');
