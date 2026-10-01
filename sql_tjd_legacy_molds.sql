-- TJDT v282 : 기존 양산 금형(일괄등록) 정리
--   MES 도입 전에 제작이 끝나 양산 중인 금형은 「수리」 수주 그대로 두고(그 관리제번이 곧 수리 원장 = R1 역할),
--   업로드할 때 들어간 가짜 날짜(수주일·납품완료일 = 업로드일)만 비운다.
--   → 월간보고서 신규 수주·납품·진행 중 금형에서 빠지고, 수리 발주·매입·공수는 그대로 집계된다.
--   대상 : 2026-10-01 현재 등록된 수주 전부 (192건 모두 기존 금형). 비고가 빈 건(26RDE606·ETC)도 '기존금형 일괄등록' 으로 표시한다.
--   이후 등록하는 신작·수리·개조 수주는 비고가 다르므로 다시 실행해도 영향 없음.
--   지우기 전 원래 값은 bak_legacy_dates_20261001 에 남긴다. 여러 번 실행해도 안전.

-- 0) 비고가 빈 기존 금형도 같은 표시로 (이 줄은 2026-10-01 등록분까지만 해당)
update public.sale_orders set remark = '기존금형 일괄등록'
 where remark is null and order_type = '수리' and origin_base is null and order_date <= date '2026-10-01';

create table if not exists public.bak_legacy_dates_20261001 as
select s.job_no, s.order_date, s.delivery_completed_date, r.order_date as sr_order_date, j.order_date as j_order_date, now() as backed_at
  from public.sale_orders s
  left join public.sale_order_status_rows r on r.job_no = s.job_no
  left join public.jobs j on j.job_no = s.job_no
 where s.remark like '기존금형 일괄등록%';
alter table public.bak_legacy_dates_20261001 enable row level security;

-- 1) 수주등록 : 수주일·납품완료일 비움, 유형 수리 유지, 비고 통일
update public.sale_orders
   set order_date = null,
       delivery_completed_date = null,
       order_type = '수리',
       origin_base = null
 where remark like '기존금형 일괄등록%';

-- 2) 수주현황 표(업로드 때 같이 만들어진 복사본)와 제번 마스터의 수주일도 비움 (제번 목록이 이 날짜를 대신 쓰므로)
update public.sale_order_status_rows r set order_date = null
  from public.sale_orders s where s.job_no = r.job_no and s.remark like '기존금형 일괄등록%';
update public.jobs j set order_date = null
  from public.sale_orders s where s.job_no = j.job_no and s.remark like '기존금형 일괄등록%';

-- 확인
select count(*) as legacy_total,
       count(*) filter (where order_date is null and delivery_completed_date is null) as cleared
  from public.sale_orders where remark like '기존금형 일괄등록%';
