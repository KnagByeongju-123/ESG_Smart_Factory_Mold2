-- v165 : 금형원가 내역 엑셀의 공정 순서를 기준공정 "01" 로 등록
-- Supabase SQL Editor 에서 한 번만 실행하세요.
--
-- 엑셀 순서 : MF(연삭) · LS(선반) · MS(밀링小) · ML(밀링大) · RD(레디얼) · MCT ·
--             GL(평면연마) · GS(성형연마) · JIG(JIG/방전탭) · WC(와이어) · WD(방전)
--   ※ 엑셀 맨 앞의 「설계」는 가공공정이 아니라 설계비라서 넣지 않았습니다.

-- ────────────────────────────────────────────────────────────────
-- 1) 가공공정 마스터 : 없는 코드는 만들고, 있는 코드는 순서만 엑셀 순서로 맞춘다
--    (이미 쓰고 있는 공정 이름은 건드리지 않습니다)
-- ────────────────────────────────────────────────────────────────
insert into public.processes (process_code, process_name, sort_order) values
  ('MF','MF(연삭)',      10),
  ('LS','LS(선반)',      20),
  ('MS','MS(밀링小)',    30),
  ('ML','ML(밀링大)',    40),
  ('RD','RD(레디얼)',    50),
  ('MCT','MCT',          60),
  ('GL','GL(평면연마)',  70),
  ('GS','GS(성형연마)',  80),
  ('JIG','JIG/방전탭',   90),
  ('WC','WC(와이어)',   100),
  ('WD','WD(방전)',     110)
on conflict (process_code) do update
  set sort_order = excluded.sort_order;     -- 이름은 그대로 두고 순서만 갱신

-- ────────────────────────────────────────────────────────────────
-- 2) 기준공정 "01" 을 맨 앞에 넣는다
--    기존 기준공정 번호를 한 칸씩 뒤로 밀고 1번 자리를 비웁니다.
--    (가공계획은 기준공정을 '이름'으로 참조하므로 번호가 바뀌어도 영향 없습니다)
-- ────────────────────────────────────────────────────────────────
do $$
declare v_name text := '01. 금형원가 내역 기준';
begin
  -- 이미 같은 이름이 있으면 아무것도 하지 않는다 (두 번 실행해도 안전)
  if exists (select 1 from public.machining_standard_routes where standard_process_name = v_name) then
    raise notice '이미 등록되어 있습니다: %', v_name;
    return;
  end if;

  -- 기존 번호를 큰 것부터 +1
  update public.machining_standard_routes set standard_process_no = standard_process_no + 1000
    where standard_process_no >= 1;
  update public.machining_standard_routes set standard_process_no = standard_process_no - 999
    where standard_process_no >= 1000;

  begin
    update public.standard_processes set standard_process_id = standard_process_id + 1000
      where standard_process_id >= 1;
    update public.standard_process_steps set standard_process_id = standard_process_id + 1000
      where standard_process_id >= 1;
    update public.standard_processes set standard_process_id = standard_process_id - 999
      where standard_process_id >= 1000;
    update public.standard_process_steps set standard_process_id = standard_process_id - 999
      where standard_process_id >= 1000;
  exception when others then
    raise notice 'standard_processes 이동 건너뜀: %', sqlerrm;
  end;

  -- 1번 = 엑셀 순서
  insert into public.machining_standard_routes (standard_process_no, standard_process_name, steps, inhouse)
  values (1, v_name,
          '["MF","LS","MS","ML","RD","MCT","GL","GS","JIG","WC","WD"]'::jsonb,
          '[false,false,false,false,false,false,false,false,false,false,false]'::jsonb);

  begin
    insert into public.standard_processes (standard_process_id, standard_process_name, owner_name, registered_date)
    values (1, v_name, '시스템', to_char(now(),'YYYY-MM-DD'));
    insert into public.standard_process_steps (standard_process_id, sequence, process_code)
    select 1, s.seq, s.code
      from (values (1,'MF'),(2,'LS'),(3,'MS'),(4,'ML'),(5,'RD'),(6,'MCT'),
                   (7,'GL'),(8,'GS'),(9,'JIG'),(10,'WC'),(11,'WD')) as s(seq,code);
  exception when others then
    raise notice 'standard_processes 등록 건너뜀: %', sqlerrm;
  end;

  raise notice '등록 완료: %', v_name;
end $$;

-- ────────────────────────────────────────────────────────────────
-- 3) 사내 가공비 단가 — 없으면 화면이 기본 30,000원/h 로 계산합니다.
--    공정별로 다르면 공정코드로, 공통이면 MCH 한 줄만 넣으세요.
-- ────────────────────────────────────────────────────────────────
insert into public.labor_rates (rate_code, rate_type, rate_per_hour) values
  ('MCH','가공',30000)          -- 가공 공통 단가 (실제 값으로 고치세요)
--,('MF','가공',35000)          -- 공정별로 다르면 이렇게 추가
--,('WC','가공',45000)
on conflict (rate_code) do nothing;

-- 확인
-- select process_code, process_name, sort_order from public.processes order by sort_order;
-- select standard_process_no, standard_process_name, steps from public.machining_standard_routes order by standard_process_no;
-- select rate_code, rate_type, rate_per_hour from public.labor_rates order by rate_code;
