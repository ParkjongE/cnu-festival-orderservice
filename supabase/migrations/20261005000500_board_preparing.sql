-- 손님 화면 목록 변경: '최근 수령 완료' 대신 '준비 중' 번호를 보여준다 (부스가 얼마나 바쁜지 손님이 알 수 있게).
-- 공개되는 정보는 번호·상태뿐이다. 준비 중 목록은 번호 순으로 정렬한다(공개 상태 테이블에는 등록 시각이 없다).
drop function if exists public.public_board(integer, integer);

create or replace function public.public_board(p_my_number integer default null)
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
    'preparing', coalesce((
      select jsonb_agg(
        jsonb_build_object('order_id', p.order_id, 'order_number', p.order_number, 'status', p.status,
                           'revision', p.revision, 'ready_at', p.ready_at, 'picked_up_at', p.picked_up_at)
        order by p.order_number)
      from (
        select * from public.public_order_status
        where session_id = (select session_id from cur) and status = 'preparing'
        order by order_number
        limit 300
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

revoke execute on function public.public_board(integer) from public;
grant execute on function public.public_board(integer) to anon, authenticated;

create index if not exists public_order_status_preparing
  on public.public_order_status (session_id, order_number) where status = 'preparing';
