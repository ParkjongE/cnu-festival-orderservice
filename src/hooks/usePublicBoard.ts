"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pickedUpList, readyList } from "@/lib/domain/board";
import { RECENT_PICKED_UP_PAGE } from "@/lib/domain/constants";
import type { PublicOrderStatus, PublicServiceState } from "@/lib/domain/types";
import type { ChannelHealth, PublicBackend } from "@/lib/backend/types";
import { useConnectionState, usePolling, useResume } from "./sync";

export type LookupState = "idle" | "loading" | "found" | "not_found" | "error";

type Rows = Map<string, PublicOrderStatus>;

/** 같은 번호에 신호가 몰려도(가짜 신호 포함) 조회는 최소 이 간격으로만 한다 */
const HINT_MIN_GAP_MS = 1000;

/**
 * 손님 화면 동기화. 화면에 보이는 상태는 항상 서버 조회(public_board) 결과다.
 * 1) public_board 한 번 조회 (회차·목록·내 번호)
 * 2) 번호를 입력했다면 '내 번호' Broadcast 채널 구독 → "바뀌었음" 신호가 오면 다시 조회
 * 3) 구독 완료(SUBSCRIBED) 시 재조회로 구독 직전 사이의 변경을 보정
 * 4) 창 복귀·온라인 복귀 시 재조회, 5) 화면이 보이는 동안 10~15초 주기 조회(목록·회차 변경)
 * 응답 순서가 뒤바뀌어도 마지막으로 보낸 요청의 결과만 반영한다(fetchSeq).
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

  const fetchSeq = useRef(0);

  const refresh = useCallback(
    async (number: number | null, pickedUpLimit: number) => {
      const seq = ++fetchSeq.current;
      try {
        // 회차·목록·내 번호를 요청 한 번으로 가져온다
        const board = await backend.getBoard(pickedUpLimit, number);
        if (seq !== fetchSeq.current) return;
        const sessionId = board.service.is_open ? board.service.session_id : null;
        const next: Rows = new Map();
        for (const r of [...board.ready, ...board.pickedUp]) next.set(r.order_id, r);
        if (board.mine) next.set(board.mine.order_id, board.mine);
        setService(board.service);
        setHasMorePicked(board.hasMorePickedUp);
        setRows(next);
        setLookup(number !== null && sessionId && !board.mine ? { number, state: "not_found" } : null);
        setLastSyncedAt(new Date());
        setPhase("ready");
      } catch {
        if (seq !== fetchSeq.current) return;
        setPhase((p) => (p === "loading" ? "error" : p));
        // 이미 확인된 결과가 있으면 유지하고, 처음 조회하던 번호만 오류로 표시한다
        if (number !== null) setLookup((l) => (l?.number === number ? l : { number, state: "error" }));
      }
    },
    [backend],
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

  // '내 번호' 신호 구독. 회차나 번호가 바뀌면 다시 구독한다.
  // (다른 번호들의 변화와 회차 변경은 아래 주기 조회로 반영한다)
  const subscribedSession = service?.is_open ? service.session_id : null;
  const channelKey = `${subscribedSession}:${myNumber}`;
  useEffect(() => {
    const key = `${subscribedSession}:${myNumber}`;
    if (!subscribedSession || myNumber === null) {
      return;
    }
    let wasLive = false;
    let lastHint = 0;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    const onHint = () => {
      const wait = Math.max(0, lastHint + HINT_MIN_GAP_MS - Date.now());
      if (hintTimer) return;
      hintTimer = setTimeout(() => {
        hintTimer = undefined;
        lastHint = Date.now();
        refreshLatest();
      }, wait);
    };
    const unsubscribe = backend.subscribe(subscribedSession, myNumber, {
      onChanged: onHint,
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
    return () => {
      clearTimeout(hintTimer);
      unsubscribe();
    };
  }, [backend, subscribedSession, myNumber, refreshLatest]);

  useResume(refreshLatest);

  // 번호가 없으면 실시간 구독이 필요 없다 → 주기 조회만으로 정상('idle')
  const needsChannel = Boolean(subscribedSession) && myNumber !== null;
  const health: ChannelHealth | null = !needsChannel
    ? "idle"
    : channel && channel.key === channelKey
      ? channel.health
      : null;
  const connection = useConnectionState(health);
  // 목록(수령 가능·최근 수령 완료)과 회차 변경은 화면이 보이는 동안 10~15초마다 갱신한다.
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
