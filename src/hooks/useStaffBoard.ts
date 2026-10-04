"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Menu, PublicServiceState, ServiceSession, StaffOrder } from "@/lib/domain/types";
import type { ChannelHealth, StaffBackend } from "@/lib/backend/types";
import { useConnectionState, usePolling, useResume } from "./sync";

type Orders = Map<string, StaffOrder>;

function mergeOrder(prev: Orders, order: StaffOrder): Orders {
  const cur = prev.get(order.id);
  if (cur && cur.revision >= order.revision) return prev;
  const next = new Map(prev);
  next.set(order.id, order);
  return next;
}

/** 직원 화면 동기화: 현재 열린 회차와 주문 목록. 손님 화면과 같은 재조회·보조 조회 규칙을 쓴다. */
export function useStaffBoard(backend: StaffBackend, enabled: boolean) {
  const [session, setSession] = useState<ServiceSession | null | undefined>(undefined);
  const [orders, setOrders] = useState<Orders>(() => new Map());
  const [menus, setMenus] = useState<Menu[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [channel, setChannel] = useState<{ session: string | null; health: ChannelHealth } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const sessionRef = useRef<string | null>(null);
  const ordersRef = useRef<Orders>(orders);
  useEffect(() => {
    ordersRef.current = orders;
  });
  const pending = useRef<StaffOrder[] | null>(null);
  const fetchSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const seq = ++fetchSeq.current;
    if (pending.current === null) pending.current = [];
    try {
      const [open, menuList] = await Promise.all([backend.getOpenSession(), backend.listMenus()]);
      if (seq !== fetchSeq.current) return;
      const list = open ? await backend.listOrders(open.id) : [];
      if (seq !== fetchSeq.current) return;
      let next: Orders = new Map(list.map((o) => [o.id, o]));
      for (const e of pending.current ?? []) if (e.session_id === open?.id) next = mergeOrder(next, e);
      pending.current = null;
      sessionRef.current = open?.id ?? null;
      setSession(open);
      setMenus(menuList);
      setOrders(next);
      setLastSyncedAt(new Date());
      setPhase("ready");
    } catch {
      if (seq !== fetchSeq.current) return;
      pending.current = null;
      setPhase((p) => (p === "loading" ? "error" : p));
    }
  }, [backend, enabled]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버(외부 시스템) 조회 결과를 비동기로 반영한다
    void refresh();
  }, [refresh]);

  /** 서버가 확정한 주문(변경 결과·실시간 이벤트)을 revision 비교로 반영한다. */
  const applyOrder = useCallback((order: StaffOrder) => {
    if (order.session_id !== sessionRef.current) return;
    pending.current?.push(order);
    setOrders((prev) => mergeOrder(prev, order));
  }, []);

  const subscribedSession = enabled ? (session?.id ?? null) : null;
  useEffect(() => {
    if (!enabled) return;
    let wasLive = false;
    let alive = true;
    const unsubscribe = backend.subscribe(subscribedSession, {
      onOrder: (row) => {
        if (row.session_id !== sessionRef.current) return;
        setLastSyncedAt(new Date());
        if (row.items) {
          applyOrder(row as StaffOrder);
          return;
        }
        // 실시간 행에는 메뉴 항목이 없다. 이미 아는 주문이면 항목을 유지하고, 새 주문이면 상세를 조회한다.
        const cur = ordersRef.current.get(row.id);
        if (!cur) {
          void backend.getOrder(row.id).then((o) => alive && o && applyOrder(o), () => {});
        } else if (cur.revision < row.revision) {
          applyOrder({ ...row, items: cur.items });
        }
      },
      onServiceState: (s: PublicServiceState) => {
        const open = s.is_open ? s.session_id : null;
        if (open !== sessionRef.current) void refresh();
      },
      onHealth: (health) => {
        setChannel({ session: subscribedSession, health });
        if (health === "live") {
          setLastSyncedAt(new Date());
          if (!wasLive) void refresh();
          wasLive = true;
        } else {
          wasLive = false;
        }
      },
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [backend, enabled, subscribedSession, applyOrder, refresh]);

  useResume(() => void refresh());

  const health = channel && channel.session === subscribedSession ? channel.health : null;
  const connection = useConnectionState(health);
  usePolling(enabled && phase !== "loading" && connection !== "live", () => void refresh());

  return { session, orders, menus, phase, connection, lastSyncedAt, refresh, applyOrder, setSession };
}
