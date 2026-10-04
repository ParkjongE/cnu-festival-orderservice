"use client";

import { formatShortTime, minutesSince } from "@/lib/domain/time";
import type { StaffOrder } from "@/lib/domain/types";
import type { Failure } from "@/hooks/useOrderMutations";

export function itemsSummary(order: StaffOrder): string {
  return order.items.map((i) => `${i.name_snapshot} ×${i.quantity}`).join(" · ");
}

export function OrderCard({
  order,
  now,
  busy,
  failure,
  readOnly,
  onPrimary,
  onCancel,
  onOpen,
}: {
  order: StaffOrder;
  now: number;
  busy: boolean;
  failure?: Failure;
  readOnly?: boolean;
  onPrimary: () => void;
  onCancel?: () => void;
  onOpen: () => void;
}) {
  const since = minutesSince(order.created_at, now);
  const readyFor = minutesSince(order.ready_at, now);
  const primary = readOnly
    ? null
    : order.status === "preparing"
      ? { label: "조리 완료", cls: "bg-green text-paper" }
      : order.status === "ready"
        ? { label: "수령 완료", cls: "bg-red text-paper" }
        : null;

  const timeLine =
    order.status === "preparing"
      ? `등록 ${formatShortTime(order.created_at)} · ${since}분 경과`
      : order.status === "ready"
        ? `조리 완료 ${formatShortTime(order.ready_at)} · ${readyFor}분 대기`
        : order.status === "picked_up"
          ? `수령 ${formatShortTime(order.picked_up_at)} · 등록 ${formatShortTime(order.created_at)}`
          : `취소 ${formatShortTime(order.canceled_at)} · 등록 ${formatShortTime(order.created_at)}`;

  return (
    <li className="rounded-xl border-[3px] border-ink bg-paper shadow-hard-sm">
      <div className="flex items-stretch gap-3 p-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-label={`${order.order_number}번 주문 상세`}
        >
          <span className="num w-[5.5rem] shrink-0 text-center text-[3rem] leading-none text-ink">
            {order.order_number}
          </span>
          <span className="min-w-0 flex-1 pt-0.5">
            <span className="block text-sm font-medium text-muted">{timeLine}</span>
            {order.items.length > 0 ? (
              <span className="mt-0.5 block text-[0.95rem] font-bold leading-snug text-ink">{itemsSummary(order)}</span>
            ) : (
              <span className="mt-0.5 block text-sm text-muted">메뉴 미입력</span>
            )}
            {order.staff_note && (
              <span className="mt-1 block truncate rounded bg-yellow/60 px-1.5 text-sm text-ink">
                메모: {order.staff_note}
              </span>
            )}
          </span>
        </button>
        {primary && (
          <div className="flex w-[6.75rem] shrink-0 flex-col gap-1.5 self-center sm:w-[7.5rem]">
            <button
              type="button"
              onClick={onPrimary}
              disabled={busy}
              aria-busy={busy}
              className={`min-h-14 rounded-xl border-[3px] border-ink px-2 text-base font-black shadow-hard-sm transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60 ${primary.cls}`}
            >
              {busy ? "저장 중…" : primary.label}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                aria-label={`${order.order_number}번 주문 취소`}
                className="h-11 rounded-lg border-2 border-red bg-paper text-sm font-bold text-red disabled:opacity-60"
              >
                취소
              </button>
            )}
          </div>
        )}
      </div>
      {failure && (
        <div role="alert" className="flex items-center justify-between gap-2 border-t-2 border-red bg-red/10 px-3 py-2">
          <span className="text-sm font-bold text-red">{failure.message}</span>
          <button
            type="button"
            onClick={failure.retry}
            disabled={busy}
            className="h-10 shrink-0 rounded-lg border-2 border-ink bg-paper px-3 text-sm font-bold"
          >
            다시 시도
          </button>
        </div>
      )}
    </li>
  );
}
