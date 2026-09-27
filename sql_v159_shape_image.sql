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
