"use client";

import { useEffect, useState } from "react";
import { formatServiceDate, formatShortTime } from "@/lib/domain/time";
import type { ServiceSession, StaffOrder } from "@/lib/domain/types";
import type { StaffBackend } from "@/lib/backend/types";
import { OrderDetailDialog } from "./OrderDetailDialog";
import { OrderList } from "./OrderList";

/** 회차별 기록 열람. 종료된 회차는 읽기 전용이다. */
export function SessionHistory({ backend }: { backend: StaffBackend }) {
  const [sessions, setSessions] = useState<ServiceSession[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<ServiceSession | null>(null);
  const [orders, setOrders] = useState<{ sessionId: string; map: Map<string, StaffOrder> } | null>(null);
  const [detail, setDetail] = useState<StaffOrder | null>(null);

  useEffect(() => {
    let alive = true;
    backend.listSessions().then(
      (s) => alive && setSessions(s),
      () => alive && setError(true),
    );
    return () => {
      alive = false;
    };
  }, [backend]);

  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    backend.listOrders(selectedId).then(
      (list) => alive && setOrders({ sessionId: selectedId, map: new Map(list.map((o) => [o.id, o])) }),
      () => alive && setError(true),
    );
    return () => {
      alive = false;
    };
  }, [backend, selectedId]);

  if (error) return <p className="py-10 text-center font-bold text-red">기록을 불러오지 못했어요. 새로고침해주세요.</p>;
  if (!sessions) return <p className="py-10 text-center text-muted">불러오는 중…</p>;

  if (selected) {
    const map = orders?.sessionId === selected.id ? orders.map : null;
    return (
      <div>
        <button type="button" onClick={() => setSelected(null)} className="mb-3 h-10 rounded-lg border-2 border-ink bg-paper px-3 text-sm font-bold">
          ← 회차 목록
        </button>
        <h2 className="font-display text-2xl text-green">{selected.label}</h2>
        <p className="mb-3 text-sm text-muted">
          {formatServiceDate(selected.service_date)} · {selected.state === "open" ? "운영 중 (주문 운영 화면에서 변경)" : "종료됨 · 읽기 전용"}
        </p>
        {map ? (
          <OrderList orders={map} readOnly onOpen={setDetail} />
        ) : (
          <p className="py-10 text-center text-muted">불러오는 중…</p>
        )}
        <OrderDetailDialog
          key={detail?.id ?? "none"}
          order={detail}
          backend={backend}
          readOnly
          busy={false}
          onClose={() => setDetail(null)}
          onTransition={async () => false}
        />
      </div>
    );
  }

  return (
    <section>
      <h2 className="font-display text-2xl text-green">회차 기록</h2>
      <p className="text-sm text-muted">새 회차를 시작해도 이전 기록은 삭제되지 않아요.</p>
      {sessions.length === 0 ? (
        <p className="mt-6 text-muted">아직 회차 기록이 없어요.</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelected(s)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border-[3px] border-ink bg-paper p-3 text-left shadow-hard-sm"
              >
                <span>
                  <b className="block text-base">{s.label}</b>
                  <span className="text-sm text-muted">
                    {formatServiceDate(s.service_date)} · {formatShortTime(s.opened_at)}~{s.closed_at ? formatShortTime(s.closed_at) : ""}
                  </span>
                </span>
                <span className={`rounded-full border-2 border-ink px-2 text-xs font-black ${s.state === "open" ? "bg-green text-paper" : "bg-cream"}`}>
                  {s.state === "open" ? "운영 중" : "종료"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
