-- 손님 실시간 알림을 Postgres Changes → Broadcast 로 전환.
--
-- 이유: 손님마다 postgres_changes 구독을 걸면 구독할 때마다 DB 작업이 생겨, 무료 플랜에서
-- 150명이 동시에 들어오면 일부 구독이 시간 초과됐다(부하 시험). Broadcast 채널 구독은 DB 를 거치지 않는다.
--
-- 동작: 공개 상태가 바뀌면 'order:<회차ID>:<번호>' 채널에 "바뀌었음" 신호만 보낸다.
-- 손님 화면은 신호를 받으면 public_board 로 서버의 최신 상태를 다시 조회한다(신호 내용은 믿지 않는다).
-- 따라서 누군가 공개 채널에 가짜 신호를 보내도 잘못된 상태가 표시되지 않는다.
create or replace function private.sync_public_status(p_order public.orders)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.public_order_status as p
    (order_id, session_id, order_number, status, revision, ready_at, picked_up_at, updated_at)
  values
    (p_order.id, p_order.session_id, p_order.order_number, p_order.status, p_order.revision,
     p_order.ready_at, p_order.picked_up_at, p_order.updated_at)
  on conflict (order_id) do update set
    status = excluded.status,
    revision = excluded.revision,
    ready_at = excluded.ready_at,
    picked_up_at = excluded.picked_up_at,
    updated_at = excluded.updated_at;

  -- 알림 실패가 주문 저장을 막지 않도록 한다 (손님 화면은 10~15초 주기 조회로도 갱신된다)
  begin
    perform realtime.send(
      jsonb_build_object('revision', p_order.revision),
      'changed',
      'order:' || p_order.session_id::text || ':' || p_order.order_number::text,
      false
    );
  exception when others then
    raise warning 'realtime.send failed: %', sqlerrm;
  end;
end;
$$;

revoke all on function private.sync_public_status(public.orders) from public, anon, authenticated;

-- 손님은 더 이상 public_order_status 의 postgres_changes 를 구독하지 않는다.
-- (직원 화면은 계속 orders 를 구독한다. public_service_state 는 남겨 두어도 손님 구독이 없으면 비용이 없다.)
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'public_order_status'
  ) then
    alter publication supabase_realtime drop table public.public_order_status;
  end if;
end;
$$;
