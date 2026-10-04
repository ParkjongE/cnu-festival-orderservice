"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeByRevision, pickedUpList, readyList } from "@/lib/domain/board";
import { RECENT_PICKED_UP_PAGE } from "@/lib/domain/constants";
import type { PublicOrderStatus, PublicServiceState } from "@/lib/domain/types";
import type { ChannelHealth, PublicBackend } from "@/lib/backend/types";
import { useConnectionState, usePolling, useResume } from "./sync";

export type LookupState = "idle" | "loading" | "found" | "not_found" | "error";

type Rows = Map<string, PublicOrderStatus>;

/**
 * 손님 화면 동기화.
 * 1) public_board 한 번 조회 → 2) 회차 변경 + 내 번호 변경 구독 → 3) 구독 완료(SUBSCRIBED) 시 재조회로 사이 누락 보정
 * 4) 이벤트는 revision 비교로 병합 → 5) 창 복귀·온라인 복귀 시 재조회 → 6) 목록은 10~15초 주기 조회
 */
export function usePublicBoard(backend: PublicBackend, myNumber: number | null) {
  const [service, setService] = useState<PublicServiceState | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [channel, setChannel] = useState<{ key: string; health: ChannelHealth } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [pickedLimit, setPickedLimit] = useState(RECENT_PICKED_UP_PAGE);
  const [hasMorePicked, setHasMorePicked] = useState(false);
  const [rows, setRows] = useState<Rows>(() => new Map());
  const [lookup, setLookup] = useState<{ number: number; state: "loading" | "not_found" | "error" } | null>(null);

  const sessionRef = useRef<string | null>(null);
  const pending = useRef<PublicOrderStatus[] | null>(null);
  const fetchSeq = useRef(0);
  const serviceUpdatedAt = useRef(0);

  /** 회차가 바뀌었으면 true */
  const applyService = useCallback((next: PublicServiceState) => {
    const at = Date.parse(next.updated_at);
    if (at < serviceUpdatedAt.current) return false;
    serviceUpdatedAt.current = at;
    const sessionId = next.is_open ? next.session_id : null;
    const changed = sessionId !== sessionRef.current;
    if (changed) {
      sessionRef.current = sessionId;
      pending.current = null;
      setRows(new Map());
    }
    setService(next);
    return changed;
  }, []);

  const refresh = useCallback(
    async (number: number | null, pickedUpLimit: number) => {
      const seq = ++fetchSeq.current;
      if (pending.current === null) pending.current = [];
      try {
        // 회차·목록·내 번호를 요청 한 번으로 가져온다
        const board = await backend.getBoard(pickedUpLimit, number);
        if (seq !== fetchSeq.current) return;
        applyService(board.service);
        const sessionId = board.service.is_open ? board.service.session_id : null;
        const next: Rows = new Map();
        for (const r of [...board.ready, ...board.pickedUp]) next.set(r.order_id, r);
        if (board.mine) next.set(board.mine.order_id, board.mine);
        const mineFound = board.mine !== null;
        setHasMorePicked(board.hasMorePickedUp);
        // 조회하는 동안 도착한 실시간 이벤트를 다시 적용한다 (revision 이 높은 것만 반영)
        for (const e of pending.current ?? []) {
          if (e.session_id === sessionId) mergeByRevision(next, e.order_id, e);
        }
        pending.current = null;
        setRows(next);
        setLookup(number !== null && sessionId && !mineFound ? { number, state: "not_found" } : null);
        setLastSyncedAt(new Date());
        setPhase("ready");
      } catch {
        if (seq !== fetchSeq.current) return;
        pending.current = null;
        setPhase((p) => (p === "loading" ? "error" : p));
        // 이미 확인된 결과가 있으면 유지하고, 처음 조회하던 번호만 오류로 표시한다
        if (number !== null) setLookup((l) => (l?.number === number ? l : { number, state: "error" }));
      }
    },
    [backend, applyService],
  );

  // 최신 값을 콜백에서 쓰기 위한 참조
  const latest = useRef({ myNumber, pickedLimit });
  useEffect(() => {
    latest.current = { myNumber, pickedLimit };
  });
  const refreshLatest = useCallback(
    () => void refresh(latest.current.myNumber, latest.current.pickedLimit),
    [refresh],
  );

  // 최초 조회 / 번호 변경 / 더 보기
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버(외부 시스템) 조회 결과를 비동기로 반영한다
    void refresh(myNumber, pickedLimit);
  }, [refresh, myNumber, pickedLimit]);

  // 회차 변경 + '내 번호' 변경만 실시간 구독. 회차나 번호가 바뀌면 다시 구독한다.
  // (다른 번호들의 변화는 아래 주기 조회로 목록에 반영한다)
  const subscribedSession = service?.is_open ? service.session_id : null;
  const channelKey = `${subscribedSession}:${myNumber}`;
  useEffect(() => {
    let wasLive = false;
    const key = `${subscribedSession}:${myNumber}`;
    const unsubscribe = backend.subscribe(subscribedSession, myNumber, {
      onServiceState: (s) => {
        if (applyService(s)) refreshLatest();
      },
      onStatus: (row) => {
        if (row.session_id !== sessionRef.current) return;
        pending.current?.push(row);
        setRows((prev) => {
          const next = new Map(prev);
          return mergeByRevision(next, row.order_id, row) ? next : prev;
        });
        setLastSyncedAt(new Date());
      },
      onHealth: (health) => {
        setChannel({ key, health });
        if (health === "live") {
          setLastSyncedAt(new Date());
          if (!wasLive) refreshLatest(); // 구독 직전·재연결 사이 누락 보정
          wasLive = true;
        } else {
          wasLive = false;
        }
      },
    });
    return unsubscribe;
  }, [backend, subscribedSession, myNumber, applyService, refreshLatest]);

  useResume(refreshLatest);

  const health = channel && channel.key === channelKey ? channel.health : null;
  const connection = useConnectionState(health);
  // 목록(수령 가능·최근 수령 완료)은 화면이 보이는 동안 10~15초마다 갱신한다.
  // 실시간 연결이 끊긴 경우에도 같은 주기로 내 번호 상태까지 함께 확인된다.
  usePolling(phase !== "loading", refreshLatest);

  const view = useMemo(() => {
    const all = [...rows.values()];
    return {
      ready: readyList(all),
      pickedUp: pickedUpList(all, pickedLimit),
      mine: myNumber === null ? null : (all.find((r) => r.order_number === myNumber) ?? null),
    };
  }, [rows, pickedLimit, myNumber]);

  let lookupState: LookupState = "idle";
  if (myNumber !== null) {
    if (view.mine) lookupState = "found";
    else if (lookup?.number === myNumber) lookupState = lookup.state;
    else lookupState = "loading";
  }

  return {
    phase,
    service,
    connection,
    lastSyncedAt,
    ready: view.ready,
    pickedUp: view.pickedUp,
    hasMorePicked,
    mine: view.mine,
    lookupState,
    loadMorePicked: () => setPickedLimit((l) => l + RECENT_PICKED_UP_PAGE),
    retry: refreshLatest,
  };
}
