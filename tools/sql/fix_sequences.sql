-- 데이터를 옮긴 뒤 자동번호(identity/serial)를 각 테이블의 최댓값 다음으로 맞춘다.
-- 회사 DB 의 Supabase SQL Editor 에서 실행하거나, copy_data.py 가 자동 실행한다. 여러 번 실행해도 안전.
do $$ declare r record; m bigint; begin
  for r in
    select c.table_schema s, c.table_name t, c.column_name col,
           pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) seq
    from information_schema.columns c join information_schema.tables tb
      on tb.table_schema=c.table_schema and tb.table_name=c.table_name and tb.table_type='BASE TABLE'
    where c.table_schema='public'
      and pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) is not null
  loop
    execute format('select max(%I) from %I.%I', r.col, r.s, r.t) into m;
    if m is null then perform setval(r.seq, 1, false); else perform setval(r.seq, m, true); end if;
  end loop;
end $$;
