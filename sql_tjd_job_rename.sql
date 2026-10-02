-- TJDT v284 : 공정 문자 없는 옛 제번 정리 (공정수 1 = A)
--   ① 숫자로 끝나는 제번 15건 → 끝에 A (예 0DHA038 → 0DHA038A)
--   ② 이름 뒤에 글자가 붙은 8건 → 뒤 글자 삭제 (예 15IGA211A(일진) → 15IGA211A). 옛 제번은 sale_orders.remark 에 남김
--   9DHA036 은 9DHA036A 가 이미 있어(같은 금형 중복) 이번에는 제외.
--   제번이 들어 있는 모든 표(job_no · origin_base)를 한 번에 바꾼다. 대응표는 bak_job_rename_20261002 에 남긴다.
--   이미 바뀐 제번은 건너뛰므로 여러 번 실행해도 안전.

create table if not exists public.bak_job_rename_20261002 (old_job text primary key, new_job text not null, renamed_at timestamptz default now());
alter table public.bak_job_rename_20261002 enable row level security;

do $$
declare
  m record; t record; n int;
begin
  for m in
    select job_no as old,
           case when job_no ~ '^[0-9]+[A-Z]+[0-9]+$' then job_no||'A'
                else regexp_replace(job_no,'^([0-9]+[A-Z]+[0-9]+A)[^0-9A-Z].*$','\1') end as new
      from public.jobs
     where job_no in ('0DHA038','0DHA040','0DHA100','0DHA101','12DHA212','12DHA213','1DHA088','1DHA089','1DHA105',
                      '5DHA088','6DHA037','6DHA038','6DHA039','9DHA032','9DHA033',
                      '15IGA211A(일진)','15IGA213A(일진)','16IGA208A(일진)','17IGA201A(일진)','17IGA202A(일진)','17IGA203A(일진)',
                      '19SKA202A_1179','22RDA602A(Transfer)')
  loop
    if exists(select 1 from public.jobs where job_no = m.new) then
      raise notice '건너뜀 % → % (이미 있음)', m.old, m.new; continue;
    end if;
    -- 새 제번 행을 먼저 만들고 (외래키 대상), 모든 표의 제번을 옮긴 뒤, 옛 행을 지운다
    insert into public.jobs select (jsonb_populate_record(null::public.jobs, to_jsonb(j) || jsonb_build_object('job_no', m.new))).* from public.jobs j where j.job_no = m.old;
    for t in
      select c.table_name from information_schema.columns c
        join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
       where c.table_schema = 'public' and tb.table_type = 'BASE TABLE' and c.column_name = 'job_no'
         and c.table_name <> 'jobs' and c.table_name not like 'bak\_%'
    loop
      execute format('update public.%I set job_no = $1 where job_no = $2', t.table_name) using m.new, m.old;
    end loop;
    update public.sale_orders set origin_base = m.new where origin_base = m.old;
    if m.old !~ '^[0-9]+[A-Z]+[0-9]+$' then
      update public.sale_orders set remark = trim(coalesce(remark,'') || ' / 옛 제번: ' || m.old) where job_no = m.new;
    end if;
    delete from public.jobs where job_no = m.old;
    insert into public.bak_job_rename_20261002(old_job, new_job) values (m.old, m.new) on conflict (old_job) do nothing;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- 확인 : 공정 문자 없이 남은 제번
select job_no from public.sale_orders where job_no !~ '\d[A-Z]$' order by 1;
