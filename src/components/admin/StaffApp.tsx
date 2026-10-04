"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatClock, formatServiceDate } from "@/lib/domain/time";
import type { ServiceSession, StaffOrder } from "@/lib/domain/types";
import type { StaffBackend, StaffUser } from "@/lib/backend/types";
import { useStaffBoard } from "@/hooks/useStaffBoard";
import { useOrderMutations, type Toast } from "@/hooks/useOrderMutations";
import type { ConnectionState } from "@/hooks/sync";
import { BrandTitle, CheckerStrip, DemoBadge } from "@/components/brand/Brand";
import { UndoIcon } from "@/components/ui/icons";
import { UNDO_WINDOW_MS } from "@/lib/domain/constants";
import { NewOrderPanel } from "./NewOrderPanel";
import { OrderDetailDialog } from "./OrderDetailDialog";
import { OrderList } from "./OrderList";
import { CloseSessionDialog, OpenSessionForm } from "./SessionControls";
import { SessionHistory } from "./SessionHistory";

function ConnectionPill({ connection, lastSyncedAt }: { connection: ConnectionState; lastSyncedAt: Date | null }) {
  const map: Record<ConnectionState, { label: string; dot: string }> = {
    live: { label: "실시간 연결됨", dot: "bg-green" },
    connecting: { label: "연결 중…", dot: "bg-yellow" },
    degraded: { label: "연결 확인 중", dot: "bg-red" },
    offline: { label: "오프라인", dot: "bg-red" },
  };
  const s = map[connection];
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm font-bold">
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full border border-ink ${s.dot}`} />
      {s.label}
      {connection !== "live" && lastSyncedAt && (
        <span className="font-medium text-muted">· 마지막 확인 {formatClock(lastSyncedAt)}</span>
      )}
    </span>
  );
}

function ToastBar({ toast, onDismiss }: { toast: Toast | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, toast.undo ? UNDO_WINDOW_MS : 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);
  if (!toast) return null;
  const tone =
    toast.tone === "ok" ? "bg-ink text-paper" : toast.tone === "warn" ? "bg-yellow text-ink" : "bg-red text-paper";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <div
        role="status"
        key={toast.id}
        className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border-[3px] border-ink px-4 py-3 shadow-hard ${tone}`}
      >
        <span className="flex-1 text-base font-bold">{toast.message}</span>
        {toast.undo && (
          <button
            type="button"
            onClick={() => {
              toast.undo?.();
              onDismiss();
            }}
            className="inline-flex h-11 items-center gap-1 rounded-lg border-2 border-paper px-3 font-black"
          >
            <UndoIcon className="h-4 w-4" /> 되돌리기
          </button>
        )}
      </div>
    </div>
  );
}

function StaffHeader({
  demo,
  user,
  right,
}: {
  demo: boolean;
  user: StaffUser | null;
  right?: React.ReactNode;
}) {
  return (
    <header className="border-b-[3px] border-ink bg-paper">
      <div aria-hidden className="checker h-2.5" />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <BrandTitle size="sm" />
          <span className="rounded border-2 border-ink px-1.5 text-xs font-black">직원</span>
          {demo && <DemoBadge />}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {right}
          {user && !demo && <span className="hidden text-muted sm:inline">{user.email}</span>}
        </div>
      </div>
    </header>
  );
}

function Console({ backend, demo, user, onSignOut }: { backend: StaffBackend; demo: boolean; user: StaffUser | null; onSignOut: () => void }) {
  const board = useStaffBoard(backend, true);
  const [view, setView] = useState<"orders" | "history">("orders");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const { refresh, applyOrder } = board;
  const onSessionClosed = useCallback(() => void refresh(), [refresh]);
  const m = useOrderMutations(backend, applyOrder, onSessionClosed);

  const counts = useMemo(() => {
    let preparing = 0;
    let ready = 0;
    for (const o of board.orders.values()) {
      if (o.status === "preparing") preparing++;
      if (o.status === "ready") ready++;
    }
    return { preparing, ready };
  }, [board.orders]);

  const detail = detailId ? (board.orders.get(detailId) ?? null) : null;
  const session = board.session;

  const primary = (o: StaffOrder) => {
    if (o.status === "preparing") void m.transition(o, "ready");
    else if (o.status === "ready") void m.transition(o, "picked_up");
  };

  return (
    <div className="min-h-dvh pb-24">
      <StaffHeader
        demo={demo}
        user={user}
        right={
          <>
            <button
              type="button"
              onClick={() => setView(view === "orders" ? "history" : "orders")}
              className="h-10 rounded-lg border-2 border-ink bg-cream px-3 font-bold"
            >
              {view === "orders" ? "회차 기록" : "주문 운영"}
            </button>
            {!demo && (
              <button type="button" onClick={onSignOut} className="h-10 rounded-lg border-2 border-ink px-3 font-bold">
                로그아웃
              </button>
            )}
          </>
        }
      />

      <div className="border-b-2 border-ink bg-cream">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
          <p className="text-base">
            {session === undefined ? (
              <span className="text-muted">회차 확인 중…</span>
            ) : session ? (
              <>
                <b className="font-black text-green">{session.label}</b>
                <span className="text-muted"> · {formatServiceDate(session.service_date)} · </span>
                <span className="font-bold text-green">운영 중</span>
              </>
            ) : (
              <span className="font-bold text-red">열린 회차 없음 · 손님 화면은 ‘운영 전/종료’ 안내 중</span>
            )}
          </p>
          <div className="flex items-center gap-3">
            <ConnectionPill connection={board.connection} lastSyncedAt={board.lastSyncedAt} />
            {session && view === "orders" && (
              <button type="button" onClick={() => setClosing(true)} className="h-10 rounded-lg border-2 border-red px-3 text-sm font-bold text-red">
                회차 종료
              </button>
            )}
          </div>
        </div>
      </div>

      {(board.connection === "degraded" || board.connection === "offline") && (
        <p role="alert" className="mx-auto mt-3 max-w-6xl px-4 text-sm font-bold text-red">
          {board.connection === "offline"
            ? "오프라인 상태예요. 연결될 때까지 주문을 바꿀 수 없어요."
            : "실시간 연결을 다시 시도하고 있어요. 목록은 10~15초마다 자동으로 다시 확인해요."}
        </p>
      )}

      <main className="mx-auto max-w-6xl px-4 pt-4">
        {view === "history" ? (
          <SessionHistory backend={backend} />
        ) : board.phase === "loading" ? (
          <p className="py-16 text-center text-lg text-muted">불러오는 중…</p>
        ) : board.phase === "error" ? (
          <div className="py-16 text-center">
            <p className="text-lg font-bold text-red">주문 목록을 불러오지 못했어요.</p>
            <button type="button" onClick={() => void board.refresh()} className="mt-3 h-12 rounded-xl border-2 border-ink bg-paper px-5 font-bold">
              다시 시도
            </button>
          </div>
        ) : !session ? (
          <OpenSessionForm backend={backend} onOpened={() => void board.refresh()} />
        ) : (
          <div className="grid gap-5 md:grid-cols-[22rem_1fr] md:items-start">
            <div className="md:sticky md:top-4">
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                aria-expanded={showForm}
                className="mb-2 h-10 w-full rounded-lg border-2 border-ink bg-paper text-sm font-bold md:hidden"
              >
                {showForm ? "주문 등록 접기" : "+ 주문 등록 열기"}
              </button>
              <div className={showForm ? "" : "hidden md:block"}>
                <NewOrderPanel
                  backend={backend}
                  sessionId={session.id}
                  menus={board.menus}
                  onCreated={(o) => applyOrder(o)}
                  onShowOrder={(o) => {
                    applyOrder(o);
                    setDetailId(o.id);
                  }}
                />
              </div>
            </div>
            <OrderList
              orders={board.orders}
              busy={m.busy}
              failures={m.failures}
              onPrimary={primary}
              onOpen={(o) => setDetailId(o.id)}
            />
          </div>
        )}
      </main>

      {view === "orders" && (
        <OrderDetailDialog
          key={detailId ?? "none"}
          order={detail}
          backend={backend}
          readOnly={false}
          busy={detail ? Boolean(m.busy[detail.id]) : false}
          failure={detail ? m.failures[detail.id] : undefined}
          onClose={() => setDetailId(null)}
          onTransition={(o, to, reason) => m.transition(o, to, { reason })}
        />
      )}

      {session && (
        <CloseSessionDialog
          key={closing ? "open" : "closed"}
          open={closing}
          session={session as ServiceSession}
          activeCount={counts}
          backend={backend}
          onClose={() => setClosing(false)}
          onClosed={() => {
            setClosing(false);
            void board.refresh();
          }}
        />
      )}

      <ToastBar toast={m.toast} onDismiss={m.dismissToast} />
    </div>
  );
}

/** 직원 화면. 운영 모드에서는 로그인과 직원 권한(staff_members)을 확인한 뒤에만 보여준다. */
export function StaffApp({ backend }: { backend: StaffBackend }) {
  const demo = backend.kind === "demo";
  const router = useRouter();
  const [auth, setAuth] = useState<{ state: "checking" } | { state: "ok"; user: StaffUser } | { state: "denied"; user: StaffUser } | { state: "error" }>({
    state: "checking",
  });

  const check = useCallback(async () => {
    try {
      const user = await backend.getUser();
      if (!user) {
        router.replace("/admin/login");
        return;
      }
      const staff = await backend.isStaff();
      setAuth(staff ? { state: "ok", user } : { state: "denied", user });
    } catch {
      setAuth({ state: "error" });
    }
  }, [backend, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버에서 로그인·직원 권한을 확인한다
    void check();
    return backend.onAuthChange((user) => {
      if (!user) router.replace("/admin/login");
    });
  }, [backend, check, router]);

  const signOut = async () => {
    await backend.signOut();
    router.replace("/admin/login");
  };

  if (auth.state === "ok") return <Console backend={backend} demo={demo} user={auth.user} onSignOut={signOut} />;

  return (
    <div className="min-h-dvh">
      <StaffHeader demo={demo} user={null} />
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        {auth.state === "checking" && <p className="text-lg text-muted">직원 권한 확인 중…</p>}
        {auth.state === "error" && (
          <>
            <p className="text-lg font-bold text-red">권한을 확인하지 못했어요. 연결을 확인해주세요.</p>
            <button type="button" onClick={() => void check()} className="mt-3 h-12 rounded-xl border-2 border-ink bg-paper px-5 font-bold">
              다시 시도
            </button>
          </>
        )}
        {auth.state === "denied" && (
          <>
            <p className="text-lg font-bold text-red">직원 권한이 없는 계정이에요.</p>
            <p className="mt-1 text-muted">{auth.user.email} — 관리자에게 직원 등록을 요청해주세요.</p>
            <button type="button" onClick={() => void signOut()} className="mt-4 h-12 rounded-xl border-2 border-ink bg-paper px-5 font-bold">
              다른 계정으로 로그인
            </button>
          </>
        )}
        <Link href="/" className="mt-8 block text-sm text-muted underline">
          손님 화면으로
        </Link>
      </main>
      <CheckerStrip />
    </div>
  );
}
