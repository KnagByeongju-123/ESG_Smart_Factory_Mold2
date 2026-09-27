-- v178 : 사내외가공 발주 — 입고취소(회차·전체) · 완료(입고확정) 취소
-- Supabase SQL Editor 에서 한 번만 실행하세요. (여러 번 실행해도 안전)
--
-- 왜 필요한가
--   종전 입고취소는 order_lines 만 '발주'로 되돌려서, 분할입고 원장(outsourcing_moves)의
--   입고 회차가 그대로 남았다. 다시 입고하면 fn_osp_receive 가 원장 합계로 잔량을 계산해
--   "누적 입고가 발주수량을 초과합니다" 오류가 났다. 이제 취소는 원장까지 같이 정리한다.

/* ── 1. 회차 1건 취소 (기존 함수 보강: 확정 정보도 함께 지운다) ───────── */
create or replace function public.fn_osp_receive_cancel(
  p_line_id bigint,
  p_move_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_ord numeric;
  v_new numeric;
  v_del bigint;
begin
  select coalesce(nullif(order_qty, 0), 1) into v_ord
    from public.order_lines where line_id = p_line_id;
  if not found then
    raise exception '발주라인 %를 찾을 수 없습니다.', p_line_id;
  end if;

  select move_id into v_del
    from public.outsourcing_moves
   where line_id = p_line_id and io in ('입고', '사내입고')
     and (p_move_id is null or move_id = p_move_id)
   order by move_date desc, move_id desc
   limit 1;

  if v_del is null then
    raise exception '취소할 입고 기록이 없습니다.';
  end if;

  delete from public.outsourcing_moves where move_id = v_del;

  select coalesce(sum(coalesce(in_qty, 0) + coalesce(short_qty, 0)), 0)
    into v_new
    from public.outsourcing_moves
   where line_id = p_line_id and io in ('입고', '사내입고');

  update public.order_lines
     set receipt_qty   = nullif(v_new, 0),
         receipt_date  = null,
         status        = '발주',
         confirm_date  = null,
         confirm_price = null,
         nego_rate     = null,
         updated_at    = now()
   where line_id = p_line_id;

  return jsonb_build_object('canceled_move', v_del, 'in_qty', v_new,
                            'open_qty', greatest(v_ord - v_new, 0));
end $$;

/* ── 2. 입고 전체취소 (신규) : 입고 회차 전부 삭제 → 발주 상태 · 확정 정보 삭제 ── */
create or replace function public.fn_osp_receive_cancel_all(
  p_line_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_ord numeric;
  v_cnt integer;
begin
  select coalesce(nullif(order_qty, 0), 1) into v_ord
    from public.order_lines where line_id = p_line_id;
  if not found then
    raise exception '발주라인 %를 찾을 수 없습니다.', p_line_id;
  end if;

  delete from public.outsourcing_moves
   where line_id = p_line_id and io in ('입고', '사내입고');
  get diagnostics v_cnt = row_count;

  update public.order_lines
     set receipt_qty   = null,
         receipt_date  = null,
         status        = '발주',
         confirm_date  = null,
         confirm_price = null,
         nego_rate     = null,
         updated_at    = now()
   where line_id = p_line_id;

  return jsonb_build_object('canceled_moves', v_cnt, 'in_qty', 0, 'open_qty', v_ord);
end $$;

grant execute on function public.fn_osp_receive_cancel(bigint, bigint)
  to authenticated, service_role;
grant execute on function public.fn_osp_receive_cancel_all(bigint)
  to authenticated, service_role;

/* ── 3. 확인 ─────────────────────────────────────────────────────── */
-- select proname from pg_proc where proname like 'fn_osp_receive%';
-- 예상: fn_osp_receive, fn_osp_receive_cancel, fn_osp_receive_cancel_all
