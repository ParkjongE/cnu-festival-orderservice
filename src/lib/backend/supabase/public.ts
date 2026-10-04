import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Menu, PublicOrderStatus, PublicServiceState } from "@/lib/domain/types";
import type { PublicBackend, PublicSnapshot, PublicSubscription } from "../types";
import { getSupabase } from "./client";

const STATUS_COLUMNS = "order_id,session_id,order_number,status,revision,ready_at,picked_up_at,updated_at";

let channelSeq = 0;

export function createSupabasePublicBackend(): PublicBackend {
  // 서버 렌더링 중에는 클라이언트를 만들지 않도록 처음 사용할 때 생성한다
  const sb = () => getSupabase();

  return {
    kind: "supabase",

    async getServiceState() {
      const { data, error } = await sb()
        .from("public_service_state")
        .select("session_id,session_label,service_date,is_open,updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (
        (data as PublicServiceState | null) ?? {
          session_id: null,
          session_label: null,
          service_date: null,
          is_open: false,
          updated_at: new Date(0).toISOString(),
        }
      );
    },

    async getSnapshot(sessionId, pickedUpLimit): Promise<PublicSnapshot> {
      const [ready, picked] = await Promise.all([
        sb()
          .from("public_order_status")
          .select(STATUS_COLUMNS)
          .eq("session_id", sessionId)
          .eq("status", "ready")
          .order("ready_at", { ascending: true }),
        sb()
          .from("public_order_status")
          .select(STATUS_COLUMNS)
          .eq("session_id", sessionId)
          .eq("status", "picked_up")
          .order("picked_up_at", { ascending: false })
          .limit(pickedUpLimit + 1),
      ]);
      if (ready.error) throw ready.error;
      if (picked.error) throw picked.error;
      const pickedRows = (picked.data ?? []) as PublicOrderStatus[];
      return {
        ready: (ready.data ?? []) as PublicOrderStatus[],
        pickedUp: pickedRows.slice(0, pickedUpLimit),
        hasMorePickedUp: pickedRows.length > pickedUpLimit,
      };
    },

    async lookup(sessionId, orderNumber) {
      const { data, error } = await sb()
        .from("public_order_status")
        .select(STATUS_COLUMNS)
        .eq("session_id", sessionId)
        .eq("order_number", orderNumber)
        .maybeSingle();
      if (error) throw error;
      return (data as PublicOrderStatus | null) ?? null;
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

    subscribe(sessionId, handlers: PublicSubscription) {
      let channel: RealtimeChannel | null = sb().channel(`public-board-${++channelSeq}`, {
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
          { event: "*", schema: "public", table: "public_order_status", filter: `session_id=eq.${sessionId}` },
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
