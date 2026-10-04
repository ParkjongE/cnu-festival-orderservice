import type { PostgrestError, RealtimeChannel } from "@supabase/supabase-js";
import type {
  Menu,
  MutationErrorCode,
  OrderEvent,
  OrderMutationResult,
  PublicServiceState,
  ServiceSession,
  SessionMutationResult,
  StaffOrder,
} from "@/lib/domain/types";
import type { StaffBackend, StaffSubscription, StaffUser } from "../types";
import { getSupabase } from "./client";

const ORDER_SELECT =
  "id,session_id,order_number,status,revision,created_at,updated_at,ready_at,picked_up_at,canceled_at,canceled_from,cancel_reason,staff_note,created_by,items:order_items(id,menu_id,name_snapshot,unit_price_krw,quantity)";
const SESSION_SELECT = "id,label,service_date,state,opened_at,closed_at";

let channelSeq = 0;

/** RPC 가 예외를 던진 경우(권한·검증·네트워크)를 화면용 오류 코드로 바꾼다. */
function rpcFailure(error: PostgrestError | Error | null): { ok: false; code: MutationErrorCode; message?: string } {
  if (!error) return { ok: false, code: "unknown" };
  const pg = error as PostgrestError;
  if (pg.code === "42501") return { ok: false, code: "forbidden", message: pg.message };
  if (pg.hint === "invalid_items") return { ok: false, code: "invalid_items", message: pg.message };
  if (!pg.code || /fetch|network/i.test(error.message)) return { ok: false, code: "network", message: error.message };
  return { ok: false, code: "unknown", message: error.message };
}

function toUser(u: { id: string; email?: string | null } | null | undefined): StaffUser | null {
  return u ? { id: u.id, email: u.email ?? null } : null;
}

function withItems(order: StaffOrder): StaffOrder {
  return { ...order, items: [...(order.items ?? [])] };
}

export function createSupabaseStaffBackend(): StaffBackend {
  // 서버 렌더링 중에는 클라이언트를 만들지 않도록 처음 사용할 때 생성한다
  const sb = () => getSupabase();

  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T | ReturnType<typeof rpcFailure>> {
    try {
      const { data, error } = await sb().rpc(fn, args);
      if (error) return rpcFailure(error);
      return data as T;
    } catch (e) {
      return rpcFailure(e as Error);
    }
  }

  return {
    kind: "supabase",

    async getUser() {
      const { data } = await sb().auth.getSession();
      return toUser(data.session?.user);
    },

    async signIn(email, password) {
      const { error } = await sb().auth.signInWithPassword({ email, password });
      if (error) {
        const message =
          error.status === 400 || /invalid/i.test(error.message)
            ? "이메일 또는 비밀번호가 맞지 않아요."
            : error.status === 429
              ? "로그인 시도가 많아요. 잠시 후 다시 시도해주세요."
              : "로그인하지 못했어요. 연결을 확인하고 다시 시도해주세요.";
        return { ok: false, message };
      }
      return { ok: true };
    },

    async signOut() {
      await sb().auth.signOut();
    },

    async isStaff() {
      const { data, error } = await sb().rpc("am_i_staff");
      if (error) throw error;
      return data === true;
    },

    onAuthChange(cb) {
      const { data } = sb().auth.onAuthStateChange((_event, session) => cb(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },

    async getOpenSession() {
      const { data, error } = await sb().from("service_sessions").select(SESSION_SELECT).eq("state", "open").maybeSingle();
      if (error) throw error;
      return (data as ServiceSession | null) ?? null;
    },

    async listSessions() {
      const { data, error } = await sb()
        .from("service_sessions")
        .select(SESSION_SELECT)
        .order("opened_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as ServiceSession[];
    },

    async listOrders(sessionId) {
      const { data, error } = await sb()
        .from("orders")
        .select(ORDER_SELECT)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return ((data ?? []) as StaffOrder[]).map(withItems);
    },

    async getOrder(orderId) {
      const { data, error } = await sb().from("orders").select(ORDER_SELECT).eq("id", orderId).maybeSingle();
      if (error) throw error;
      return data ? withItems(data as StaffOrder) : null;
    },

    async listEvents(orderId) {
      const { data, error } = await sb()
        .from("order_events")
        .select("id,order_id,actor_id,action,from_status,to_status,revision,created_at,reason")
        .eq("order_id", orderId)
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrderEvent[];
    },

    async listMenus() {
      const { data, error } = await sb()
        .from("menus")
        .select("id,name,price_krw,sort_order,active")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Menu[];
    },

    createOrder({ sessionId, orderNumber, items, note, requestId }) {
      return call<OrderMutationResult>("staff_create_order", {
        p_session_id: sessionId,
        p_order_number: orderNumber,
        p_items: items,
        p_note: note,
        p_request_id: requestId,
      });
    },

    transition({ orderId, to, expectedRevision, requestId, reason }) {
      return call<OrderMutationResult>("staff_transition_order", {
        p_order_id: orderId,
        p_to_status: to,
        p_expected_revision: expectedRevision,
        p_request_id: requestId,
        p_reason: reason ?? null,
      });
    },

    openSession(label, serviceDate) {
      return call<SessionMutationResult>("staff_open_session", { p_label: label, p_service_date: serviceDate });
    },

    closeSession(sessionId) {
      return call<SessionMutationResult>("staff_close_session", { p_session_id: sessionId });
    },

    subscribe(sessionId, handlers: StaffSubscription) {
      let channel: RealtimeChannel | null = sb().channel(`staff-board-${++channelSeq}`, {
        config: { postgres_changes_options: { wait: true } },
      });
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "public_service_state" },
        (payload) => {
          if (payload.new && "is_open" in payload.new) handlers.onServiceState(payload.new as PublicServiceState);
        },
      );
      if (sessionId) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `session_id=eq.${sessionId}` },
          (payload) => {
            if (payload.new && "order_number" in payload.new) {
              handlers.onOrder(payload.new as Omit<StaffOrder, "items">);
            }
          },
        );
      }
      channel.subscribe((status) => handlers.onHealth(status === "SUBSCRIBED" ? "live" : "down"));
      return () => {
        if (channel) void sb().removeChannel(channel);
        channel = null;
      };
    },
  };
}
