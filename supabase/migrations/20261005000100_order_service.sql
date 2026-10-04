-- 청춘 맛 드림 주문 대기 서비스 — 스키마, 상태 전이, 접근 정책
--
-- 원칙
--  * 손님(anon)은 현재 열린 회차의 public_order_status / public_service_state 와 menus 만 읽는다.
--  * 직원 원본 테이블(orders, order_items, order_events, service_sessions)은 staff_members 에 등록된
--    활성 계정만 읽는다. 쓰기는 오직 아래 staff_* RPC 를 통해서만 한다(테이블 직접 쓰기 권한 없음).
--  * 주문 / 공개 상태 / 변경 이력은 하나의 RPC(= 하나의 트랜잭션) 안에서 저장된다.
--  * 주문번호 허용 범위(1~9999)는 src/lib/domain/constants.ts 의 ORDER_NUMBER_MAX 와 함께 바꾼다.

create schema if not exists private;

-- ───────────────────────── 타입 ─────────────────────────
create type public.order_status as enum ('preparing', 'ready', 'picked_up', 'canceled');
create type public.session_state as enum ('open', 'closed');

-- ───────────────────────── 테이블 ─────────────────────────
create table public.staff_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 40),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.service_sessions (
  id           uuid primary key default gen_random_uuid(),
  label        text not null check (char_length(btrim(label)) between 1 and 60),
  service_date date not null,
  state        public.session_state not null default 'open',
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  opened_by    uuid,
  closed_by    uuid,
  constraint service_sessions_closed_at_matches_state
    check ((state = 'closed') = (closed_at is not null))
);
-- 부스당 열린 회차는 최대 1개
create unique index service_sessions_single_open on public.service_sessions ((true)) where state = 'open';
create index service_sessions_opened_at on public.service_sessions (opened_at desc);

create table public.menus (
  id         text primary key check (id ~ '^[a-z0-9_]{1,40}$'),
  name       text not null,
  price_krw  integer not null check (price_krw >= 0),
  sort_order integer not null default 0,
  active     boolean not null default true
);

create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.service_sessions (id),
  order_number  integer not null check (order_number between 1 and 9999),
  status        public.order_status not null default 'preparing',
  revision      integer not null default 1 check (revision >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  ready_at      timestamptz,
  picked_up_at  timestamptz,
  canceled_at   timestamptz,
  canceled_from public.order_status check (canceled_from is null or canceled_from in ('preparing', 'ready')),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200),
  staff_note    text check (staff_note is null or char_length(staff_note) <= 200),
  created_by    uuid not null,
  constraint orders_number_unique_in_session unique (session_id, order_number),
  constraint orders_cancel_fields check ((status = 'canceled') = (canceled_at is not null and canceled_from is not null))
);
create index orders_session_status on public.orders (session_id, status);

create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  menu_id        text not null references public.menus (id),
  name_snapshot  text not null,
  unit_price_krw integer not null check (unit_price_krw >= 0),
  quantity       integer not null check (quantity between 1 and 99),
  constraint order_items_menu_once unique (order_id, menu_id)
);

-- 손님에게 공개되는 최소 정보. 메뉴·메모·직원·취소 사유를 넣지 않는다.
create table public.public_order_status (
  order_id     uuid primary key references public.orders (id) on delete cascade,
  session_id   uuid not null references public.service_sessions (id),
  order_number integer not null,
  status       public.order_status not null,
  revision     integer not null,
  ready_at     timestamptz,
  picked_up_at timestamptz,
  updated_at   timestamptz not null default now(),
  constraint public_order_status_number_unique unique (session_id, order_number)
);
create index public_order_status_ready on public.public_order_status (session_id, ready_at) where status = 'ready';
create index public_order_status_picked on public.public_order_status (session_id, picked_up_at desc) where status = 'picked_up';

-- 손님용 "현재 회차" 단일 행. 회차 시작/종료 시 RPC가 갱신하고 Realtime 으로 전달된다.
create table public.public_service_state (
  id            smallint primary key default 1 check (id = 1),
  session_id    uuid references public.service_sessions (id),
  session_label text,
  service_date  date,
  is_open       boolean not null default false,
  updated_at    timestamptz not null default now()
);
insert into public.public_service_state (id) values (1) on conflict (id) do nothing;

create table public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  session_id  uuid not null references public.service_sessions (id),
  actor_id    uuid not null,
  action      text not null,
  from_status public.order_status,
  to_status   public.order_status not null,
  revision    integer not null,
  created_at  timestamptz not null default now(),
  request_id  uuid not null,
  reason      text check (reason is null or char_length(reason) <= 200),
  constraint order_events_request_unique unique (request_id)
);
create index order_events_order on public.order_events (order_id, created_at);

-- ───────────────────────── 내부 함수 (private, PostgREST 미노출) ─────────────────────────
create or replace function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_members s
    where s.user_id = (select auth.uid()) and s.active
  );
$$;

-- 허용된 상태 전이와 동작 이름. src/lib/domain/transitions.ts 와 같은 표를 유지한다.
create or replace function private.transition_action(
  p_from public.order_status,
  p_to public.order_status,
  p_canceled_from public.order_status
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = 'preparing' and p_to = 'ready'     then 'mark_ready'
    when p_from = 'ready'     and p_to = 'picked_up' then 'mark_picked_up'
    when p_from = 'ready'     and p_to = 'preparing' then 'undo_ready'
    when p_from = 'picked_up' and p_to = 'ready'     then 'undo_picked_up'
    when p_from in ('preparing', 'ready') and p_to = 'canceled' then 'cancel'
    when p_from = 'canceled'  and p_to = p_canceled_from then 'restore'
    else null
  end;
$$;

create or replace function private.order_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(o) || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) - 'order_id' order by m.sort_order, i.menu_id)
      from public.order_items i
      join public.menus m on m.id = i.menu_id
      where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id;
$$;

create or replace function private.sync_public_status(p_order public.orders)
returns void
language sql
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not private.is_active_staff() then
    raise exception '직원 권한이 없습니다' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- ───────────────────────── 직원 RPC (public, authenticated 만 실행) ─────────────────────────
create or replace function public.am_i_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_staff();
$$;

create or replace function public.staff_open_session(p_label text, p_service_date date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_session public.service_sessions;
  v_label text := btrim(coalesce(p_label, ''));
begin
  if char_length(v_label) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'code', 'invalid_label');
  end if;
  if p_service_date is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_date');
  end if;

  select * into v_session from public.service_sessions where state = 'open';
  if found then
    return jsonb_build_object('ok', false, 'code', 'session_already_open', 'session', to_jsonb(v_session));
  end if;

  begin
    insert into public.service_sessions (label, service_date, opened_by)
    values (v_label, p_service_date, v_uid)
    returning * into v_session;
  exception when unique_violation then
    select * into v_session from public.service_sessions where state = 'open';
    return jsonb_build_object('ok', false, 'code', 'session_already_open', 'session', to_jsonb(v_session));
  end;

  update public.public_service_state
     set session_id = v_session.id, session_label = v_session.label,
         service_date = v_session.service_date, is_open = true, updated_at = now()
   where id = 1;

  return jsonb_build_object('ok', true, 'session', to_jsonb(v_session));
end;
$$;

create or replace function public.staff_close_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_session public.service_sessions;
  v_preparing integer;
  v_ready integer;
begin
  select * into v_session from public.service_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_session.state <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'session_closed', 'session', to_jsonb(v_session));
  end if;

  select count(*) filter (where status = 'preparing'), count(*) filter (where status = 'ready')
    into v_preparing, v_ready
    from public.orders where session_id = p_session_id;
  if v_preparing + v_ready > 0 then
    return jsonb_build_object('ok', false, 'code', 'has_active_orders',
      'preparing', v_preparing, 'ready', v_ready, 'session', to_jsonb(v_session));
  end if;

  update public.service_sessions
     set state = 'closed', closed_at = now(), closed_by = v_uid
   where id = p_session_id
   returning * into v_session;

  update public.public_service_state
     set is_open = false, updated_at = now()
   where id = 1 and session_id = p_session_id;

  return jsonb_build_object('ok', true, 'session', to_jsonb(v_session));
end;
$$;

create or replace function public.staff_create_order(
  p_session_id uuid,
  p_order_number integer,
  p_items jsonb,
  p_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_state public.session_state;
  v_order public.orders;
  v_existing_order_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_item jsonb;
  v_menu public.menus;
  v_qty integer;
begin
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- 멱등성: 같은 요청이 이미 처리됐으면 그 결과를 돌려준다
  select order_id into v_existing_order_id from public.order_events where request_id = p_request_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'order', private.order_json(v_existing_order_id));
  end if;

  select state into v_state from public.service_sessions where id = p_session_id for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_state <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'session_closed');
  end if;

  if p_order_number is null or p_order_number not between 1 and 9999 then
    return jsonb_build_object('ok', false, 'code', 'invalid_number');
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    return jsonb_build_object('ok', false, 'code', 'invalid_note');
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 20 then
    return jsonb_build_object('ok', false, 'code', 'invalid_items');
  end if;

  insert into public.orders (session_id, order_number, staff_note, created_by)
  values (p_session_id, p_order_number, v_note, v_uid)
  on conflict (session_id, order_number) do nothing
  returning * into v_order;

  if v_order.id is null then
    select id into v_existing_order_id from public.orders
     where session_id = p_session_id and order_number = p_order_number;
    return jsonb_build_object('ok', false, 'code', 'duplicate_number',
      'order', private.order_json(v_existing_order_id));
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    select * into v_menu from public.menus where id = v_item ->> 'menu_id' and active;
    if not found then
      raise exception 'invalid menu' using errcode = '22023', hint = 'invalid_items';
    end if;
    begin
      v_qty := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'invalid quantity' using errcode = '22023', hint = 'invalid_items';
    end;
    if v_qty is null or v_qty not between 1 and 99 then
      raise exception 'invalid quantity' using errcode = '22023', hint = 'invalid_items';
    end if;
    insert into public.order_items (order_id, menu_id, name_snapshot, unit_price_krw, quantity)
    values (v_order.id, v_menu.id, v_menu.name, v_menu.price_krw, v_qty);
  end loop;

  insert into public.order_events (order_id, session_id, actor_id, action, from_status, to_status, revision, request_id)
  values (v_order.id, v_order.session_id, v_uid, 'create', null, v_order.status, v_order.revision, p_request_id);

  perform private.sync_public_status(v_order);

  return jsonb_build_object('ok', true, 'order', private.order_json(v_order.id));
end;
$$;

create or replace function public.staff_transition_order(
  p_order_id uuid,
  p_to_status public.order_status,
  p_expected_revision integer,
  p_request_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_order public.orders;
  v_state public.session_state;
  v_event public.order_events;
  v_action text;
  v_from public.order_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_request_id is null or p_to_status is null or p_expected_revision is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;
  if v_reason is not null and char_length(v_reason) > 200 then
    return jsonb_build_object('ok', false, 'code', 'invalid_reason');
  end if;

  -- 주문 행을 잠가 같은 주문에 대한 요청을 직렬화한다
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- 멱등성: 잠금 이후에 확인해야 동시에 들어온 같은 요청도 한 번만 반영된다
  select * into v_event from public.order_events where request_id = p_request_id;
  if found then
    if v_event.order_id <> p_order_id then
      return jsonb_build_object('ok', false, 'code', 'invalid_request');
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'order', private.order_json(p_order_id));
  end if;

  select state into v_state from public.service_sessions where id = v_order.session_id for share;
  if v_state <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'session_closed', 'order', private.order_json(p_order_id));
  end if;

  if v_order.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'stale', 'order', private.order_json(p_order_id));
  end if;

  v_action := private.transition_action(v_order.status, p_to_status, v_order.canceled_from);
  if v_action is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition', 'order', private.order_json(p_order_id));
  end if;

  v_from := v_order.status;

  update public.orders set
    status        = p_to_status,
    revision      = revision + 1,
    updated_at    = now(),
    ready_at      = case
                      when p_to_status = 'ready' and v_from = 'preparing' then now()
                      when p_to_status = 'preparing' then null
                      else ready_at
                    end,
    picked_up_at  = case when p_to_status = 'picked_up' then now() else null end,
    canceled_at   = case when p_to_status = 'canceled' then now() else null end,
    canceled_from = case when p_to_status = 'canceled' then v_from else null end,
    cancel_reason = case when p_to_status = 'canceled' then v_reason else null end
  where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, session_id, actor_id, action, from_status, to_status, revision, request_id, reason)
  values (v_order.id, v_order.session_id, v_uid, v_action, v_from, v_order.status, v_order.revision, p_request_id, v_reason);

  perform private.sync_public_status(v_order);

  return jsonb_build_object('ok', true, 'order', private.order_json(v_order.id));
end;
$$;

-- ───────────────────────── 권한 ─────────────────────────
-- Supabase 기본 권한은 anon/authenticated 에 테이블·함수 권한을 넓게 준다. 필요한 것만 남긴다.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_active_staff() to authenticated;

grant select on public.menus, public.public_order_status, public.public_service_state to anon, authenticated;
grant select on public.service_sessions, public.orders, public.order_items, public.order_events to authenticated;

revoke execute on function public.am_i_staff() from public, anon;
revoke execute on function public.staff_open_session(text, date) from public, anon;
revoke execute on function public.staff_close_session(uuid) from public, anon;
revoke execute on function public.staff_create_order(uuid, integer, jsonb, text, uuid) from public, anon;
revoke execute on function public.staff_transition_order(uuid, public.order_status, integer, uuid, text) from public, anon;
grant execute on function public.am_i_staff() to authenticated;
grant execute on function public.staff_open_session(text, date) to authenticated;
grant execute on function public.staff_close_session(uuid) to authenticated;
grant execute on function public.staff_create_order(uuid, integer, jsonb, text, uuid) to authenticated;
grant execute on function public.staff_transition_order(uuid, public.order_status, integer, uuid, text) to authenticated;

-- ───────────────────────── RLS ─────────────────────────
alter table public.staff_members        enable row level security;
alter table public.service_sessions     enable row level security;
alter table public.menus                enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.public_order_status  enable row level security;
alter table public.public_service_state enable row level security;
alter table public.order_events         enable row level security;

-- staff_members: 정책 없음 → anon/authenticated 접근 불가. 판정은 private.is_active_staff() 로만.

create policy "menus are public" on public.menus
  for select to anon, authenticated using (true);

create policy "service state is public" on public.public_service_state
  for select to anon, authenticated using (true);

create policy "public status of the open session" on public.public_order_status
  for select to anon, authenticated
  using (
    session_id = (
      select s.session_id from public.public_service_state s where s.id = 1 and s.is_open
    )
  );

create policy "staff read sessions" on public.service_sessions
  for select to authenticated using ((select private.is_active_staff()));

create policy "staff read orders" on public.orders
  for select to authenticated using ((select private.is_active_staff()));

create policy "staff read order items" on public.order_items
  for select to authenticated using ((select private.is_active_staff()));

create policy "staff read order events" on public.order_events
  for select to authenticated using ((select private.is_active_staff()));

-- ───────────────────────── Realtime ─────────────────────────
-- 손님: public_service_state, public_order_status / 직원: orders. (원본 orders 는 RLS 로 직원에게만 전달)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.public_service_state, public.public_order_status, public.orders;
  end if;
end;
$$;
