-- 태진다이텍(TJD) DB 보강 스크립트 — IPTK 화면 교체에 필요한 테이블·컬럼·함수만 추가
-- Supabase(jgvikmakenpllwxwdugk) SQL Editor 에서 한 번 실행. 기존 데이터는 지우지 않습니다.
-- 제외: v161_cost_view_check(조회용), v165_std01·v166_labor_rates(IPTK 기준공정·단가 데이터)

-- ════════ sql_v159_shape_image.sql ════════
-- v159 : PartList 형태(사각·환봉) + 부품 이미지
-- Supabase SQL Editor 에서 한 번만 실행하세요.

-- 1) 컬럼 추가
alter table public.partlist_materials add column if not exists shape     text;
alter table public.partlist_materials add column if not exists image_url text;
alter table public.partlist_purchases add column if not exists image_url text;
alter table public.order_lines        add column if not exists shape     text;

-- 2) partlist_all 뷰에 형태·이미지 노출 (뷰가 select * 가 아니면 아래를 실행)
--    ※ 현재 뷰 정의를 먼저 확인하세요:
--      select pg_get_viewdef('public.partlist_all'::regclass, true);
--    확인한 정의의 컬럼 목록에 아래 두 줄을 각각 추가해 CREATE OR REPLACE VIEW 로 다시 만듭니다.
--      원재료 쪽 : m.shape, m.image_url
--      구매품 쪽 : null::text as shape, p.image_url
--    (뷰를 고치지 않아도 화면은 원본 테이블에서 형태·이미지를 자동으로 보충합니다.)

-- 3) 이미지 저장소 (Storage) — 버킷이 없으면 생성 + 공개 읽기
insert into storage.buckets (id, name, public)
values ('mes-attach', 'mes-attach', true)
on conflict (id) do update set public = true;

-- 업로드는 로그인 사용자만, 읽기는 공개
drop policy if exists "mes_attach_read"   on storage.objects;
drop policy if exists "mes_attach_write"  on storage.objects;
drop policy if exists "mes_attach_update" on storage.objects;

create policy "mes_attach_read" on storage.objects
  for select using (bucket_id = 'mes-attach');

create policy "mes_attach_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'mes-attach');

create policy "mes_attach_update" on storage.objects
  for update to authenticated using (bucket_id = 'mes-attach');

-- ════════ sql_v160_drawing_bucket.sql ════════
-- v160 : 도면 파일을 Supabase 에 보관 (비공개 버킷 + 서명 URL)
-- Supabase SQL Editor 에서 한 번만 실행하세요.

-- 1) 비공개 버킷 생성 (public=false → 주소를 직접 쳐도 열리지 않음)
insert into storage.buckets (id, name, public, file_size_limit)
values ('mes-drawing', 'mes-drawing', false, 20971520)   -- 20MB
on conflict (id) do update
  set public = false, file_size_limit = 20971520;

-- 2) 권한 : 로그인한 사용자만 읽기/올리기. 비로그인(anon)은 아무것도 못 함.
drop policy if exists "mes_drawing_read"   on storage.objects;
drop policy if exists "mes_drawing_write"  on storage.objects;
drop policy if exists "mes_drawing_update" on storage.objects;
drop policy if exists "mes_drawing_delete" on storage.objects;

-- 읽기(서명 URL 발급에 필요)
create policy "mes_drawing_read" on storage.objects
  for select to authenticated using (bucket_id = 'mes-drawing');

-- 올리기
create policy "mes_drawing_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'mes-drawing');

-- 덮어쓰기(같은 도면 재업로드)
create policy "mes_drawing_update" on storage.objects
  for update to authenticated using (bucket_id = 'mes-drawing');

-- 삭제는 막아 둡니다. 필요하면 아래 주석을 푸세요.
-- create policy "mes_drawing_delete" on storage.objects
--   for delete to authenticated using (bucket_id = 'mes-drawing');

-- 3) 확인
-- select id, public, file_size_limit from storage.buckets where id = 'mes-drawing';
--   → public 이 false 여야 정상입니다.

-- 참고
--  · drawings.file_url 에는 "sb:dwg/<제번>/<도면번호>_<시각>.pdf" 형식으로 저장됩니다.
--  · [📐 도면] 을 누를 때마다 5분짜리 임시 주소를 새로 발급받아 엽니다.
--  · 사내 서버 주소(http://…)를 그대로 쓰던 도면도 계속 열립니다 (혼용 가능).

-- ════════ sql_v161_inhouse.sql ════════
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

-- ════════ sql_v162_inout.sql ════════
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

-- ════════ sql_v166_labor_rates_full.sql ════════
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

-- ════════ sql_v167_plan_event.sql ════════
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

-- ════════ sql_v169_asm.sql ════════
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

-- ════════ sql_v170_mail.sql ════════
-- v170 : 발주서 메일 — 협력업체 이메일·담당자, 메일 발송 기록
alter table public.vendors add column if not exists email text;
alter table public.vendors add column if not exists contact_name text;

create table if not exists public.mail_log (
  id bigint generated by default as identity primary key,
  kind text, category text, vendor_name text, job_no text,
  to_addr text, subject text, sent_by text, lines int,
  created_at timestamptz default now()
);
alter table public.mail_log enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='mail_log' and policyname='mail_log_all') then
    create policy mail_log_all on public.mail_log for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────
-- 메일 실제 발송은 Edge Function  mes-mail  이 구글(Gmail SMTP)로 보냅니다. (supabase/functions/mes-mail/index.ts)
-- 1) 구글 계정(발신용, 예: order@회사도메인) › 보안 › 2단계 인증 켜기 › 「앱 비밀번호」 생성 (16자리)
-- 2) PC 에서 한 번 :
--      npm i -g supabase
--      supabase login
--      supabase link --project-ref jgvikmakenpllwxwdugk
--      supabase secrets set GMAIL_USER=order@회사도메인 GMAIL_APP_PASSWORD=앱비밀번호16자리 MAIL_FROM_NAME="IPTK MES"
--      supabase functions deploy mes-mail --no-verify-jwt
-- 함수가 없으면 화면은 자동으로 메일 앱(mailto)으로 열립니다.
-- ────────────────────────────────────────────────────────────────

-- ════════ sql_v178_receive_cancel.sql ════════
-- v178 : 사내외가공 발주 — 입고취소(회차·전체) · 완료(입고확정) 취소
-- Supabase SQL Editor 에서 한 번만 실행하세요. (여러 번 실행해도 안전)
--
-- 왜 필요한가
--   종전 입고취소는 order_lines 만 '발주'로 되돌려서, 분할입고 원장(outsourcing_moves)의
--   입고 회차가 그대로 남았다. 다시 입고하면 fn_osp_receive 가 원장 합계로 잔량을 계산해
--   "누적 입고가 발주수량을 초과합니다" 오류가 났다. 이제 취소는 원장까지 같이 정리한다.

/* ── 1. 회차 1건 취소 (기존 함수 보강: 확정 정보도 함께 지운다) ───────── */
create or replace function public.fn_osp_receive_cancel(
  p_line_id bigint,
  p_move_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_ord numeric;
  v_new numeric;
  v_del bigint;
begin
  select coalesce(nullif(order_qty, 0), 1) into v_ord
    from public.order_lines where line_id = p_line_id;
  if not found then
    raise exception '발주라인 %를 찾을 수 없습니다.', p_line_id;
  end if;

  select move_id into v_del
    from public.outsourcing_moves
   where line_id = p_line_id and io in ('입고', '사내입고')
     and (p_move_id is null or move_id = p_move_id)
   order by move_date desc, move_id desc
   limit 1;

  if v_del is null then
    raise exception '취소할 입고 기록이 없습니다.';
  end if;

  delete from public.outsourcing_moves where move_id = v_del;

  select coalesce(sum(coalesce(in_qty, 0) + coalesce(short_qty, 0)), 0)
    into v_new
    from public.outsourcing_moves
   where line_id = p_line_id and io in ('입고', '사내입고');

  update public.order_lines
     set receipt_qty   = nullif(v_new, 0),
         receipt_date  = null,
         status        = '발주',
         confirm_date  = null,
         confirm_price = null,
         nego_rate     = null,
         updated_at    = now()
   where line_id = p_line_id;

  return jsonb_build_object('canceled_move', v_del, 'in_qty', v_new,
                            'open_qty', greatest(v_ord - v_new, 0));
end $$;

/* ── 2. 입고 전체취소 (신규) : 입고 회차 전부 삭제 → 발주 상태 · 확정 정보 삭제 ── */
create or replace function public.fn_osp_receive_cancel_all(
  p_line_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_ord numeric;
  v_cnt integer;
begin
  select coalesce(nullif(order_qty, 0), 1) into v_ord
    from public.order_lines where line_id = p_line_id;
  if not found then
    raise exception '발주라인 %를 찾을 수 없습니다.', p_line_id;
  end if;

  delete from public.outsourcing_moves
   where line_id = p_line_id and io in ('입고', '사내입고');
  get diagnostics v_cnt = row_count;

  update public.order_lines
     set receipt_qty   = null,
         receipt_date  = null,
         status        = '발주',
         confirm_date  = null,
         confirm_price = null,
         nego_rate     = null,
         updated_at    = now()
   where line_id = p_line_id;

  return jsonb_build_object('canceled_moves', v_cnt, 'in_qty', 0, 'open_qty', v_ord);
end $$;

grant execute on function public.fn_osp_receive_cancel(bigint, bigint)
  to authenticated, service_role;
grant execute on function public.fn_osp_receive_cancel_all(bigint)
  to authenticated, service_role;

/* ── 3. 확인 ─────────────────────────────────────────────────────── */
-- select proname from pg_proc where proname like 'fn_osp_receive%';
-- 예상: fn_osp_receive, fn_osp_receive_cancel, fn_osp_receive_cancel_all

-- ════════ sql_v230_set_outsourcing.sql ════════
-- v230 : 영업관리 › SET외주 (설계외주와 같은 형식 — 관리제번 단위 발주·입고·현황)
-- Supabase SQL Editor 에서 한 번만 실행하세요. (여러 번 실행해도 안전)
--
-- 구성
--   발주   : order_lines  category = '외주SET'  (설계외주 = '외주설계' 와 같은 표)
--   입고   : set_outsourcing_receipts        (outsourced_design_receipts 와 같은 구조)
--   현황   : set_outsourcing_status_view     (outsourced_design_status_view 를 category 만 바꿔 복제)
--   업체   : set_order_partners              (기존 SET외주제작등록의 협력업체 마스터를 그대로 사용)
--   원가   : 금형원가내역 › 금형 공통비 › SET외주 행 (입고확정 금액 집계)

/* ── 1. order_lines.category 체크제약에 '외주SET' 허용 (제약이 있을 때만) ───────── */
do $$
declare c record; d text;
begin
  for c in
    select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'public.order_lines'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%외주설계%'
  loop
    if c.def like '%외주SET%' then continue; end if;
    d := replace(c.def, '''외주설계''', '''외주설계'', ''외주SET''');
    execute format('alter table public.order_lines drop constraint %I', c.conname);
    execute format('alter table public.order_lines add constraint %I %s', c.conname, d);
  end loop;
end $$;

/* ── 2. 입고 이력 표 (설계외주 입고표와 같은 구조) ─────────────────────────── */
create table if not exists public.set_outsourcing_receipts
  (like public.outsourced_design_receipts including all);

alter table public.set_outsourcing_receipts enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'set_outsourcing_receipts') then
    create policy set_outsourcing_receipts_all on public.set_outsourcing_receipts
      for all using (true) with check (true);
  end if;
end $$;
grant select, insert, update, delete on public.set_outsourcing_receipts to anon, authenticated;
do $$
declare s record;
begin
  for s in select sequence_name from information_schema.sequences
            where sequence_schema = 'public' and sequence_name like 'set_outsourcing_receipts%'
  loop
    execute format('grant usage, select on sequence public.%I to anon, authenticated', s.sequence_name);
  end loop;
end $$;

/* ── 3. 현황 뷰 — 설계외주 현황 뷰 정의를 그대로 복제하고 category 만 바꾼다 ──────── */
do $$
declare v text;
begin
  v := pg_get_viewdef('public.outsourced_design_status_view'::regclass, true);
  v := replace(v, '외주설계', '외주SET');
  v := replace(v, 'outsourced_design_receipts', 'set_outsourcing_receipts');
  execute 'create or replace view public.set_outsourcing_status_view as ' || v;
end $$;
grant select on public.set_outsourcing_status_view to anon, authenticated;

/* ── 4. 실시간 알림(변경 통지)에 등록돼 있으면 새 표도 같이 ──────────────────── */
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.set_outsourcing_receipts;
    exception when others then null;
    end;
  end if;
end $$;

-- ════════ sql_v234_purge_job.sql ════════
-- v234 : 수주진척현황 [✕ 진행삭제] — 관리제번 단위 완전 삭제
-- Supabase SQL Editor 에서 한 번만 실행하세요. (여러 번 실행해도 안전)
--
-- 왜 필요한가
--   카드는 관리제번(26DSA057) 단위인데 삭제는 대표 공정 제번(26DSA057F) 하나만 지워 A·B 공정이 남았고,
--   기존 mes_reset_job_progress 가 만들어진 뒤 추가된 표(SET외주 입고, 차수, 분할입고 원장 …)는 지우지 않았다.
--   이 함수는 public 스키마에서 job_no 열을 가진 모든 표를 자동으로 찾아, 관리제번과 그 공정 제번(A~Z) 행을 전부 지운다.
--   job_no 가 없는 자식 표(외주가공 분할입고 원장 outsourcing_moves.line_id 등)는 FK 를 따라 먼저 지운다.
--
-- 사용 : select public.mes_purge_job_base('26DSA057');
--        → {"base":"26DSA057","deleted":123,"tables":{"order_lines":9,"sale_orders":3,...}}

create or replace function public.mes_purge_job_base(p_base text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_base   text := upper(trim(p_base));
  v_re     text;
  t        record;
  fk       record;
  n        bigint;
  total    bigint := 0;
  tabs     jsonb  := '{}'::jsonb;
  pass     int;
  left_cnt bigint;
  cols     text;
  refcols  text;
begin
  if v_base is null or v_base = '' then
    raise exception '관리제번이 비었습니다.';
  end if;
  -- 관리제번 그대로 이거나, 관리제번 + 공정 한 글자(A~Z)
  v_re := '^' || regexp_replace(v_base, '([.^$|()\[\]{}*+?\\])', '\\\1', 'g') || '[A-Z]?$';

  -- ── 1. job_no 가 없는 자식 표 : FK 로 부모(job_no 있는 표)를 따라가 먼저 지운다 ──
  for fk in
    select c.conname,
           c.conrelid::regclass  as child,
           c.confrelid::regclass as parent,
           (select string_agg(quote_ident(a.attname), ',' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as child_cols,
           (select string_agg(quote_ident(a.attname), ',' order by k.ord)
              from unnest(c.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as parent_cols
      from pg_constraint c
      join pg_namespace ns on ns.oid = c.connamespace
     where c.contype = 'f' and ns.nspname = 'public'
       and exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = c.confrelid::regclass::text and column_name = 'job_no')
       and not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = c.conrelid::regclass::text and column_name = 'job_no')
  loop
    begin
      execute format('delete from %s where (%s) in (select %s from %s where job_no ~ %L)',
                     fk.child, fk.child_cols, fk.parent_cols, fk.parent, v_re);
      get diagnostics n = row_count;
      if n > 0 then
        total := total + n;
        tabs := tabs || jsonb_build_object(fk.child::text, coalesce((tabs->>fk.child::text)::bigint, 0) + n);
      end if;
    exception when others then null;
    end;
  end loop;

  -- ── 2. job_no 열이 있는 모든 표 : FK 순서를 몰라도 되게 여러 번 돈다 ──
  for pass in 1..6 loop
    left_cnt := 0;
    for t in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables tb
          on tb.table_schema = c.table_schema and tb.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'job_no'
         and tb.table_type = 'BASE TABLE'
       order by case when c.table_name in ('jobs','sale_orders','job_pool') then 2 else 1 end, c.table_name
    loop
      begin
        execute format('delete from public.%I where job_no ~ %L', t.table_name, v_re);
        get diagnostics n = row_count;
        if n > 0 then
          total := total + n;
          tabs := tabs || jsonb_build_object(t.table_name, coalesce((tabs->>t.table_name)::bigint, 0) + n);
        end if;
      exception when foreign_key_violation then
        left_cnt := left_cnt + 1;         -- 자식이 남아 있음 → 다음 바퀴에서 다시
      when others then null;              -- 뷰·권한 등은 건너뜀
      end;
    end loop;
    exit when left_cnt = 0;
  end loop;

  -- ── 3. 화면 스냅샷(page_state) 의 제번 잔재는 화면이 다시 읽으면 정리되므로 건드리지 않는다 ──

  return jsonb_build_object('base', v_base, 'deleted', total, 'tables', tabs);
end $$;

grant execute on function public.mes_purge_job_base(text) to anon, authenticated;

-- ════════ sql_v236_attach_policy.sql ════════
-- v236 : 수주등록 첨부파일 — 저장소(mes-attach) 권한 정리
-- Supabase SQL Editor 에서 한 번만 실행하세요. (여러 번 실행해도 안전)
--
-- 증상 : 수주등록 › 첨부파일 › [파일첨부] 에서 "저장소 권한 없음"
-- 원인 후보
--   ① 버킷에 파일 형식 제한(allowed_mime_types = 이미지만) 또는 크기 제한이 걸려 있음
--   ② 삭제 정책이 없어 [파일삭제] 가 조용히 실패
--   ③ 정책이 로그인(authenticated) 사용자만 허용 — 로그인 토큰이 만료된 채 화면을 오래 열어 둔 경우
-- 이 스크립트는 ①②를 고치고, 마지막 조회로 현재 상태를 보여 준다. (③은 화면에서 재로그인/토큰 갱신)

-- 1) 버킷 : 공개 읽기 · 형식 제한 없음 · 50MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mes-attach', 'mes-attach', true, 52428800, null)
on conflict (id) do update
  set public = true, file_size_limit = 52428800, allowed_mime_types = null;

-- 2) 정책 : 읽기 공개 · 올리기/바꾸기/지우기 = 로그인 사용자
drop policy if exists "mes_attach_read"   on storage.objects;
drop policy if exists "mes_attach_write"  on storage.objects;
drop policy if exists "mes_attach_update" on storage.objects;
drop policy if exists "mes_attach_delete" on storage.objects;

create policy "mes_attach_read" on storage.objects
  for select using (bucket_id = 'mes-attach');

create policy "mes_attach_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'mes-attach');

create policy "mes_attach_update" on storage.objects
  for update to authenticated using (bucket_id = 'mes-attach') with check (bucket_id = 'mes-attach');

create policy "mes_attach_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'mes-attach');

-- 3) 확인 : 버킷 설정과 정책 목록
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'mes-attach';
select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'mes_attach%' order by policyname;

-- ════════ sql_v242_design_vendor.sql ════════
-- v242 : 수주등록 › 설계업체 (개발유형 「외주설계」 체크 시 입력)
-- Supabase SQL Editor 에서 한 번만 실행하세요. (여러 번 실행해도 안전)
alter table public.sale_orders add column if not exists design_vendor_name text;
comment on column public.sale_orders.design_vendor_name is '외주설계 업체 (수주등록 › 개발유형 외주설계 체크 시). 제작계획등록 설계처·설계외주발주 업체 자동선택에 이어진다';

-- ════════ 수주등록 신규 컬럼 (SQL 파일 없음) ════════
alter table public.sale_orders add column if not exists process_category text;
alter table public.sale_orders add column if not exists nego_amount numeric;
alter table public.sale_orders add column if not exists nego_note text;
notify pgrst, 'reload schema';
