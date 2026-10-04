"use client";

import { useEffect, useState } from "react";
import { orderTotal } from "@/lib/domain/board";
import { NOTE_MAX_LENGTH } from "@/lib/domain/constants";
import { formatClock, formatWon } from "@/lib/domain/time";
import { ACTION_LABEL, STATUS_LABEL } from "@/lib/domain/transitions";
import type { OrderEvent, OrderStatus, StaffOrder } from "@/lib/domain/types";
import type { StaffBackend } from "@/lib/backend/types";
import type { Failure } from "@/hooks/useOrderMutations";
import { ConfirmDialog, Dialog } from "./Dialog";

export const STATUS_CHIP: Record<OrderStatus, string> = {
  preparing: "bg-yellow text-ink",
  ready: "bg-green text-paper",
  picked_up: "bg-cream text-ink",
  canceled: "bg-paper text-red",
};

type Pending = { to: OrderStatus; title: string; body: string; label: string; tone: "red" | "green"; reason?: boolean };

export function OrderDetailDialog({
  order,
  backend,
  readOnly,
  busy,
  failure,
  onClose,
  onTransition,
}: {
  order: StaffOrder | null;
  backend: StaffBackend;
  readOnly: boolean;
  busy: boolean;
  failure?: Failure;
  onClose: () => void;
  onTransition: (order: StaffOrder, to: OrderStatus, reason?: string | null) => Promise<boolean>;
}) {
  const [events, setEvents] = useState<{ orderId: string; revision: number; list: OrderEvent[] } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");

  const orderId = order?.id;
  const revision = order?.revision;
  useEffect(() => {
    if (!orderId || revision === undefined) return;
    let alive = true;
    backend.listEvents(orderId).then(
      (list) => alive && setEvents({ orderId, revision, list }),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [backend, orderId, revision]);

  if (!order) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>;

  const total = orderTotal(order);
  const history = events?.orderId === order.id ? events.list : null;
  const n = order.order_number;

  const actions: (Pending & { primary?: boolean; direct?: boolean })[] = [];
  if (!readOnly) {
    if (order.status === "preparing") {
      actions.push({ to: "ready", label: "조리 완료", title: "", body: "", tone: "green", primary: true, direct: true });
      actions.push({ to: "canceled", label: "주문 취소", title: `${n}번 주문을 취소할까요?`, body: "손님 화면에 '취소된 주문이에요'로 표시돼요. 이후 '취소 복원'으로 되돌릴 수 있어요.", tone: "red", reason: true });
    }
    if (order.status === "ready") {
      actions.push({ to: "picked_up", label: "수령 완료", title: "", body: "", tone: "red", primary: true, direct: true });
      actions.push({ to: "preparing", label: "준비 중으로 되돌리기", title: `${n}번을 준비 중으로 되돌릴까요?`, body: "손님 화면의 '지금 받아가세요' 목록에서 빠지고 다시 '준비 중'으로 보여요.", tone: "green" });
      actions.push({ to: "canceled", label: "주문 취소", title: `${n}번 주문을 취소할까요?`, body: "손님 화면에 '취소된 주문이에요'로 표시돼요. 이후 '취소 복원'으로 되돌릴 수 있어요.", tone: "red", reason: true });
    }
    if (order.status === "picked_up") {
      actions.push({ to: "ready", label: "수령 대기로 되돌리기", title: `${n}번을 수령 대기로 되돌릴까요?`, body: "손님 화면에서 다시 '조리 완료'로 보여요. 실제로 전달하지 않은 경우에만 사용하세요.", tone: "green" });
    }
    if (order.status === "canceled" && order.canceled_from) {
      const back = order.canceled_from;
      actions.push({ to: back, label: `취소 복원 (${STATUS_LABEL[back]})`, title: `${n}번 취소를 복원할까요?`, body: `취소 직전 상태인 '${STATUS_LABEL[back]}'(으)로 돌아가고 손님 화면에도 반영돼요.`, tone: "green" });
    }
  }

  async function run(to: OrderStatus, withReason?: boolean) {
    if (!order) return;
    const ok = await onTransition(order, to, withReason ? reason : null);
    if (ok) {
      setPending(null);
      setReason("");
    }
  }

  return (
    <>
      <Dialog open={!pending} onClose={onClose} wide title={<span className="num text-[2.4rem] text-ink">{n}번</span>}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border-2 border-ink px-3 py-0.5 text-sm font-black ${STATUS_CHIP[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
          <span className="text-sm text-muted">등록 {formatClock(order.created_at)}</span>
        </div>

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.95rem]">
          {order.ready_at && (<><dt className="text-muted">조리 완료</dt><dd>{formatClock(order.ready_at)}</dd></>)}
          {order.picked_up_at && (<><dt className="text-muted">수령 완료</dt><dd>{formatClock(order.picked_up_at)}</dd></>)}
          {order.canceled_at && (<><dt className="text-muted">취소</dt><dd>{formatClock(order.canceled_at)}</dd></>)}
          {order.cancel_reason && (<><dt className="text-muted">취소 사유</dt><dd>{order.cancel_reason}</dd></>)}
          {order.staff_note && (<><dt className="text-muted">메모</dt><dd>{order.staff_note}</dd></>)}
        </dl>

        <div className="mt-3 rounded-xl border-2 border-ink bg-cream/50 p-3">
          {order.items.length === 0 ? (
            <p className="text-sm text-muted">메뉴를 입력하지 않은 주문이에요.</p>
          ) : (
            <>
              <ul className="space-y-1">
                {order.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2 text-[0.95rem]">
                    <span className="font-bold">{i.name_snapshot} ×{i.quantity}</span>
                    <span className="text-muted">{formatWon(i.unit_price_krw * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t-2 border-dashed border-line pt-2 text-sm">
                <span className="text-muted">참고 금액 (결제 확인용 아님)</span>
                <span className="font-black">{formatWon(total)}</span>
              </p>
            </>
          )}
        </div>

        {failure && (
          <div role="alert" className="mt-3 flex items-center justify-between gap-2 rounded-lg border-2 border-red bg-red/10 px-3 py-2">
            <span className="text-sm font-bold text-red">{failure.message}</span>
            <button type="button" onClick={failure.retry} disabled={busy} className="h-10 shrink-0 rounded-lg border-2 border-ink bg-paper px-3 text-sm font-bold">
              다시 시도
            </button>
          </div>
        )}

        {actions.length > 0 && (
          <div className="mt-4 grid gap-2">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                disabled={busy}
                onClick={() => (a.direct ? void run(a.to) : setPending(a))}
                className={`min-h-12 rounded-xl border-[3px] border-ink px-3 font-black disabled:opacity-60 ${
                  a.primary
                    ? `${a.tone === "green" ? "bg-green" : "bg-red"} text-paper shadow-hard-sm`
                    : a.to === "canceled"
                      ? "bg-paper text-red"
                      : "bg-cream text-ink"
                }`}
              >
                {busy && a.primary ? "저장 중…" : a.label}
              </button>
            ))}
          </div>
        )}
        {readOnly && <p className="mt-4 text-sm text-muted">종료된 회차의 기록은 열람만 할 수 있어요.</p>}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-bold text-muted">변경 이력</summary>
          {history === null ? (
            <p className="mt-2 text-sm text-muted">불러오는 중…</p>
          ) : (
            <ol className="mt-2 space-y-1 text-sm">
              {history.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="num w-[4.5rem] shrink-0 text-muted">{formatClock(e.created_at)}</span>
                  <span>
                    {ACTION_LABEL[e.action as keyof typeof ACTION_LABEL] ?? e.action}
                    {e.reason ? ` — ${e.reason}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </details>
      </Dialog>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.title}
        confirmLabel={pending?.label ?? ""}
        tone={pending?.tone}
        busy={busy}
        onCancel={() => {
          setPending(null);
          setReason("");
        }}
        onConfirm={() => pending && void run(pending.to, pending.reason)}
      >
        <p>{pending?.body}</p>
        {pending?.reason && (
          <label className="block">
            <span className="text-sm font-bold text-muted">취소 사유 (선택, 직원에게만 보여요)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, NOTE_MAX_LENGTH))}
              className="mt-1 h-12 w-full rounded-lg border-2 border-ink bg-white px-3"
              placeholder="예: 번호 입력 실수"
            />
          </label>
        )}
        {failure && <p className="text-sm font-bold text-red">{failure.message}</p>}
      </ConfirmDialog>
    </>
  );
}
