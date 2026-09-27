-- v166 : 작업단가(가공) 11개 공정 등록 — 모두 30,000원/h
-- 기준정보 › 단가관리 › 작업단가 화면에 그대로 나옵니다.
-- Supabase SQL Editor 에서 실행하세요. 두 번 실행해도 안전합니다.

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
  ('MCH','가공 공통'   ,'가공',30000)     -- 공정별 단가가 없을 때 쓰는 기본값
on conflict (rate_code) do update
  set rate_name     = coalesce(public.labor_rates.rate_name, excluded.rate_name),
      rate_type     = excluded.rate_type,
      rate_per_hour = excluded.rate_per_hour;   -- 단가를 30,000 으로 맞춥니다

-- 이미 등록된 단가를 그대로 두고 없는 것만 넣으려면 위 대신 아래를 쓰세요.
-- on conflict (rate_code) do nothing;

-- 확인
-- select rate_code, rate_name, rate_type, rate_per_hour
--   from public.labor_rates where rate_type = '가공' order by rate_code;
