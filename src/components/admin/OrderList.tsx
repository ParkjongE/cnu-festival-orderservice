"use client";

import { useEffect, useMemo, useState } from "react";
import { staffTabList, type StaffTab } from "@/lib/domain/board";
import { parseOrderNumber, sanitizeOrderNumberInput } from "@/lib/domain/order-number";
import { STATUS_LABEL } from "@/lib/domain/transitions";
import type { StaffOrder } from "@/lib/domain/types";
import type { Failure } from "@/hooks/useOrderMutations";
import { SearchIcon } from "@/components/ui/icons";
import { OrderCard } from "./OrderCard";

const TABS: StaffTab[] = ["preparing", "ready", "picked_up", "canceled"];

const EMPTY: Record<StaffTab, string> = {
  preparing: "준비 중인 주문이 없어요.",
  ready: "수령 대기 중인 주문이 없어요.",
  picked_up: "수령 완료된 주문이 없어요.",
  canceled: "취소된 주문이 없어요.",
};

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** 탭(건수) + 번호 검색 + 주문 카드 목록 */
export function OrderList({
  orders,
  readOnly,
  busy,
  failures,
  onPrimary,
  onOpen,
}: {
  orders: Map<string, StaffOrder>;
  readOnly?: boolean;
  busy?: Record<string, boolean>;
  failures?: Record<string, Failure>;
  onPrimary?: (o: StaffOrder) => void;
  onOpen: (o: StaffOrder) => void;
}) {
  const [tab, setTab] = useState<StaffTab>("preparing");
  const [query, setQuery] = useState("");
  const now = useNow();

  const all = useMemo(() => [...orders.values()], [orders]);
  const counts = useMemo(() => {
    const c: Record<StaffTab, number> = { preparing: 0, ready: 0, picked_up: 0, canceled: 0 };
    for (const o of all) c[o.status] += 1;
    return c;
  }, [all]);

  const parsed = parseOrderNumber(query);
  const list = useMemo(() => {
    const rows = staffTabList(all, tab);
    if (!query) return rows;
    return rows.filter((o) => String(o.order_number).includes(query.replace(/^0+(?=\d)/, "")));
  }, [all, tab, query]);
  const exactElsewhere =
    parsed.ok && !list.some((o) => o.order_number === parsed.value)
      ? all.find((o) => o.order_number === parsed.value)
      : undefined;

  return (
    <section>
      <div role="tablist" aria-label="주문 상태" className="grid grid-cols-4 gap-1 rounded-xl border-[3px] border-ink bg-ink p-1">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex min-h-14 flex-col items-center justify-center rounded-lg px-1 text-sm font-bold leading-tight ${
              tab === t ? "bg-yellow text-ink" : "bg-transparent text-paper"
            }`}
          >
            {STATUS_LABEL[t]}
            <span className="num text-xl">{counts[t]}</span>
          </button>
        ))}
      </div>

      <label className="relative mt-3 block">
        <span className="sr-only">번호 검색</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(sanitizeOrderNumberInput(e.target.value))}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="번호 검색"
          className="h-12 w-full rounded-xl border-2 border-ink bg-paper pl-10 pr-10 text-base"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="검색 지우기"
            className="absolute right-1 top-1/2 h-10 w-10 -translate-y-1/2 text-lg font-bold text-muted"
          >
            ✕
          </button>
        )}
      </label>

      {exactElsewhere && (
        <p className="mt-2 text-sm">
          {exactElsewhere.order_number}번은 ‘{STATUS_LABEL[exactElsewhere.status]}’에 있어요.{" "}
          <button type="button" className="font-bold underline underline-offset-2" onClick={() => setTab(exactElsewhere.status)}>
            이동
          </button>{" "}
          <button type="button" className="font-bold underline underline-offset-2" onClick={() => onOpen(exactElsewhere)}>
            상세 보기
          </button>
        </p>
      )}

      {list.length === 0 ? (
        <p className="mt-6 text-center text-base text-muted">{query ? "검색 결과가 없어요." : EMPTY[tab]}</p>
      ) : (
        <ul className="mt-3 grid gap-2.5 xl:grid-cols-2">
          {list.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              now={now}
              readOnly={readOnly}
              busy={Boolean(busy?.[o.id])}
              failure={failures?.[o.id]}
              onPrimary={() => onPrimary?.(o)}
              onOpen={() => onOpen(o)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
