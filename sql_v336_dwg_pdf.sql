-- v336 : 도면 PDF(PartList 도면PDF 등록 · 사내외가공 발주 PDF · 그림보드) + 도면변환 메뉴 — DB 준비
-- Supabase SQL Editor 에서 한 번 실행하세요. 여러 번 실행해도 안전합니다. 기존 자료는 지우지 않습니다.
-- ※ 기존 DB / 회사 DB 를 따로 쓰면 각 DB 에서 한 번씩 실행하세요.

-- 1) 도면 파일 저장소 : 비공개 버킷 mes-drawing (로그인 사용자만 읽기·올리기) — sql_v160 과 같은 내용
insert into storage.buckets (id, name, public, file_size_limit)
values ('mes-drawing', 'mes-drawing', false, 20971520)   -- 20MB
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "mes_drawing_read"   on storage.objects;
drop policy if exists "mes_drawing_write"  on storage.objects;
drop policy if exists "mes_drawing_update" on storage.objects;
create policy "mes_drawing_read"   on storage.objects for select to authenticated using (bucket_id = 'mes-drawing');
create policy "mes_drawing_write"  on storage.objects for insert to authenticated with check (bucket_id = 'mes-drawing');
create policy "mes_drawing_update" on storage.objects for update to authenticated using (bucket_id = 'mes-drawing');
-- (삭제는 막아 둡니다 — 화면의 [도면PDF삭제] 는 도면대장 기록만 지웁니다)

-- 2) 도면대장 (도면관리 화면과 같은 표) — 없을 때만 만든다
create table if not exists public.drawings (
  drawing_no     text primary key,
  drawing_name   text,
  job_no         text,
  part_no        text,
  part_name      text,
  mold_type      text,
  current_rev    text default 'A',
  rev_date       date,
  owner          text,
  drawing_status text default '유효',
  file_url       text,
  remark         text,
  updated_at     timestamptz default now()
);
create index if not exists drawings_job_part_idx on public.drawings (job_no, part_no);
alter table public.drawings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='drawings') then
    create policy drawings_all on public.drawings for all to authenticated using (true) with check (true);
  end if;
end $$;

-- 3) 도면변환 요청 (웹 [도면변환] → 변환 PC 프로그램 tools/dwg_agent)
create table if not exists public.dwg_convert_jobs (
  id            bigint generated always as identity primary key,
  base_job      text,
  job_no        text not null,
  src_name      text,
  src_path      text not null,
  status        text not null default 'waiting'
                check (status in ('waiting','working','done','error','cancelled')),
  message       text,
  pdf_path      text,
  cad_path      text,
  summary       jsonb,
  requested_by  text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
create index if not exists dwg_convert_jobs_job_idx  on public.dwg_convert_jobs (job_no, created_at desc);
create index if not exists dwg_convert_jobs_wait_idx on public.dwg_convert_jobs (status, created_at);
alter table public.dwg_convert_jobs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='dwg_convert_jobs') then
    create policy dwg_convert_jobs_all on public.dwg_convert_jobs for all to authenticated using (true) with check (true);
  end if;
end $$;

-- 확인
select 'mes-drawing 버킷' as 항목, count(*) as 개수 from storage.buckets where id = 'mes-drawing'
union all select 'drawings 표', count(*) from information_schema.tables where table_schema='public' and table_name='drawings'
union all select 'dwg_convert_jobs 표', count(*) from information_schema.tables where table_schema='public' and table_name='dwg_convert_jobs';
