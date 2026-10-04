"use client";

import { useState } from "react";
import { NOTE_MAX_LENGTH } from "@/lib/domain/constants";
import { STATUS_LABEL } from "@/lib/domain/transitions";
import type { StaffOrder } from "@/lib/domain/types";
import type { Failure } from "@/hooks/useOrderMutations";
import { ConfirmDialog } from "./Dialog";

/** 주문 카드에서 바로 여는 취소 확인창. 사유는 선택이며 직원에게만 보인다. */
export function CancelOrderDialog({
  order,
  busy,
  failure,
  onConfirm,
  onClose,
}: {
  order: StaffOrder | null;
  busy: boolean;
  failure?: Failure;
  onConfirm: (order: StaffOrder, reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      open={order !== null}
      title={order ? `${order.order_number}번 주문을 취소할까요?` : ""}
      confirmLabel="주문 취소"
      tone="red"
      busy={busy}
      onCancel={onClose}
      onConfirm={() => order && onConfirm(order, reason)}
    >
      {order && (
        <>
          <p>
            현재 <b>{STATUS_LABEL[order.status]}</b> 상태예요. 취소하면 손님 화면에 ‘취소된 주문이에요’로 표시돼요.
          </p>
          <p className="text-sm text-muted">
            잘못 눌렀다면 바로 뜨는 ‘되돌리기’나 주문 상세의 ‘취소 복원’으로 되돌릴 수 있어요.
          </p>
          <label className="block">
            <span className="text-sm font-bold text-muted">취소 사유 (선택, 직원에게만 보여요)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, NOTE_MAX_LENGTH))}
              className="mt-1 h-12 w-full rounded-lg border-2 border-ink bg-white px-3"
              placeholder="예: 손님 요청, 번호 입력 실수"
            />
          </label>
          {failure && <p className="text-sm font-bold text-red">{failure.message}</p>}
        </>
      )}
    </ConfirmDialog>
  );
}
