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
