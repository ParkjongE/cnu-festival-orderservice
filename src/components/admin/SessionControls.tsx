"use client";

import { useState, type FormEvent } from "react";
import { formatServiceDate, seoulDate } from "@/lib/domain/time";
import type { ServiceSession, SessionMutationResult } from "@/lib/domain/types";
import type { StaffBackend } from "@/lib/backend/types";
import { ConfirmDialog } from "./Dialog";

function defaultLabel(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일 운영`;
}

export function OpenSessionForm({
  backend,
  onOpened,
}: {
  backend: StaffBackend;
  onOpened: (s: ServiceSession) => void;
}) {
  const [date, setDate] = useState(seoulDate);
  const [label, setLabel] = useState(() => defaultLabel(seoulDate()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    let res: SessionMutationResult;
    try {
      res = await backend.openSession(label, date);
    } catch {
      res = { ok: false, code: "network" };
    }
    setSaving(false);
    if (res.ok) return onOpened(res.session);
    if (res.code === "session_already_open" && res.session) return onOpened(res.session);
    setError(
      res.code === "invalid_label"
        ? "회차 이름을 1~60자로 입력해주세요."
        : res.code === "invalid_date"
          ? "운영 날짜를 확인해주세요."
          : res.code === "forbidden"
            ? "직원 권한이 없어요."
            : "회차를 시작하지 못했어요. 연결을 확인하고 다시 시도해주세요.",
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md rounded-2xl border-[3px] border-ink bg-paper p-5 shadow-hard">
      <h2 className="font-display text-2xl text-green">운영 회차 시작</h2>
      <p className="mt-1 text-[0.95rem] text-muted">
        열린 회차가 없어요. 회차를 시작하면 손님 화면에서 주문번호를 확인할 수 있어요. 이전 회차 기록은 그대로 보존돼요.
      </p>
      <label className="mt-4 block">
        <span className="text-sm font-bold text-muted">운영 날짜 (서울 기준)</span>
        <input
          type="date"
          required
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            if (e.target.value) setLabel(defaultLabel(e.target.value));
          }}
          className="mt-1 h-12 w-full rounded-lg border-2 border-ink bg-white px-3"
        />
      </label>
      <label className="mt-3 block">
        <span className="text-sm font-bold text-muted">회차 이름</span>
        <input
          required
          maxLength={60}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 h-12 w-full rounded-lg border-2 border-ink bg-white px-3"
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-red">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="mt-4 h-14 w-full rounded-xl border-[3px] border-ink bg-green text-lg font-black text-paper shadow-hard-sm disabled:opacity-60"
      >
        {saving ? "시작하는 중…" : "회차 시작"}
      </button>
    </form>
  );
}

export function CloseSessionDialog({
  open,
  session,
  activeCount,
  backend,
  onClose,
  onClosed,
}: {
  open: boolean;
  session: ServiceSession;
  activeCount: { preparing: number; ready: number };
  backend: StaffBackend;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = activeCount.preparing + activeCount.ready > 0;

  async function confirm() {
    if (blocked) return onClose();
    setSaving(true);
    setError(null);
    let res: SessionMutationResult;
    try {
      res = await backend.closeSession(session.id);
    } catch {
      res = { ok: false, code: "network" };
    }
    setSaving(false);
    if (res.ok || res.code === "session_closed") return onClosed();
    setError(
      res.code === "has_active_orders"
        ? `아직 처리되지 않은 주문이 있어요 (준비 중 ${res.preparing ?? 0}건, 수령 대기 ${res.ready ?? 0}건).`
        : "회차를 종료하지 못했어요. 연결을 확인하고 다시 시도해주세요.",
    );
  }

  return (
    <ConfirmDialog
      open={open}
      title={blocked ? "아직 종료할 수 없어요" : `‘${session.label}’ 회차를 종료할까요?`}
      confirmLabel={blocked ? "확인" : "회차 종료"}
      tone={blocked ? "green" : "red"}
      busy={saving}
      onCancel={onClose}
      onConfirm={confirm}
    >
      {blocked ? (
        <p>
          준비 중 <b>{activeCount.preparing}건</b>, 수령 대기 <b>{activeCount.ready}건</b>이 남아 있어요. 먼저 수령 완료 또는
          취소로 정리해주세요.
        </p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-[0.95rem]">
          <li>
            {formatServiceDate(session.service_date)} · {session.label}
          </li>
          <li>손님 화면은 ‘지금은 주문 안내를 쉬고 있어요’로 바뀌어요.</li>
          <li>이 회차의 주문은 더 이상 바꿀 수 없어요. 기록은 ‘회차 기록’에서 볼 수 있어요.</li>
        </ul>
      )}
      {error && <p className="text-sm font-bold text-red">{error}</p>}
    </ConfirmDialog>
  );
}
