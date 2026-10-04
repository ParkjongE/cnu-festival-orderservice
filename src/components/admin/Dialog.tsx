"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** 네이티브 <dialog> 기반 모달. 포커스 가두기·Esc 닫기를 브라우저가 처리한다. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] ${
        wide ? "max-w-lg" : "max-w-sm"
      } overflow-y-auto rounded-2xl border-[3px] border-ink bg-paper p-0 text-ink shadow-hard-lg backdrop:bg-ink/55`}
    >
      {open && (
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-[1.45rem] leading-tight text-green">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 -mt-1 h-10 w-10 shrink-0 rounded-lg border-2 border-ink text-lg font-bold"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "red",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  tone?: "red" | "green";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="space-y-3 text-base">{children}</div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-12 rounded-xl border-2 border-ink bg-cream font-bold">
          아니요
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`h-12 rounded-xl border-2 border-ink font-bold text-paper shadow-hard-sm disabled:opacity-60 ${
            tone === "red" ? "bg-red" : "bg-green"
          }`}
        >
          {busy ? "저장 중…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
