"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/** 손님이 선택한 회차·번호. UI 상태일 뿐이며 주문 상태의 기준은 항상 서버다. */
export interface StoredSelection {
  sessionId: string;
  number: number;
}

const EVENT = "ytd-selection-change";

// localStorage 를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 현재 탭 메모리에만 보관한다
const memory = new Map<string, string | null>();

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStoredSelection(key: string) {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    window.addEventListener(EVENT, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(EVENT, cb);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);

  const selection = useMemo<StoredSelection | null>(() => {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as StoredSelection;
      return typeof v.sessionId === "string" && Number.isInteger(v.number) ? v : null;
    } catch {
      return null;
    }
  }, [raw]);

  const save = useCallback(
    (next: StoredSelection | null) => {
      const value = next ? JSON.stringify(next) : null;
      try {
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
        memory.delete(key);
      } catch {
        memory.set(key, value);
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return { selection, save, hydrated: useSyncExternalStore(subscribe, () => true, () => false) };
}
