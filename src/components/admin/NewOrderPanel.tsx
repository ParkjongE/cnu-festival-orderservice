"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { MAX_ITEM_QUANTITY, NOTE_MAX_LENGTH } from "@/lib/domain/constants";
import { orderNumberErrorMessage, parseOrderNumber, sanitizeOrderNumberInput } from "@/lib/domain/order-number";
import { formatWon } from "@/lib/domain/time";
import type { Menu, StaffOrder } from "@/lib/domain/types";
import type { StaffBackend } from "@/lib/backend/types";
import { MinusIcon, PlusIcon } from "@/components/ui/icons";
import { failureMessage } from "@/hooks/useOrderMutations";

type Problem = { message: string; existing?: StaffOrder };

export function NewOrderPanel({
  backend,
  sessionId,
  menus,
  onCreated,
  onShowOrder,
}: {
  backend: StaffBackend;
  sessionId: string;
  menus: Menu[];
  onCreated: (o: StaffOrder) => void;
  onShowOrder: (o: StaffOrder) => void;
}) {
  const [number, setNumber] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // 같은 입력으로 다시 보내는 재시도는 같은 request_id 를 써서 중복 등록을 막는다
  const requestId = useRef<string | null>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const numberId = useId();

  const touched = () => {
    requestId.current = null;
    setProblem(null);
    setDone(null);
  };

  const total = menus.reduce((sum, m) => sum + (qty[m.id] ?? 0) * m.price_krw, 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = parseOrderNumber(number);
    if (!parsed.ok) {
      setProblem({ message: orderNumberErrorMessage(parsed.reason) });
      numberRef.current?.focus();
      return;
    }
    if (!navigator.onLine) {
      setProblem({ message: "오프라인 상태예요. 연결된 뒤 다시 등록해주세요." });
      return;
    }
    requestId.current ??= crypto.randomUUID();
    setSaving(true);
    setProblem(null);
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([menu_id, quantity]) => ({ menu_id, quantity }));
    let res;
    try {
      res = await backend.createOrder({
        sessionId,
        orderNumber: parsed.value,
        items,
        note: note.trim() || null,
        requestId: requestId.current,
      });
    } catch (err) {
      res = { ok: false as const, code: "network" as const, message: (err as Error).message };
    }
    setSaving(false);

    if (res.ok) {
      onCreated(res.order);
      requestId.current = null;
      setNumber("");
      setQty({});
      setNote("");
      setDone(`${res.order.order_number}번 등록 완료`);
      numberRef.current?.focus();
      return;
    }
    if (res.code === "duplicate_number") {
      requestId.current = null;
      setProblem({ message: "이미 등록된 번호예요.", existing: res.order });
    } else if (res.code === "invalid_number") {
      requestId.current = null;
      setProblem({ message: orderNumberErrorMessage("out_of_range") });
    } else if (res.code === "invalid_items") {
      requestId.current = null;
      setProblem({ message: "메뉴 또는 수량을 확인해주세요." });
    } else {
      // 네트워크 등: 같은 request_id 를 유지한 채 다시 시도할 수 있다
      setProblem({ message: failureMessage(res) });
    }
  }

  function step(id: string, delta: number) {
    touched();
    setQty((q) => ({ ...q, [id]: Math.min(MAX_ITEM_QUANTITY, Math.max(0, (q[id] ?? 0) + delta)) }));
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border-[3px] border-ink bg-paper p-4 shadow-hard" noValidate>
      <h2 className="font-display text-xl text-green">주문 등록</h2>
      <div className="mt-3 flex gap-2">
        <label htmlFor={numberId} className="sr-only">
          주문번호 (필수)
        </label>
        <input
          id={numberId}
          ref={numberRef}
          value={number}
          onChange={(e) => {
            touched();
            setNumber(sanitizeOrderNumberInput(e.target.value));
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="번호"
          aria-invalid={problem && !problem.existing ? true : undefined}
          className="num h-16 w-full min-w-0 rounded-xl border-[3px] border-ink bg-white px-3 text-center text-[2.2rem] placeholder:font-sans placeholder:text-lg placeholder:text-muted/70"
        />
        <button
          type="submit"
          disabled={saving}
          className="h-16 shrink-0 rounded-xl border-[3px] border-ink bg-red px-5 text-lg font-black text-paper shadow-hard-sm disabled:opacity-60"
        >
          {saving ? "저장 중…" : "등록"}
        </button>
      </div>

      {problem && (
        <div role="alert" className="mt-2 rounded-lg border-2 border-red bg-red/10 px-3 py-2 text-sm font-bold text-red">
          {problem.message}
          {problem.existing && (
            <button
              type="button"
              onClick={() => onShowOrder(problem.existing!)}
              className="ml-2 underline underline-offset-2"
            >
              기존 주문 보기
            </button>
          )}
        </div>
      )}
      {done && !problem && (
        <p role="status" className="mt-2 text-sm font-bold text-green">
          ✓ {done}
        </p>
      )}

      <fieldset className="mt-3">
        <legend className="text-sm font-bold text-muted">메뉴·수량 (선택)</legend>
        <ul className="mt-1.5 grid gap-1.5">
          {menus.map((m) => {
            const q = qty[m.id] ?? 0;
            return (
              <li key={m.id} className={`flex items-center gap-2 rounded-lg border-2 px-2 py-1 ${q > 0 ? "border-ink bg-yellow/40" : "border-line"}`}>
                <span className="min-w-0 flex-1 text-[0.95rem] font-bold leading-tight">
                  {m.name}
                  <span className="block text-xs font-medium text-muted">{formatWon(m.price_krw)}</span>
                </span>
                <button type="button" onClick={() => step(m.id, -1)} disabled={q === 0} aria-label={`${m.name} 빼기`} className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-ink bg-paper disabled:opacity-30">
                  <MinusIcon className="h-5 w-5" />
                </button>
                <span className="num w-7 text-center text-xl" aria-live="polite">{q}</span>
                <button type="button" onClick={() => step(m.id, 1)} aria-label={`${m.name} 추가`} className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-ink bg-paper">
                  <PlusIcon className="h-5 w-5" />
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <label className="mt-3 block">
        <span className="text-sm font-bold text-muted">직원 메모 (선택)</span>
        <input
          value={note}
          onChange={(e) => {
            touched();
            setNote(e.target.value.slice(0, NOTE_MAX_LENGTH));
          }}
          className="mt-1 h-11 w-full rounded-lg border-2 border-ink bg-white px-3"
          placeholder="예: 소스 따로"
        />
      </label>

      {total > 0 && (
        <p className="mt-2 flex justify-between text-sm">
          <span className="text-muted">참고 금액 (결제 확인용 아님)</span>
          <span className="font-black">{formatWon(total)}</span>
        </p>
      )}
    </form>
  );
}
