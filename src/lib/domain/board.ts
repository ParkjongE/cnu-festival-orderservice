import type { PublicOrderStatus, StaffOrder } from "./types";

const ts = (v: string | null | undefined) => (v ? Date.parse(v) : 0);

/** revision 이 같거나 더 오래된 이벤트는 무시한다. 변경되면 true. */
export function mergeByRevision<T extends { revision: number }>(
  map: Map<string, T>,
  id: string,
  incoming: T,
): boolean {
  const current = map.get(id);
  if (current && current.revision >= incoming.revision) return false;
  map.set(id, incoming);
  return true;
}

/** 수령 가능: 조리 완료 시각이 오래된 순 */
export function readyList(rows: Iterable<PublicOrderStatus>): PublicOrderStatus[] {
  return [...rows]
    .filter((r) => r.status === "ready")
    .sort((a, b) => ts(a.ready_at) - ts(b.ready_at) || a.order_number - b.order_number);
}

/** 준비 중: 번호 순 (부스가 얼마나 바쁜지 보여주는 용도. 번호 순서와 완료 순서는 다를 수 있다) */
export function preparingList(rows: Iterable<PublicOrderStatus>): PublicOrderStatus[] {
  return [...rows].filter((r) => r.status === "preparing").sort((a, b) => a.order_number - b.order_number);
}

export type StaffTab = "preparing" | "ready" | "picked_up" | "canceled";

/** 직원 탭별 정렬: 준비 중은 등록순, 수령 대기는 조리 완료순, 완료·취소는 최근 변경순 */
export function staffTabList(orders: Iterable<StaffOrder>, tab: StaffTab): StaffOrder[] {
  const list = [...orders].filter((o) => o.status === tab);
  switch (tab) {
    case "preparing":
      return list.sort((a, b) => ts(a.created_at) - ts(b.created_at) || a.order_number - b.order_number);
    case "ready":
      return list.sort((a, b) => ts(a.ready_at) - ts(b.ready_at) || a.order_number - b.order_number);
    default:
      return list.sort((a, b) => ts(b.updated_at) - ts(a.updated_at) || b.order_number - a.order_number);
  }
}

export function orderTotal(order: Pick<StaffOrder, "items">): number {
  return order.items.reduce((sum, i) => sum + i.unit_price_krw * i.quantity, 0);
}

export function toPublicStatus(o: StaffOrder): PublicOrderStatus {
  return {
    order_id: o.id,
    session_id: o.session_id,
    order_number: o.order_number,
    status: o.status,
    revision: o.revision,
    ready_at: o.ready_at,
    picked_up_at: o.picked_up_at,
    updated_at: o.updated_at,
  };
}
