-- v161 : 제조원가에 사내가공비가 들어가는지 확인 / 고치기
-- (화면 쪽은 이미 고쳤습니다. 목록의 제조원가는 DB 뷰 값이라 아래 확인이 필요합니다.)

-- ① 지금 뷰가 어떻게 계산하는지 봅니다.
select pg_get_viewdef('public.manufacturing_cost_view'::regclass, true);

-- ② 제번별 사내가공비가 얼마인지 봅니다 (사내가공 실적 합계).
select job_no,
       round(sum(coalesce(labor_cost, coalesce(work_minutes,0)/60.0*30000))) as 사내가공비,
       round(sum(coalesce(work_minutes,0))/60.0, 1)                          as 시간
  from public.design_results
 where work_type = '가공'
 group by job_no
 order by 사내가공비 desc
 limit 30;

-- ③ ①의 결과에서 노무비(내작) 부분을 찾아 아래 형태로 바꿉니다.
--    · design_results 를 work_type 으로 걸러 '조립' 만 세고 있으면 '가공' 도 포함시키고
--    · 금액은 실적에 저장된 labor_cost 를 우선 쓰게 합니다.
--
--    예)  sum(dr.work_minutes / 60.0 * 30000)                         -- 이전
--    →    sum(coalesce(dr.labor_cost, dr.work_minutes / 60.0 * 30000)) -- 이후
--
--    그리고 where 절에 work_type = '조립' 같은 제한이 있으면
--    work_type in ('조립','가공') 로 넓힙니다.

-- ④ 확인 : 화면에서 제번을 선택했을 때 아래 메시지가 사라지면 맞은 것입니다.
--    "⚠ 목록의 제조원가와 ○○원 차이"
