import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { anon, as, createDb, OUTSIDER, staff, STAFF_B } from "./harness";

type Result = { ok: boolean; code?: string; replayed?: boolean; order?: Order; session?: { id: string } };
type Order = { id: string; status: string; revision: number; order_number: number; items: unknown[] };

let db: PGlite;

async function rpc(who: Parameters<typeof as>[1], fn: string, args: unknown[]): Promise<Result> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await as<{ r: Result }>(db, who, `select public.${fn}(${placeholders}) as r`, args);
  return rows[0].r;
}

async function openSession(label = "1일차") {
  const r = await rpc(staff(), "staff_open_session", [label, "2026-10-05"]);
  expect(r.ok).toBe(true);
  return r.session!.id;
}

async function createOrder(sessionId: string, n: number, items: unknown[] = [], note: string | null = null) {
  return rpc(staff(), "staff_create_order", [sessionId, n, JSON.stringify(items), note, randomUUID()]);
}

async function move(order: Order, to: string, who = staff(), requestId = randomUUID(), revision = order.revision) {
  return rpc(who, "staff_transition_order", [order.id, to, revision, requestId, null]);
}

beforeEach(async () => {
  db = await createDb();
});

describe("회차", () => {
  it("열린 회차는 하나만 허용한다", async () => {
    await openSession();
    const second = await rpc(staff(), "staff_open_session", ["2일차", "2026-10-06"]);
    expect(second).toMatchObject({ ok: false, code: "session_already_open" });
    await expect(
      db.exec(`insert into public.service_sessions (label, service_date) values ('x', '2026-10-06')`),
    ).rejects.toThrow(/unique/);
  });

  it("미처리 주문이 있으면 종료를 막고, 종료된 회차는 수정할 수 없다", async () => {
    const sid = await openSession();
    const o = (await createOrder(sid, 23)).order!;
    expect(await rpc(staff(), "staff_close_session", [sid])).toMatchObject({ ok: false, code: "has_active_orders" });

    const ready = (await move(o, "ready")).order!;
    const done = (await move(ready, "picked_up")).order!;
    expect((await rpc(staff(), "staff_close_session", [sid])).ok).toBe(true);

    expect(await move(done, "ready")).toMatchObject({ ok: false, code: "session_closed" });
    expect(await createOrder(sid, 24)).toMatchObject({ ok: false, code: "session_closed" });
    // 기록은 보존된다
    const rows = await as(db, staff(), `select status from public.orders where session_id = $1`, [sid]);
    expect(rows).toEqual([{ status: "picked_up" }]);
  });

  it("새 회차에서는 같은 번호를 다시 쓸 수 있고, 손님에게는 현재 회차만 보인다", async () => {
    const s1 = await openSession("1일차");
    const o1 = (await createOrder(s1, 23)).order!;
    await move(o1, "canceled");
    await rpc(staff(), "staff_close_session", [s1]);
    const s2 = await openSession("2일차");
    expect((await createOrder(s2, 23)).ok).toBe(true);

    const visible = await as<{ session_id: string }>(db, anon, `select session_id from public.public_order_status`);
    expect(visible).toEqual([{ session_id: s2 }]);
  });
});

describe("주문 등록", () => {
  it("메뉴 이름·가격을 스냅샷으로 저장하고 공개 상태를 같이 만든다", async () => {
    const sid = await openSession();
    const r = await createOrder(sid, 7, [{ menu_id: "lasagna", quantity: 2 }], "포장");
    expect(r.ok).toBe(true);
    expect(r.order!.items).toEqual([
      expect.objectContaining({ menu_id: "lasagna", name_snapshot: "알랭 라자냐", unit_price_krw: 10000, quantity: 2 }),
    ]);
    const pub = await as(db, anon, `select * from public.public_order_status`);
    expect(pub).toHaveLength(1);
    expect(Object.keys(pub[0]).sort()).toEqual(
      ["order_id", "session_id", "order_number", "status", "revision", "ready_at", "picked_up_at", "updated_at"].sort(),
    );
  });

  it("중복 번호는 거절하고 기존 주문을 알려준다 (취소·수령 완료 번호 포함)", async () => {
    const sid = await openSession();
    const o = (await createOrder(sid, 23)).order!;
    await move(o, "canceled");
    const dup = await createOrder(sid, 23);
    expect(dup).toMatchObject({ ok: false, code: "duplicate_number" });
    expect(dup.order!.id).toBe(o.id);
  });

  it("잘못된 번호·메뉴·수량은 저장되지 않는다", async () => {
    const sid = await openSession();
    expect(await createOrder(sid, 0)).toMatchObject({ ok: false, code: "invalid_number" });
    expect(await createOrder(sid, 10000)).toMatchObject({ ok: false, code: "invalid_number" });
    await expect(createOrder(sid, 5, [{ menu_id: "nope", quantity: 1 }])).rejects.toThrow(/invalid menu/);
    await expect(createOrder(sid, 5, [{ menu_id: "lasagna", quantity: 0 }])).rejects.toThrow(/invalid quantity/);
    // 실패한 요청은 전부 롤백된다
    const count = await as<{ n: number }>(db, staff(), `select count(*)::int as n from public.orders`);
    expect(count[0].n).toBe(0);
  });

  it("같은 request_id 재시도는 주문을 한 번만 만든다", async () => {
    const sid = await openSession();
    const req = randomUUID();
    const first = await rpc(staff(), "staff_create_order", [sid, 9, "[]", null, req]);
    const retry = await rpc(staff(), "staff_create_order", [sid, 9, "[]", null, req]);
    expect(first.ok && retry.ok).toBe(true);
    expect(retry.replayed).toBe(true);
    expect(retry.order!.id).toBe(first.order!.id);
  });
});

describe("상태 전이", () => {
  it("준비 중 → 수령 대기 → 수령 완료, 각 단계가 공개 상태와 이력에 남는다", async () => {
    const sid = await openSession();
    const o = (await createOrder(sid, 23)).order!;
    const ready = (await move(o, "ready")).order!;
    expect(ready).toMatchObject({ status: "ready", revision: 2 });
    const done = (await move(ready, "picked_up")).order!;
    expect(done).toMatchObject({ status: "picked_up", revision: 3 });

    const pub = await as(db, anon, `select status, revision from public.public_order_status`);
    expect(pub).toEqual([{ status: "picked_up", revision: 3 }]);
    const events = await as(db, staff(), `select action from public.order_events order by id`);
    expect(events.map((e) => e.action)).toEqual(["create", "mark_ready", "mark_picked_up"]);
  });

  it("되돌리기와 취소 복원은 허용된 방향만 가능하다", async () => {
    const sid = await openSession();
    let o = (await createOrder(sid, 1)).order!;
    expect(await move(o, "picked_up")).toMatchObject({ ok: false, code: "invalid_transition" });
    o = (await move(o, "ready")).order!;
    o = (await move(o, "preparing")).order!; // undo_ready
    o = (await move(o, "ready")).order!;
    o = (await move(o, "canceled")).order!;
    expect(await move(o, "preparing")).toMatchObject({ ok: false, code: "invalid_transition" });
    o = (await move(o, "ready")).order!; // restore → 취소 전 상태
    expect(o.status).toBe("ready");
  });

  it("두 직원이 동시에 같은 주문을 바꾸면 한 요청만 성공한다", async () => {
    const sid = await openSession();
    const o = (await createOrder(sid, 23)).order!;
    const [a, b] = await Promise.all([move(o, "ready"), move(o, "canceled", staff(STAFF_B))]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser.code).toBe("stale");
    expect(loser.order!.revision).toBe(2);
  });

  it("다른 직원이 이후 상태를 바꿨다면 오래된 되돌리기는 적용되지 않는다", async () => {
    const sid = await openSession();
    const o = (await createOrder(sid, 23)).order!;
    const ready = (await move(o, "ready")).order!; // A: 조리 완료 (revision 2)
    await move(ready, "picked_up", staff(STAFF_B)); // B: 수령 완료 (revision 3)
    const undo = await move(ready, "preparing"); // A: revision 2 기준 되돌리기
    expect(undo).toMatchObject({ ok: false, code: "stale" });
  });

  it("같은 request_id 로 연속 탭해도 한 번만 반영된다", async () => {
    const sid = await openSession();
    const o = (await createOrder(sid, 23)).order!;
    const req = randomUUID();
    const [x, y] = await Promise.all([move(o, "ready", staff(), req), move(o, "ready", staff(), req)]);
    expect(x.ok && y.ok).toBe(true);
    const events = await as(db, staff(), `select count(*)::int as n from public.order_events where request_id = $1`, [
      req,
    ]);
    expect(events[0].n).toBe(1);
    const cur = await as(db, staff(), `select revision from public.orders where id = $1`, [o.id]);
    expect(cur[0].revision).toBe(2);
  });
});

describe("권한", () => {
  it("익명 사용자는 원본 테이블을 읽거나 RPC·직접 쓰기를 할 수 없다", async () => {
    const sid = await openSession();
    await createOrder(sid, 23, [], "비밀 메모");
    for (const table of ["orders", "order_items", "order_events", "staff_members", "service_sessions"]) {
      await expect(as(db, anon, `select * from public.${table}`)).rejects.toThrow(/permission denied/);
    }
    await expect(
      as(db, anon, `select public.staff_create_order($1, 5, '[]', null, gen_random_uuid())`, [sid]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(
        db,
        anon,
        `insert into public.public_order_status (order_id, session_id, order_number, status, revision)
                    values (gen_random_uuid(), $1, 1, 'ready', 1)`,
        [sid],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, anon, `update public.public_order_status set status = 'ready'`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("로그인했지만 직원 명단에 없거나 비활성인 계정은 쓰기·조회를 할 수 없다", async () => {
    const sid = await openSession();
    await createOrder(sid, 23);
    const outsider = { role: "authenticated", uid: OUTSIDER } as const;
    await expect(rpc(outsider, "staff_create_order", [sid, 5, "[]", null, randomUUID()])).rejects.toThrow(/직원 권한/);
    expect(await as(db, outsider, `select * from public.orders`)).toEqual([]);
    expect((await as<{ ok: boolean }>(db, outsider, `select public.am_i_staff() as ok`))[0].ok).toBe(false);

    await db.exec(`update public.staff_members set active = false where user_id = '${STAFF_B}'`);
    await expect(rpc(staff(STAFF_B), "staff_create_order", [sid, 6, "[]", null, randomUUID()])).rejects.toThrow(
      /직원 권한/,
    );
  });

  it("직원도 테이블에 직접 쓸 수 없고 RPC 로만 바꾼다", async () => {
    const sid = await openSession();
    await createOrder(sid, 23);
    await expect(as(db, staff(), `update public.orders set status = 'ready'`)).rejects.toThrow(/permission denied/);
  });

  it("회차 종료 후에는 손님에게 이전 회차 상태가 보이지 않는다", async () => {
    const sid = await openSession();
    const o = (await createOrder(sid, 23)).order!;
    await move(o, "canceled");
    await rpc(staff(), "staff_close_session", [sid]);
    expect(await as(db, anon, `select * from public.public_order_status`)).toEqual([]);
    const state = await as(db, anon, `select session_id, is_open from public.public_service_state`);
    expect(state).toEqual([{ session_id: sid, is_open: false }]);
  });
});

describe("public_board (손님 한 번 조회)", () => {
  type Board = {
    service: { session_id: string | null; is_open: boolean };
    ready: Record<string, unknown>[];
    picked_up: unknown[];
    mine: Record<string, unknown> | null;
  };
  const board = async (limit = 20, mine: number | null = null) =>
    (await as<{ b: Board }>(db, anon, `select public.public_board($1, $2) as b`, [limit, mine]))[0].b;

  it("익명 사용자가 회차·목록·내 번호를 한 번에 받고, 민감 정보는 없다", async () => {
    const sid = await openSession();
    const a = (await createOrder(sid, 23, [{ menu_id: "lasagna", quantity: 1 }], "비밀 메모")).order!;
    const b = (await createOrder(sid, 24)).order!;
    await move(b, "ready");
    const res = await board(20, 23);
    expect(res.service).toMatchObject({ session_id: sid, is_open: true });
    expect(res.ready.map((r) => r.order_number)).toEqual([24]);
    expect(res.mine).toMatchObject({ order_id: a.id, status: "preparing" });
    expect(Object.keys(res.mine!).sort()).toEqual([
      "order_id",
      "order_number",
      "picked_up_at",
      "ready_at",
      "revision",
      "status",
    ]);
    expect(JSON.stringify(res)).not.toContain("비밀 메모");
    expect((await board(20, 99)).mine).toBeNull();
  });

  it("최근 수령 완료는 limit+1 개까지(더 보기 판단용), 종료된 회차는 비어 있다", async () => {
    const sid = await openSession();
    for (const n of [1, 2, 3]) {
      const o = (await createOrder(sid, n)).order!;
      const r = (await move(o, "ready")).order!;
      await move(r, "picked_up");
    }
    expect((await board(2)).picked_up).toHaveLength(3);
    await rpc(staff(), "staff_close_session", [sid]);
    const closed = await board(20, 1);
    expect(closed).toMatchObject({
      service: { session_id: sid, is_open: false },
      ready: [],
      picked_up: [],
      mine: null,
    });
  });
});
