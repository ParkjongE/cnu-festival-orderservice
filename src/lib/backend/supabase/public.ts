import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Menu, OrderStatus, PublicOrderStatus, PublicServiceState } from "@/lib/domain/types";
import type { PublicBackend, PublicBoardSnapshot, PublicSubscription } from "../types";
import { getSupabase } from "./client";

let channelSeq = 0;

type BoardRow = Pick<PublicOrderStatus, "order_id" | "order_number" | "revision" | "ready_at" | "picked_up_at"> & {
  status: OrderStatus;
};

interface BoardResponse {
  service: PublicServiceState | null;
  ready: BoardRow[];
  picked_up: BoardRow[];
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

    async getBoard(pickedUpLimit, myNumber): Promise<PublicBoardSnapshot> {
      const { data, error } = await sb().rpc("public_board", {
        p_picked_limit: pickedUpLimit,
        p_my_number: myNumber,
      });
      if (error) throw error;
      const res = data as BoardResponse;
      const service = res.service ?? EMPTY_SERVICE;
      const sid = service.is_open ? service.session_id : null;
      if (!sid) return { service, ready: [], pickedUp: [], hasMorePickedUp: false, mine: null };
      const at = new Date().toISOString();
      return {
        service,
        ready: res.ready.map((r) => toStatus(r, sid, at)),
        pickedUp: res.picked_up.slice(0, pickedUpLimit).map((r) => toStatus(r, sid, at)),
        hasMorePickedUp: res.picked_up.length > pickedUpLimit,
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
      let channel: RealtimeChannel | null = sb().channel(`public-board-${++channelSeq}`, {
        config: { postgres_changes_options: { wait: true } },
      });
      channel.on("postgres_changes", { event: "*", schema: "public", table: "public_service_state" }, (payload) => {
        if (payload.new && "is_open" in payload.new) handlers.onServiceState(payload.new as PublicServiceState);
      });
      if (sessionId && myNumber !== null) {
        // Realtime 필터는 컬럼 하나만 지원한다. 번호로 거르고, RLS 가 열린 회차만 통과시키며,
        // 받은 쪽에서 session_id 를 한 번 더 확인한다.
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "public_order_status", filter: `order_number=eq.${myNumber}` },
          (payload) => {
            if (payload.new && "order_id" in payload.new) handlers.onStatus(payload.new as PublicOrderStatus);
          },
        );
      }
      channel.subscribe((status) => {
        handlers.onHealth(status === "SUBSCRIBED" ? "live" : "down");
      });
      return () => {
        if (channel) void sb().removeChannel(channel);
        channel = null;
      };
    },
  };
}
