-- v167 : 제작계획등록 — 엑셀(제번관리) 항목 추가
-- Supabase SQL Editor 에서 한 번만 실행하세요. (두 번 실행해도 안전)

alter table public.sales_plans
  -- 기본정보
  add column if not exists drawing_no       text,     -- 도번
  add column if not exists make_type        text,     -- 제작구분 (신규제작 / 수정 / 추가 …)
  add column if not exists material_spec    text,     -- 재질·두께 (GI 2.0T)
  add column if not exists size_spec        text,     -- 사이즈 (W150 · P46)
  add column if not exists customer_contact text,     -- 고객담당 (이름·연락처)
  add column if not exists design_partner   text,     -- 설계처
  add column if not exists maker_name       text,     -- 제작처
  add column if not exists mass_vendor      text,     -- 양산처
  add column if not exists image_url        text,     -- 제품 형상 그림
  -- 금형제작 EVENT : 목표(접수) — 나머지 목표는 기존 컬럼 사용
  --   설계=design_end_date, 가공=machining_end_date, 조립=assembly_end_date,
  --   초품=s1_planned_date, 완료=delivery_planned_date
  add column if not exists receipt_date        date,
  -- 요구일정 (고객 요구)
  add column if not exists req_receipt_date    date,
  add column if not exists req_design_date     date,
  add column if not exists req_machining_date  date,
  add column if not exists req_assembly_date   date,
  add column if not exists req_tryout_date     date,
  add column if not exists req_complete_date   date,
  -- 가능일정 (현재 예상)
  add column if not exists can_receipt_date    date,
  add column if not exists can_design_date     date,
  add column if not exists can_machining_date  date,
  add column if not exists can_assembly_date   date,
  add column if not exists can_tryout_date     date,
  add column if not exists can_complete_date   date,
  -- 진척현황 [{d:'2026-07-31', t:'제작접수/도면협의'}, …] · 특기사항
  add column if not exists progress_log     jsonb default '[]'::jsonb,
  add column if not exists remark           text;

-- 확인
-- select job_no, drawing_no, make_type, receipt_date, can_design_date, progress_log
--   from public.sales_plans order by row_no desc limit 5;

-- ────────────────────────────────────────────────────────────────
-- 제작계획등록 화면의 옛 배치(배치편집으로 저장한 입력칸 폭·위치)를 지웁니다.
-- 화면 구조가 바뀌어 옛 배치가 새 표를 찌그러뜨릴 수 있습니다. 한 번만 실행하세요.
-- ────────────────────────────────────────────────────────────────
delete from public.ui_layout where page = 'sales_plan_input';
