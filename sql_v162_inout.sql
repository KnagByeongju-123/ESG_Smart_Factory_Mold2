-- v162 : 사내외가공 등록 화면
-- Supabase SQL Editor 에서 한 번만 실행하세요.

-- 이 화면이 만든 행을 구분하는 표시 (다른 화면에서 넣은 값과 섞이지 않게)
alter table public.order_lines        add column if not exists source text;
alter table public.design_results     add column if not exists source text;
alter table public.partlist_materials add column if not exists source text;

-- 화면이 자주 찾는 조합 (없으면 만들어 둡니다 — 조회가 빨라집니다)
create index if not exists design_results_job_part_idx
  on public.design_results (job_no, part_no, machining_process_code);
create index if not exists order_lines_job_part_idx
  on public.order_lines (job_no, part_no, machining_process_code);

-- 확인
-- select job_no, part_no, machining_process_code, work_minutes, labor_cost, source
--   from public.design_results where source = '사내외가공' order by job_no, part_no;
-- select job_no, part_no, category, machining_process_code, confirm_price, source
--   from public.order_lines where source = '사내외가공' order by job_no, part_no;
