-- TJDT v270 : 수리·개조 수주를 원 금형(원 관리제번)에 연결
--   sale_orders.origin_base = 원 관리제번 (공정 문자 없는 값, 예 26RDE606). 신작은 null.
--   수리 관리제번 = 원관리제번-R1 (양산 중 수리는 R1 에 계속 누적, 따로 청구하는 큰 수리만 R2·R3…)
--   개조 관리제번 = 원관리제번-M1, -M2 …
-- 기존 데이터는 바꾸지 않습니다. 여러 번 실행해도 안전합니다.

alter table public.sale_orders add column if not exists origin_base text;
comment on column public.sale_orders.origin_base is '원 관리제번 (수리·개조 수주가 어느 금형의 것인지). 신작은 비움';
create index if not exists sale_orders_origin_base_idx on public.sale_orders (origin_base);

notify pgrst, 'reload schema';
