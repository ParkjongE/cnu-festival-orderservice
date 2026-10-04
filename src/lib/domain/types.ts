export type OrderStatus = "preparing" | "ready" | "picked_up" | "canceled";
export type SessionState = "open" | "closed";

/** 손님에게 공개되는 주문 상태. 메뉴·메모·직원 정보는 포함하지 않는다. */
export interface PublicOrderStatus {
  order_id: string;
  session_id: string;
  order_number: number;
  status: OrderStatus;
  revision: number;
  ready_at: string | null;
  picked_up_at: string | null;
  updated_at: string;
}

/** 손님용 현재 회차 정보 (단일 행). */
export interface PublicServiceState {
  session_id: string | null;
  session_label: string | null;
  service_date: string | null;
  is_open: boolean;
  updated_at: string;
}

export interface ServiceSession {
  id: string;
  label: string;
  service_date: string;
  state: SessionState;
  opened_at: string;
  closed_at: string | null;
}

export interface Menu {
  id: string;
  name: string;
  price_krw: number;
  sort_order: number;
  active: boolean;
}

export interface OrderItem {
  id: string;
  menu_id: string;
  name_snapshot: string;
  unit_price_krw: number;
  quantity: number;
}

export interface StaffOrder {
  id: string;
  session_id: string;
  order_number: number;
  status: OrderStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  picked_up_at: string | null;
  canceled_at: string | null;
  canceled_from: OrderStatus | null;
  cancel_reason: string | null;
  staff_note: string | null;
  created_by: string;
  items: OrderItem[];
}

export interface OrderEvent {
  id: number;
  order_id: string;
  actor_id: string;
  action: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  revision: number;
  created_at: string;
  reason: string | null;
}

export type MutationErrorCode =
  | "duplicate_number"
  | "stale"
  | "invalid_transition"
  | "session_closed"
  | "session_already_open"
  | "has_active_orders"
  | "not_found"
  | "invalid_number"
  | "invalid_items"
  | "invalid_note"
  | "invalid_reason"
  | "invalid_label"
  | "invalid_date"
  | "invalid_request"
  | "forbidden"
  | "network"
  | "unknown";

export type OrderMutationResult =
  | { ok: true; replayed?: boolean; order: StaffOrder }
  | { ok: false; code: MutationErrorCode; order?: StaffOrder; message?: string };

export type SessionMutationResult =
  | { ok: true; session: ServiceSession }
  | {
      ok: false;
      code: MutationErrorCode;
      session?: ServiceSession;
      preparing?: number;
      ready?: number;
      message?: string;
    };

export interface NewOrderItemInput {
  menu_id: string;
  quantity: number;
}
