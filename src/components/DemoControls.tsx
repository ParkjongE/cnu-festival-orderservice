"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { isDemoOffline, onDemoMessage, resetDemo, setDemoOffline } from "@/lib/backend/demo/backend";

/** 데모 전용 조작: 다른 화면 열기, 연결 끊김 흉내, 데모 데이터 초기화 */
export function DemoControls({ other }: { other: { href: string; label: string } }) {
  const offline = useSyncExternalStore(
    (cb) => onDemoMessage((m) => m.type === "offline" && cb()),
    isDemoOffline,
    () => false,
  );

  const base = "h-9 rounded-md border-2 border-ink px-2.5 text-xs font-bold";
  const btn = `${base} bg-paper text-ink`;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <Link href={other.href} target="_blank" className={`${btn} inline-flex items-center`}>
        {other.label} 새 탭 ↗
      </Link>
      <button type="button" aria-pressed={offline} onClick={() => setDemoOffline(!offline)} className={offline ? `${base} bg-ink text-paper` : btn}>
        {offline ? "연결 복구" : "연결 끊기"}
      </button>
      <button
        type="button"
        onClick={() => {
          setDemoOffline(false);
          resetDemo();
        }}
        className={btn}
      >
        데모 초기화
      </button>
    </div>
  );
}
