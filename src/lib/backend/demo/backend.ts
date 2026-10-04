/**
 * 데모 백엔드: 같은 브라우저의 여러 탭이 localStorage + BroadcastChannel 로 상태를 공유한다.
 * (예: 한 탭은 /demo/admin, 다른 탭은 /demo 로 열면 실시간 반영을 확인할 수 있다.)
 * 운영 Supabase 와는 연결되지 않으며, 화면에는 항상 '데모' 배지를 표시한다.
 */
import { toPublicStatus, pickedUpList, readyList } from "@/lib/domain/board";
import { seoulDate } from "@/lib/domain/time";
import type { PublicServiceState, StaffOrder } from "@/lib/domain/types";
import type { ChannelHealth, PublicBackend, StaffBackend, StaffUser } from "../types";
import * as engine from "./engine";
import type { DemoState, EngineContext } from "./engine";

const STORAGE_KEY = "ytd-demo-state-v1";
const OFFLINE_KEY = "ytd-demo-offline";
const CHANNEL = "ytd-demo";
const LATENCY_MS = 350;
const DEMO_USER: StaffUser = { id: "demo-staff", email: "demo@example.invalid" };

type Message =
  | { type: "order"; order: StaffOrder }
  | { type: "service"; service: PublicServiceState }
  | { type: "offline"; offline: boolean }
  | { type: "reset" };

type Listener = (m: Message) => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function ensureChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e: MessageEvent<Message>) => listeners.forEach((l) => l(e.data));
}

function emit(m: Message) {
  listeners.forEach((l) => l(m));
  channel?.postMessage(m);
}

function newId() {
  return crypto.randomUUID();
}

const ctx: EngineContext = { now: () => new Date(), newId, actorId: DEMO_USER.id };

/** 화면을 바로 둘러볼 수 있도록 회차 하나와 예시 주문을 만든다. 모두 데모용 가짜 데이터다. */
function seededState(): DemoState {
  const state = engine.emptyDemoState(new Date());
  const opened = engine.openSession(state, { ...ctx, now: () => new Date(Date.now() - 90 * 60_000) }, "데모 1일차", seoulDate());
  if (!opened.ok) return state;
  const sid = opened.session.id;
  const plan: [number, number, ("ready" | "picked_up" | "canceled")[], { menu_id: string; quantity: number }[]][] = [
    [3, 80, ["ready", "picked_up"], [{ menu_id: "lasagna", quantity: 1 }]],
    [5, 76, ["ready", "picked_up"], [{ menu_id: "cheese_corn", quantity: 2 }]],
    [8, 70, ["ready", "picked_up"], [{ menu_id: "zero_highball", quantity: 2 }]],
    [11, 62, ["canceled"], []],
    [12, 55, ["ready", "picked_up"], [{ menu_id: "chicken_nanban", quantity: 1 }]],
    [17, 40, ["ready"], [{ menu_id: "lasagna", quantity: 2 }, { menu_id: "zero_highball", quantity: 1 }]],
    [21, 33, ["ready"], [{ menu_id: "cheese_corn", quantity: 1 }]],
    [23, 25, [], [{ menu_id: "chicken_nanban", quantity: 1 }, { menu_id: "cheese_corn", quantity: 1 }]],
    [24, 20, ["ready"], [{ menu_id: "zero_highball", quantity: 1 }]],
    [26, 12, [], [{ menu_id: "lasagna", quantity: 1 }]],
    [27, 6, [], []],
  ];
  for (const [n, ago, steps, items] of plan) {
    let t = Date.now() - ago * 60_000;
    const c: EngineContext = { ...ctx, now: () => new Date(t) };
    const r = engine.createOrder(state, c, { sessionId: sid, orderNumber: n, items, note: null, requestId: newId() });
    if (!r.ok) continue;
    let order = r.order;
    for (const to of steps) {
      t += 4 * 60_000;
      const m = engine.transitionOrder(state, c, { orderId: order.id, to, expectedRevision: order.revision, requestId: newId() });
      if (m.ok) order = m.order;
    }
  }
  return state;
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    // 손상된 데모 데이터는 새로 만든다
  }
  const fresh = seededState();
  save(fresh);
  return fresh;
}

function save(state: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 공간이 없어도 현재 탭에서는 계속 동작한다
  }
}

export function isDemoOffline(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) === "1";
  } catch {
    return false;
  }
}

/** 데모에서 '연결 끊김'을 흉내 낸다. 모든 데모 탭에 함께 적용된다. */
export function setDemoOffline(offline: boolean) {
  try {
    if (offline) localStorage.setItem(OFFLINE_KEY, "1");
    else localStorage.removeItem(OFFLINE_KEY);
  } catch {}
  ensureChannel();
  emit({ type: "offline", offline });
}

export function resetDemo() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  load();
  ensureChannel();
  emit({ type: "reset" });
}

/** 데모 탭 사이의 상태 변화를 듣는다 (오프라인 토글·초기화 표시용) */
export function onDemoMessage(cb: (m: Message) => void): () => void {
  ensureChannel();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const delay = (ms = LATENCY_MS) => new Promise((r) => setTimeout(r, ms + Math.random() * 150));

async function network<T>(fn: () => T): Promise<T> {
  await delay();
  if (isDemoOffline()) throw new Error("데모: 연결 끊김");
  return fn();
}

/** 쓰기는 매번 최신 저장본을 읽어 적용하고 저장한다 (탭 간 경쟁을 줄이기 위해). */
async function mutate<T>(fn: (state: DemoState) => T): Promise<T> {
  return network(() => {
    const state = load();
    const before = new Map(state.orders.map((o) => [o.id, o.revision]));
    const prevService = JSON.stringify(state.service);
    const result = fn(state);
    save(state);
    for (const o of state.orders) {
      if (before.get(o.id) !== o.revision) emit({ type: "order", order: structuredClone(o) });
    }
    if (JSON.stringify(state.service) !== prevService) emit({ type: "service", service: { ...state.service } });
    return result;
  });
}

function subscribeDemo(onMessage: (m: Message) => void, onHealth: (h: ChannelHealth) => void) {
  ensureChannel();
  let alive = true;
  const listener: Listener = (m) => {
    if (!alive) return;
    if (m.type === "offline") {
      onHealth(m.offline ? "down" : "live");
      return;
    }
    if (isDemoOffline()) return;
    onMessage(m);
  };
  listeners.add(listener);
  const timer = setTimeout(() => alive && onHealth(isDemoOffline() ? "down" : "live"), 300);
  return () => {
    alive = false;
    clearTimeout(timer);
    listeners.delete(listener);
  };
}

export function createDemoPublicBackend(): PublicBackend {
  return {
    kind: "demo",
    getBoard: (limit, myNumber) =>
      network(() => {
        const state = load();
        const rows = engine.publicRows(state);
        const picked = pickedUpList(rows, limit + 1);
        return {
          service: state.service,
          ready: readyList(rows),
          pickedUp: picked.slice(0, limit),
          hasMorePickedUp: picked.length > limit,
          mine: myNumber === null ? null : (rows.find((r) => r.order_number === myNumber) ?? null),
        };
      }),
    listMenus: () => network(() => load().menus.filter((m) => m.active)),
    subscribe(sessionId, myNumber, h) {
      return subscribeDemo((m) => {
        if (m.type === "service") h.onServiceState(m.service);
        if (m.type === "reset") void network(() => load().service).then(h.onServiceState, () => {});
        // 운영과 같게 '내 번호' 변경만 실시간으로 전달한다
        if (m.type === "order" && m.order.session_id === sessionId && m.order.order_number === myNumber) {
          h.onStatus(toPublicStatus(m.order));
        }
      }, h.onHealth);
    },
  };
}

export function createDemoStaffBackend(): StaffBackend {
  return {
    kind: "demo",
    getUser: async () => DEMO_USER,
    signIn: async () => ({ ok: true }),
    signOut: async () => {},
    isStaff: async () => true,
    onAuthChange: () => () => {},
    getOpenSession: () => network(() => load().sessions.find((s) => s.state === "open") ?? null),
    listSessions: () => network(() => [...load().sessions].sort((a, b) => b.opened_at.localeCompare(a.opened_at))),
    listOrders: (sid) => network(() => load().orders.filter((o) => o.session_id === sid)),
    getOrder: (id) => network(() => load().orders.find((o) => o.id === id) ?? null),
    listEvents: (id) =>
      network(() =>
        load()
          .events.filter((e) => e.order_id === id)
          .map(({ id, order_id, actor_id, action, from_status, to_status, revision, created_at, reason }) => ({
            id, order_id, actor_id, action, from_status, to_status, revision, created_at, reason,
          })),
      ),
    listMenus: () => network(() => load().menus.filter((m) => m.active)),
    createOrder: (input) => mutate((s) => engine.createOrder(s, ctx, input)),
    transition: (input) => mutate((s) => engine.transitionOrder(s, ctx, input)),
    openSession: (label, date) => mutate((s) => engine.openSession(s, ctx, label, date)),
    closeSession: (id) => mutate((s) => engine.closeSession(s, ctx, id)),
    subscribe(sessionId, h) {
      return subscribeDemo((m) => {
        if (m.type === "service") h.onServiceState(m.service);
        if (m.type === "reset") void network(() => load().service).then(h.onServiceState, () => {});
        if (m.type === "order" && m.order.session_id === sessionId) h.onOrder(m.order);
      }, h.onHealth);
    },
  };
}
