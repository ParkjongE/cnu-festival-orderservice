import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Menu, OrderStatus, PublicOrderStatus, PublicServiceState } from "@/lib/domain/types";
import type { PublicBackend, PublicBoardSnapshot, PublicSubscription } from "../types";
import { getSupabase } from "./client";

const SUBSCRIBE_JITTER_MS = 2000;

/** DB(private.sync_public_status)가 신호를 보내는 채널 이름과 같아야 한다 */
export function publicOrderTopic(sessionId: string, orderNumber: number) {
  return `order:${sessionId}:${orderNumber}`;
}

type BoardRow = Pick<PublicOrderStatus, "order_id" | "order_number" | "revision" | "ready_at" | "picked_up_at"> & {
  status: OrderStatus;
};

interface BoardResponse {
  service: PublicServiceState | null;
  ready?: BoardRow[];
  preparing?: BoardRow[];
  mine: BoardRow | null;
}

const EMPTY_SERVICE: PublicServiceState = {
  session_id: null,
  session_label: null,
  service_date: null,
  is_open: false,
  updated_at: new Date(0).toISOString(),
};

/** 응답을 작게 하려고 RPC 는 session_id·updated_at 을 빼고 보낸다. 화면용 타입으로 채운다. */
function toStatus(row: BoardRow, sessionId: string, at: string): PublicOrderStatus {
  return { ...row, session_id: sessionId, updated_at: at };
}

export function createSupabasePublicBackend(): PublicBackend {
  // 서버 렌더링 중에는 클라이언트를 만들지 않도록 처음 사용할 때 생성한다
  const sb = () => getSupabase();

  return {
    kind: "supabase",

    async getBoard(myNumber): Promise<PublicBoardSnapshot> {
      const { data, error } = await sb().rpc("public_board", { p_my_number: myNumber });
      if (error) throw error;
      const res = data as BoardResponse;
      const service = res.service ?? EMPTY_SERVICE;
      const sid = service.is_open ? service.session_id : null;
      if (!sid) return { service, ready: [], preparing: [], mine: null };
      const at = new Date().toISOString();
      return {
        service,
        ready: (res.ready ?? []).map((r) => toStatus(r, sid, at)),
        preparing: (res.preparing ?? []).map((r) => toStatus(r, sid, at)),
        mine: res.mine ? toStatus(res.mine, sid, at) : null,
      };
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

    subscribe(sessionId, myNumber, handlers: PublicSubscription) {
      let channel: RealtimeChannel | null = null;
      let closed = false;
      // 많은 손님이 같은 순간(재접속 등)에 구독하지 않도록 시작을 0~2초 무작위로 늦춘다
      const timer = setTimeout(() => {
        if (closed) return;
        channel = sb()
          .channel(publicOrderTopic(sessionId, myNumber))
          .on("broadcast", { event: "changed" }, () => handlers.onChanged())
          .subscribe((status) => handlers.onHealth(status === "SUBSCRIBED" ? "live" : "down"));
      }, Math.random() * SUBSCRIBE_JITTER_MS);
      return () => {
        closed = true;
        clearTimeout(timer);
        if (channel) void sb().removeChannel(channel);
        channel = null;
      };
    },
  };
}
