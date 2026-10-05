"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const EVENT = "ytd-pref-change";

/** 이 기기에만 저장하는 켜기/끄기 설정 (저장이 안 되는 환경에서는 현재 탭에서만 유지) */
const memory = new Map<string, boolean>();

function readFlag(key: string): boolean {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function useDeviceFlag(key: string): [boolean, (v: boolean) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    window.addEventListener(EVENT, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(EVENT, cb);
    };
  }, []);
  const value = useSyncExternalStore(subscribe, () => readFlag(key), () => false);
  const set = useCallback(
    (v: boolean) => {
      try {
        if (v) localStorage.setItem(key, "1");
        else localStorage.removeItem(key);
        memory.delete(key);
      } catch {
        memory.set(key, v);
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}

type WakeLockSentinelLike = { released: boolean; release(): Promise<void>; addEventListener(t: "release", cb: () => void): void };
type WakeLockLike = { request(type: "screen"): Promise<WakeLockSentinelLike> };

function getWakeLock(): WakeLockLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock ?? null;
}

const subscribeNothing = () => () => {};

/**
 * 화면 켜 두기 (Screen Wake Lock). wanted && active 인 동안 화면이 꺼지지 않게 한다.
 * 다른 앱으로 갔다 돌아오면 브라우저가 잠금을 풀기 때문에, 화면이 다시 보일 때 다시 요청한다.
 */
export function useWakeLock(wanted: boolean, active: boolean) {
  const supported = useSyncExternalStore(subscribeNothing, () => getWakeLock() !== null, () => false);
  const [held, setHeld] = useState(false);
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    const api = getWakeLock();
    if (!api || !wanted || !active) return;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible" || (sentinel.current && !sentinel.current.released)) return;
      try {
        const s = await api.request("screen");
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel.current = s;
        setHeld(true);
        s.addEventListener("release", () => setHeld(false));
      } catch {
        setHeld(false);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel.current?.release().catch(() => {});
      sentinel.current = null;
      setHeld(false);
    };
  }, [wanted, active]);

  return { supported, held: held && wanted && active };
}
