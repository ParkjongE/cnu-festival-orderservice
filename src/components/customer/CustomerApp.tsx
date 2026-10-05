"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_MENUS } from "@/lib/domain/constants";
import { formatClock } from "@/lib/domain/time";
import type { Menu } from "@/lib/domain/types";
import type { PublicBackend } from "@/lib/backend/types";
import { usePublicBoard } from "@/hooks/usePublicBoard";
import { useStoredSelection } from "@/hooks/useStoredSelection";
import type { ConnectionState } from "@/hooks/sync";
import { CheckerStrip, CustomerHeader, DemoBadge } from "@/components/brand/Brand";
import { InfoIcon, SignalOffIcon } from "@/components/ui/icons";
import { MenuSection, PreparingBoard, ReadyBoard } from "./Boards";
import { ErrorCard, LoadingCard, NumberForm, RestingCard, StatusCard } from "./MyOrderCard";

function ConnectionLine({
  connection,
  lastSyncedAt,
  label,
}: {
  connection: ConnectionState;
  lastSyncedAt: Date | null;
  label: string | null;
}) {
  if (connection === "degraded" || connection === "offline") {
    return (
      <div role="status" className="mb-3 flex items-start gap-2 rounded-xl border-2 border-red bg-paper px-3 py-2.5 text-[0.95rem]">
        <SignalOffIcon className="mt-0.5 h-5 w-5 shrink-0 text-red" />
        <p>
          <strong className="block text-red">연결을 확인하고 있어요</strong>
          <span className="text-muted">
            마지막 확인 {lastSyncedAt ? formatClock(lastSyncedAt) : "--:--:--"} · 표시된 상태가 최신이 아닐 수 있어요.
          </span>
        </p>
      </div>
    );
  }
  return (
    <p className="mb-2 flex items-center justify-between gap-2 px-1 text-sm text-muted">
      <span className="truncate">{label ? `${label} 운영 중` : ""}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {connection === "live" ? (
          <>
            <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-ink bg-green" />
            실시간 확인 중
          </>
        ) : connection === "idle" ? (
          <>
            <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-ink bg-green" />
            자동 확인 중
          </>
        ) : (
          <>
            <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-ink bg-yellow" />
            연결 중…
          </>
        )}
      </span>
    </p>
  );
}

export function CustomerApp({ backend, demoControls }: { backend: PublicBackend; demoControls?: React.ReactNode }) {
  const storageKey = backend.kind === "demo" ? "ytd-demo-my-order" : "ytd-my-order";
  const { selection, save, hydrated } = useStoredSelection(storageKey);
  const board = usePublicBoard(backend, selection?.number ?? null);
  const [menus, setMenus] = useState<Menu[]>(DEFAULT_MENUS);

  useEffect(() => {
    let alive = true;
    backend.listMenus().then(
      (m) => alive && m.length > 0 && setMenus(m),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [backend]);

  const service = board.service;
  const openSessionId = service?.is_open ? service.session_id : null;
  // 이전 회차에서 저장한 번호는 현재 주문으로 자동 연결하지 않는다
  const sessionMismatch = Boolean(selection && openSessionId && selection.sessionId !== openSessionId);
  const activeNumber = selection && !sessionMismatch && openSessionId ? selection.number : null;

  const card = useMemo(() => {
    if (!hydrated || board.phase === "loading") return <LoadingCard />;
    if (board.phase === "error") return <ErrorCard onRetry={board.retry} />;
    if (!openSessionId) return <RestingCard />;
    if (activeNumber !== null) {
      return (
        <StatusCard
          number={activeNumber}
          row={board.mine}
          lookupState={board.lookupState}
          onChange={() => save(null)}
          onRetry={board.retry}
        />
      );
    }
    return (
      <NumberForm
        onSubmit={(n) => save({ sessionId: openSessionId, number: n })}
        notice={
          sessionMismatch ? (
            <p className="mt-3 rounded-lg border-2 border-ink bg-yellow px-3 py-2 text-[0.95rem] font-bold text-ink">
              새 운영 회차가 시작됐어요. 이번 주문번호를 다시 입력해주세요.
            </p>
          ) : null
        }
      />
    );
  }, [hydrated, board.phase, board.retry, board.mine, board.lookupState, openSessionId, activeNumber, sessionMismatch, save]);

  return (
    <div className="flex min-h-dvh flex-col">
      <CustomerHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10">
        {backend.kind === "demo" && (
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            <DemoBadge />
            {demoControls}
          </div>
        )}

        {board.phase !== "loading" && (
          <ConnectionLine connection={board.connection} lastSyncedAt={board.lastSyncedAt} label={service?.is_open ? service.session_label : null} />
        )}

        {card}

        <p className="mt-4 flex items-start gap-2 px-1 text-[0.95rem] leading-snug text-muted">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-green" />
          <span>이 페이지에서 완료 여부를 확인해주세요. 화면을 닫거나 잠그면 별도 알림은 오지 않아요.</span>
        </p>

        {openSessionId && board.phase === "ready" && (
          <>
            <ReadyBoard rows={board.ready} myNumber={activeNumber} />
            <PreparingBoard rows={board.preparing} myNumber={activeNumber} />
          </>
        )}

        <MenuSection menus={menus} />

        <footer className="mt-8 space-y-1 px-1 text-sm text-muted">
          <p>· 주문과 결제는 부스에서 해주세요. 이 페이지는 준비 상태만 알려드려요.</p>
          <p>· 주문할 때 안내받은 주문번호를 기억해주세요.</p>
          <p>· 번호 순서와 준비 순서는 다를 수 있어요.</p>
        </footer>
      </main>
      <CheckerStrip />
    </div>
  );
}
