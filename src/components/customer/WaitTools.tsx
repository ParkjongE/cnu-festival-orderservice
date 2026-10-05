"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { playReadyAlert, unlockAlerts, vibrationSupported } from "@/lib/alert";

const subscribeNothing = () => () => {};

function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 rounded-xl border-2 border-ink bg-paper px-3 py-2.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-ink">{label}</span>
        <span className="block text-sm leading-snug text-muted">{description}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-8 w-14 shrink-0 rounded-full border-2 border-ink transition-colors ${
          checked ? "bg-green" : "bg-cream"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full border-2 border-ink bg-paper transition-all ${
            checked ? "left-[1.6rem]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/** 주문을 기다리는 동안 쓰는 '화면 켜 두기' · '완료 알림' 설정 */
export function WaitTools({
  wakeSupported,
  wakeWanted,
  wakeHeld,
  onWake,
  alertOn,
  onAlert,
}: {
  wakeSupported: boolean;
  wakeWanted: boolean;
  wakeHeld: boolean;
  onWake: (v: boolean) => void;
  alertOn: boolean;
  onAlert: (v: boolean) => void;
}) {
  const canVibrate = useSyncExternalStore(subscribeNothing, vibrationSupported, () => false);
  const [tested, setTested] = useState(false);

  // 설정이 켜져 있으면, 새로고침 후 첫 탭에서 소리·진동 권한을 다시 깨운다 (브라우저 정책상 탭이 필요)
  useEffect(() => {
    if (!alertOn) return;
    const unlock = () => void unlockAlerts();
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [alertOn]);

  return (
    <div className="mt-3 grid gap-2">
      {wakeSupported && (
        <Switch
          label="화면 켜 두기"
          description={
            wakeWanted && !wakeHeld
              ? "화면으로 돌아오면 다시 켜져요."
              : "주문이 나올 때까지 화면이 자동으로 꺼지지 않아요. (배터리를 조금 더 써요)"
          }
          checked={wakeWanted}
          onChange={onWake}
        />
      )}
      <Switch
        label="완료되면 소리·진동"
        description={
          <>
            이 화면을 보고 있을 때 ‘조리 완료’가 되면 띵동 소리{canVibrate ? "와 진동으" : "으"}로 알려드려요.
            {!canVibrate && " 무음 모드에서는 소리가 나지 않아요."}
          </>
        }
        checked={alertOn}
        onChange={(v) => {
          onAlert(v);
          if (v) {
            void unlockAlerts();
            setTested(false);
          }
        }}
      />
      {alertOn && (
        <button
          type="button"
          onClick={() => {
            void playReadyAlert();
            setTested(true);
          }}
          className="h-11 justify-self-start rounded-lg border-2 border-line px-3 text-sm font-bold text-muted"
        >
          {tested ? "다시 들어보기" : "알림 소리 미리 듣기"}
        </button>
      )}
    </div>
  );
}
