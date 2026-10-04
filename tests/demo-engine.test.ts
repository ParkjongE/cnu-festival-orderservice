import { describe, expect, it } from "vitest";
import * as engine from "@/lib/backend/demo/engine";

let t = Date.parse("2026-10-05T03:00:00Z");
let id = 0;
const ctx: engine.EngineContext = { now: () => new Date((t += 1000)), newId: () => `id${++id}`, actorId: "staff" };

function setup() {
  const s = engine.emptyDemoState(new Date(t));
  const opened = engine.openSession(s, ctx, "1일차", "2026-10-05");
  if (!opened.ok) throw new Error("open failed");
  return { s, sid: opened.session.id };
}

describe("데모 엔진 (SQL RPC 와 같은 규칙)", () => {
  it("중복 번호·멱등성·stale·종료 회차", () => {
    const { s, sid } = setup();
    const a = engine.createOrder(s, ctx, { sessionId: sid, orderNumber: 23, items: [{ menu_id: "lasagna", quantity: 1 }], note: null, requestId: "r1" });
    expect(a.ok).toBe(true);
    expect(engine.createOrder(s, ctx, { sessionId: sid, orderNumber: 23, items: [], note: null, requestId: "r2" })).toMatchObject({ ok: false, code: "duplicate_number" });
    expect(engine.createOrder(s, ctx, { sessionId: sid, orderNumber: 99, items: [], note: null, requestId: "r1" })).toMatchObject({ ok: true, replayed: true });
    if (!a.ok) return;
    const ready = engine.transitionOrder(s, ctx, { orderId: a.order.id, to: "ready", expectedRevision: 1, requestId: "r3" });
    expect(ready).toMatchObject({ ok: true, order: { status: "ready", revision: 2 } });
    expect(engine.transitionOrder(s, ctx, { orderId: a.order.id, to: "preparing", expectedRevision: 1, requestId: "r4" })).toMatchObject({ ok: false, code: "stale" });
    expect(engine.closeSession(s, ctx, sid)).toMatchObject({ ok: false, code: "has_active_orders", ready: 1 });
    engine.transitionOrder(s, ctx, { orderId: a.order.id, to: "picked_up", expectedRevision: 2, requestId: "r5" });
    expect(engine.closeSession(s, ctx, sid).ok).toBe(true);
    expect(engine.publicRows(s)).toEqual([]);
    expect(engine.transitionOrder(s, ctx, { orderId: a.order.id, to: "ready", expectedRevision: 3, requestId: "r6" })).toMatchObject({ ok: false, code: "session_closed" });
  });

  it("공개 상태에는 메뉴·메모·직원 정보가 없다", () => {
    const { s, sid } = setup();
    engine.createOrder(s, ctx, { sessionId: sid, orderNumber: 7, items: [{ menu_id: "cheese_corn", quantity: 2 }], note: "비밀", requestId: "x" });
    const [pub] = engine.publicRows(s);
    expect(Object.keys(pub).sort()).toEqual(["order_id", "order_number", "picked_up_at", "ready_at", "revision", "session_id", "status", "updated_at"]);
  });

  it("취소 복원은 취소 직전 상태로만", () => {
    const { s, sid } = setup();
    const c = engine.createOrder(s, ctx, { sessionId: sid, orderNumber: 1, items: [], note: null, requestId: "a" });
    if (!c.ok) throw new Error();
    const x = engine.transitionOrder(s, ctx, { orderId: c.order.id, to: "canceled", expectedRevision: 1, requestId: "b", reason: "입력 실수" });
    expect(x).toMatchObject({ ok: true, order: { canceled_from: "preparing", cancel_reason: "입력 실수" } });
    expect(engine.transitionOrder(s, ctx, { orderId: c.order.id, to: "ready", expectedRevision: 2, requestId: "c" })).toMatchObject({ ok: false, code: "invalid_transition" });
    expect(engine.transitionOrder(s, ctx, { orderId: c.order.id, to: "preparing", expectedRevision: 2, requestId: "d" })).toMatchObject({ ok: true, order: { status: "preparing", canceled_from: null, cancel_reason: null } });
  });
});
