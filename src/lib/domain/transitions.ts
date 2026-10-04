import type { OrderStatus } from "./types";

export type TransitionAction =
  | "mark_ready"
  | "mark_picked_up"
  | "undo_ready"
  | "undo_picked_up"
  | "cancel"
  | "restore";

/**
 * 허용된 상태 전이. 마이그레이션의 private.transition_action 과 같은 표를 유지한다.
 * restore 는 취소 직전 상태(canceled_from)로만 가능하다.
 */
export function transitionAction(
  from: OrderStatus,
  to: OrderStatus,
  canceledFrom: OrderStatus | null,
): TransitionAction | null {
  if (from === "preparing" && to === "ready") return "mark_ready";
  if (from === "ready" && to === "picked_up") return "mark_picked_up";
  if (from === "ready" && to === "preparing") return "undo_ready";
  if (from === "picked_up" && to === "ready") return "undo_picked_up";
  if ((from === "preparing" || from === "ready") && to === "canceled") return "cancel";
  if (from === "canceled" && canceledFrom !== null && to === canceledFrom) return "restore";
  return null;
}

/** 방금 한 동작을 되돌릴 때의 목표 상태 */
export function undoTarget(from: OrderStatus, to: OrderStatus): OrderStatus | null {
  if (from === "preparing" && to === "ready") return "preparing";
  if (from === "ready" && to === "picked_up") return "ready";
  if (to === "canceled" && (from === "preparing" || from === "ready")) return from;
  return null;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  preparing: "준비 중",
  ready: "수령 대기",
  picked_up: "수령 완료",
  canceled: "취소",
};

export const ACTION_LABEL: Record<TransitionAction | "create", string> = {
  create: "주문 등록",
  mark_ready: "조리 완료",
  mark_picked_up: "수령 완료",
  undo_ready: "조리 완료 되돌림",
  undo_picked_up: "수령 완료 되돌림",
  cancel: "주문 취소",
  restore: "취소 복원",
};
