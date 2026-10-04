/**
 * 데모 모드 전용 주문 엔진. supabase/migrations 의 staff_* RPC 와 같은 규칙(권한 제외)을
 * 메모리 상태에 적용한다. 운영 데이터와 완전히 분리되며 브라우저 localStorage 에만 저장된다.
 */
import { DEFAULT_MENUS, NOTE_MAX_LENGTH, ORDER_NUMBER_MAX, ORDER_NUMBER_MIN } from "@/lib/domain/constants";
import { toPublicStatus } from "@/lib/domain/board";
import { transitionAction } from "@/lib/domain/transitions";
import type {
  Menu,
  NewOrderItemInput,
  OrderEvent,
  OrderMutationResult,
  OrderStatus,
  PublicServiceState,
  ServiceSession,
  SessionMutationResult,
  StaffOrder,
} from "@/lib/domain/types";

export interface DemoState {
  version: 1;
  menus: Menu[];
  sessions: ServiceSession[];
  orders: StaffOrder[];
  events: (OrderEvent & { request_id: string })[];
  service: PublicServiceState;
  nextEventId: number;
}

export interface EngineContext {
  now: () => Date;
  newId: () => string;
  actorId: string;
}

export function emptyDemoState(now: Date): DemoState {
  return {
    version: 1,
    menus: DEFAULT_MENUS.map((m) => ({ ...m })),
    sessions: [],
    orders: [],
    events: [],
    service: { session_id: null, session_label: null, service_date: null, is_open: false, updated_at: now.toISOString() },
    nextEventId: 1,
  };
}

const clone = <T>(v: T): T => structuredClone(v);

export function openSession(
  state: DemoState,
  ctx: EngineContext,
  label: string,
  serviceDate: string,
): SessionMutationResult {
  const trimmed = label.trim();
  if (trimmed.length < 1 || trimmed.length > 60) return { ok: false, code: "invalid_label" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return { ok: false, code: "invalid_date" };
  const open = state.sessions.find((s) => s.state === "open");
  if (open) return { ok: false, code: "session_already_open", session: clone(open) };
  const now = ctx.now().toISOString();
  const session: ServiceSession = {
    id: ctx.newId(),
    label: trimmed,
    service_date: serviceDate,
    state: "open",
    opened_at: now,
    closed_at: null,
  };
  state.sessions.push(session);
  state.service = { session_id: session.id, session_label: session.label, service_date: serviceDate, is_open: true, updated_at: now };
  return { ok: true, session: clone(session) };
}

export function closeSession(state: DemoState, ctx: EngineContext, sessionId: string): SessionMutationResult {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { ok: false, code: "not_found" };
  if (session.state !== "open") return { ok: false, code: "session_closed", session: clone(session) };
  const active = state.orders.filter((o) => o.session_id === sessionId);
  const preparing = active.filter((o) => o.status === "preparing").length;
  const ready = active.filter((o) => o.status === "ready").length;
  if (preparing + ready > 0) return { ok: false, code: "has_active_orders", preparing, ready, session: clone(session) };
  const now = ctx.now().toISOString();
  session.state = "closed";
  session.closed_at = now;
  if (state.service.session_id === sessionId) state.service = { ...state.service, is_open: false, updated_at: now };
  return { ok: true, session: clone(session) };
}

export function createOrder(
  state: DemoState,
  ctx: EngineContext,
  input: { sessionId: string; orderNumber: number; items: NewOrderItemInput[]; note: string | null; requestId: string },
): OrderMutationResult {
  const replay = state.events.find((e) => e.request_id === input.requestId);
  if (replay) return { ok: true, replayed: true, order: clone(state.orders.find((o) => o.id === replay.order_id)!) };

  const session = state.sessions.find((s) => s.id === input.sessionId);
  if (!session) return { ok: false, code: "not_found" };
  if (session.state !== "open") return { ok: false, code: "session_closed" };
  const n = input.orderNumber;
  if (!Number.isInteger(n) || n < ORDER_NUMBER_MIN || n > ORDER_NUMBER_MAX) return { ok: false, code: "invalid_number" };
  const note = input.note?.trim() || null;
  if (note && note.length > NOTE_MAX_LENGTH) return { ok: false, code: "invalid_note" };

  const existing = state.orders.find((o) => o.session_id === input.sessionId && o.order_number === n);
  if (existing) return { ok: false, code: "duplicate_number", order: clone(existing) };

  const seen = new Set<string>();
  const items = [];
  for (const item of input.items) {
    const menu = state.menus.find((m) => m.id === item.menu_id && m.active);
    if (!menu || seen.has(menu.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return { ok: false, code: "invalid_items" };
    }
    seen.add(menu.id);
    items.push({ id: ctx.newId(), menu_id: menu.id, name_snapshot: menu.name, unit_price_krw: menu.price_krw, quantity: item.quantity });
  }

  const now = ctx.now().toISOString();
  const order: StaffOrder = {
    id: ctx.newId(),
    session_id: input.sessionId,
    order_number: n,
    status: "preparing",
    revision: 1,
    created_at: now,
    updated_at: now,
    ready_at: null,
    picked_up_at: null,
    canceled_at: null,
    canceled_from: null,
    cancel_reason: null,
    staff_note: note,
    created_by: ctx.actorId,
    items,
  };
  state.orders.push(order);
  state.events.push({
    id: state.nextEventId++,
    order_id: order.id,
    actor_id: ctx.actorId,
    action: "create",
    from_status: null,
    to_status: "preparing",
    revision: 1,
    created_at: now,
    reason: null,
    request_id: input.requestId,
  });
  return { ok: true, order: clone(order) };
}

export function transitionOrder(
  state: DemoState,
  ctx: EngineContext,
  input: { orderId: string; to: OrderStatus; expectedRevision: number; requestId: string; reason?: string | null },
): OrderMutationResult {
  const order = state.orders.find((o) => o.id === input.orderId);
  if (!order) return { ok: false, code: "not_found" };

  const replay = state.events.find((e) => e.request_id === input.requestId);
  if (replay) {
    if (replay.order_id !== order.id) return { ok: false, code: "invalid_request" };
    return { ok: true, replayed: true, order: clone(order) };
  }

  const reason = input.reason?.trim() || null;
  if (reason && reason.length > NOTE_MAX_LENGTH) return { ok: false, code: "invalid_reason" };

  const session = state.sessions.find((s) => s.id === order.session_id);
  if (!session || session.state !== "open") return { ok: false, code: "session_closed", order: clone(order) };
  if (order.revision !== input.expectedRevision) return { ok: false, code: "stale", order: clone(order) };

  const action = transitionAction(order.status, input.to, order.canceled_from);
  if (!action) return { ok: false, code: "invalid_transition", order: clone(order) };

  const from = order.status;
  const now = ctx.now().toISOString();
  order.status = input.to;
  order.revision += 1;
  order.updated_at = now;
  if (input.to === "ready" && from === "preparing") order.ready_at = now;
  if (input.to === "preparing") order.ready_at = null;
  order.picked_up_at = input.to === "picked_up" ? now : null;
  order.canceled_at = input.to === "canceled" ? now : null;
  order.canceled_from = input.to === "canceled" ? from : null;
  order.cancel_reason = input.to === "canceled" ? reason : null;

  state.events.push({
    id: state.nextEventId++,
    order_id: order.id,
    actor_id: ctx.actorId,
    action,
    from_status: from,
    to_status: order.status,
    revision: order.revision,
    created_at: now,
    reason,
    request_id: input.requestId,
  });
  return { ok: true, order: clone(order) };
}

/** 손님이 볼 수 있는 공개 상태 (현재 열린 회차만) */
export function publicRows(state: DemoState) {
  if (!state.service.is_open || !state.service.session_id) return [];
  return state.orders.filter((o) => o.session_id === state.service.session_id).map(toPublicStatus);
}
