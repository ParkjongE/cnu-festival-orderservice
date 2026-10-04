"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { POLL_MAX_MS, POLL_MIN_MS } from "@/lib/domain/constants";
import type { ChannelHealth } from "@/lib/backend/types";

/** 손님·직원 화면에 보여줄 연결 상태 */
export type ConnectionState = "connecting" | "live" | "degraded" | "offline";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** 창이 다시 보이거나 네트워크가 복구되면 호출한다. */
export function useResume(onResume: () => void) {
  const cb = useRef(onResume);
  useEffect(() => {
    cb.current = onResume;
  });
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") cb.current();
    };
    const onOnline = () => cb.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onOnline);
    };
  }, []);
}

/**
 * active 인 동안, 화면이 보이면 10~15초(무작위) 간격으로 조회한다.
 * 무작위 간격은 많은 기기가 같은 순간에 몰려 요청하지 않게 하기 위함이다.
 */
export function usePolling(active: boolean, poll: () => void) {
  const cb = useRef(poll);
  useEffect(() => {
    cb.current = poll;
  });
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const wait = POLL_MIN_MS + Math.random() * (POLL_MAX_MS - POLL_MIN_MS);
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") cb.current();
        schedule();
      }, wait);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [active]);
}

/** 채널 상태 + 브라우저 온라인 여부 → 화면 연결 상태. 첫 연결은 잠시 'connecting'으로 둔다. */
export function useConnectionState(health: ChannelHealth | null): ConnectionState {
  const online = useOnline();
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGraceOver(true), 5000);
    return () => clearTimeout(t);
  }, []);
  if (!online) return "offline";
  if (health === "live") return "live";
  if (health === null && !graceOver) return "connecting";
  return "degraded";
}
