"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STATUS_LABEL, undoTarget } from "@/lib/domain/transitions";
import type { OrderMutationResult, OrderStatus, StaffOrder } from "@/lib/domain/types";
import type { StaffBackend } from "@/lib/backend/types";

export interface Toast {
  id: number;
  message: string;
  tone: "ok" | "warn" | "error";
  undo?: () => void;
}

type TransitionOpts = { reason?: string | null; requestId?: string; isUndo?: boolean };

export interface Failure {
  message: string;
  retry: () => void;
}

const DONE_LABEL: Partial<Record<OrderStatus, string>> = {
  ready: "조리 완료",
  picked_up: "수령 완료",
  canceled: "취소",
  preparing: "준비 중으로 되돌림",
};

export function failureMessage(res: Extract<OrderMutationResult, { ok: false }>): string {
  switch (res.code) {
    case "network":
      return "저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.";
    case "forbidden":
      return "직원 권한이 없어 저장할 수 없어요. 다시 로그인해주세요.";
    case "session_closed":
      return "종료된 회차의 주문은 바꿀 수 없어요.";
    case "not_found":
      return "주문을 찾을 수 없어요. 새로고침해주세요.";
    default:
      return "저장하지 못했어요. 다시 시도해주세요.";
  }
}

/**
 * 주문 상태 변경. 서버 성공 후에만 화면을 바꾼다(낙관적 반영 없음).
 * 네트워크 실패 시 같은 request_id 로 재시도해 같은 작업이 두 번 적용되지 않게 한다.
 */
export function useOrderMutations(
  backend: StaffBackend,
  applyOrder: (o: StaffOrder) => void,
  onSessionClosed: () => void,
) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [failures, setFailures] = useState<Record<string, Failure>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const inFlight = useRef(new Set<string>());
  const toastSeq = useRef(0);
  // 재시도·되돌리기 콜백에서 최신 transition 을 부르기 위한 참조
  const self = useRef<(o: StaffOrder, to: OrderStatus, opts?: TransitionOpts) => Promise<boolean>>(async () => false);

  const showToast = useCallback((t: Omit<Toast, "id">) => setToast({ ...t, id: ++toastSeq.current }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const transition = useCallback(
    async (order: StaffOrder, to: OrderStatus, opts: TransitionOpts = {}): Promise<boolean> => {
      if (inFlight.current.has(order.id)) return false; // 저장 중 중복 탭 방지
      const requestId = opts.requestId ?? crypto.randomUUID();
      const retry = () => void self.current(order, to, { ...opts, requestId });

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setFailures((f) => ({ ...f, [order.id]: { message: "오프라인 상태예요. 연결된 뒤 다시 시도해주세요.", retry } }));
        return false;
      }

      inFlight.current.add(order.id);
      setBusy((b) => ({ ...b, [order.id]: true }));
      let res: OrderMutationResult;
      try {
        res = await backend.transition({
          orderId: order.id,
          to,
          expectedRevision: order.revision,
          requestId,
          reason: opts.reason ?? null,
        });
      } catch (e) {
        res = { ok: false, code: "network", message: (e as Error).message };
      }
      inFlight.current.delete(order.id);
      setBusy((b) => ({ ...b, [order.id]: false }));

      if (res.ok) {
        applyOrder(res.order);
        setFailures((f) => {
          const rest = { ...f };
          delete rest[order.id];
          return rest;
        });
        const n = res.order.order_number;
        const target = undoTarget(order.status, res.order.status);
        if (opts.isUndo) {
          showToast({ tone: "ok", message: `${n}번을 '${STATUS_LABEL[res.order.status]}'(으)로 되돌렸어요.` });
        } else {
          const after = res.order;
          showToast({
            tone: "ok",
            message: `${n}번 ${DONE_LABEL[to] ?? STATUS_LABEL[to]}`,
            undo: target ? () => void self.current(after, target, { isUndo: true }) : undefined,
          });
        }
        return true;
      }

      if (res.order) applyOrder(res.order);
      if (res.code === "stale" || res.code === "invalid_transition") {
        showToast({
          tone: "warn",
          message: opts.isUndo
            ? `${order.order_number}번은 이후에 다른 변경이 있어 되돌리지 않았어요.`
            : `${order.order_number}번은 다른 기기에서 먼저 바뀌었어요. 최신 상태를 확인해주세요.`,
        });
        return false;
      }
      if (res.code === "session_closed") {
        showToast({ tone: "error", message: failureMessage(res) });
        onSessionClosed();
        return false;
      }
      setFailures((f) => ({ ...f, [order.id]: { message: failureMessage(res), retry } }));
      return false;
    },
    [backend, applyOrder, onSessionClosed, showToast],
  );

  useEffect(() => {
    self.current = transition;
  }, [transition]);

  return { busy, failures, toast, showToast, dismissToast, transition };
}
