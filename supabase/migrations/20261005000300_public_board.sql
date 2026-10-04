-- 손님 화면 한 번 조회용 RPC.
-- Realtime 메시지를 줄이기 위해 손님은 '내 번호' 변경만 실시간으로 받고,
-- 회차 정보·수령 가능 목록·최근 수령 완료·내 번호 상태는 이 함수 한 번으로 주기적으로 가져온다.
--
-- security invoker: 호출자(anon) 권한과 RLS 가 그대로 적용된다 → 열린 회차의 공개 상태만 보인다.
-- 응답을 작게 유지하려고 목록 항목에는 화면에 필요한 필드만 담는다.
create or replace function public.public_board(p_picked_limit integer default 20, p_my_number integer default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with svc as (
    select session_id, session_label, service_date, is_open, updated_at
    from public.public_service_state
    where id = 1
  ),
  cur as (
    select session_id from svc where is_open
  ),
  lim as (
    select least(greatest(coalesce(p_picked_limit, 20), 1), 200) as n
  )
  select jsonb_build_object(
    'service', (select to_jsonb(svc) from svc),
    'ready', coalesce((
      select jsonb_agg(
        jsonb_build_object('order_id', r.order_id, 'order_number', r.order_number, 'status', r.status,
                           'revision', r.revision, 'ready_at', r.ready_at, 'picked_up_at', r.picked_up_at)
        order by r.ready_at, r.order_number)
      from public.public_order_status r
      where r.session_id = (select session_id from cur) and r.status = 'ready'
    ), '[]'::jsonb),
    'picked_up', coalesce((
      select jsonb_agg(
        jsonb_build_object('order_id', p.order_id, 'order_number', p.order_number, 'status', p.status,
                           'revision', p.revision, 'ready_at', p.ready_at, 'picked_up_at', p.picked_up_at)
        order by p.picked_up_at desc, p.order_number desc)
      from (
        select * from public.public_order_status
        where session_id = (select session_id from cur) and status = 'picked_up'
        order by picked_up_at desc, order_number desc
        limit (select n + 1 from lim)
      ) p
    ), '[]'::jsonb),
    'mine', (
      select jsonb_build_object('order_id', m.order_id, 'order_number', m.order_number, 'status', m.status,
                                'revision', m.revision, 'ready_at', m.ready_at, 'picked_up_at', m.picked_up_at)
      from public.public_order_status m
      where p_my_number is not null
        and m.session_id = (select session_id from cur)
        and m.order_number = p_my_number
    )
  );
$$;

revoke execute on function public.public_board(integer, integer) from public;
grant execute on function public.public_board(integer, integer) to anon, authenticated;
