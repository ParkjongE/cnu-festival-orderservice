import { describe, expect, it } from "vitest";
import { mergeByRevision, preparingList, readyList, staffTabList } from "@/lib/domain/board";
import { parseOrderNumber } from "@/lib/domain/order-number";
import { transitionAction, undoTarget } from "@/lib/domain/transitions";
import { seoulDate } from "@/lib/domain/time";
import type { PublicOrderStatus, StaffOrder } from "@/lib/domain/types";

const row = (n: number, status: PublicOrderStatus["status"], extra: Partial<PublicOrderStatus> = {}): PublicOrderStatus => ({
  order_id: `o${n}`,
  session_id: "s",
  order_number: n,
  status,
  revision: 1,
  ready_at: null,
  picked_up_at: null,
  updated_at: "2026-10-05T00:00:00Z",
  ...extra,
});

describe("주문번호 정규화", () => {
  it("앞자리 0 을 제거해 같은 번호로 본다", () => {
    expect(parseOrderNumber("023")).toEqual({ ok: true, value: 23 });
    expect(parseOrderNumber(" 23 ")).toEqual({ ok: true, value: 23 });
    expect(parseOrderNumber("２３")).toEqual({ ok: true, value: 23 }); // 전각 숫자
  });
  it("범위·형식 오류를 구분한다", () => {
    expect(parseOrderNumber("")).toMatchObject({ ok: false, reason: "empty" });
    expect(parseOrderNumber("0")).toMatchObject({ ok: false, reason: "out_of_range" });
    expect(parseOrderNumber("000")).toMatchObject({ ok: false, reason: "out_of_range" });
    expect(parseOrderNumber("10000")).toMatchObject({ ok: false, reason: "out_of_range" });
    expect(parseOrderNumber("9999")).toEqual({ ok: true, value: 9999 });
    expect(parseOrderNumber("12a")).toMatchObject({ ok: false, reason: "not_digits" });
    expect(parseOrderNumber("-1")).toMatchObject({ ok: false, reason: "not_digits" });
    expect(parseOrderNumber("1.5")).toMatchObject({ ok: false, reason: "not_digits" });
  });
});

describe("상태 전이 표", () => {
  it("허용된 전이만 동작 이름을 돌려준다", () => {
    expect(transitionAction("preparing", "ready", null)).toBe("mark_ready");
    expect(transitionAction("ready", "picked_up", null)).toBe("mark_picked_up");
    expect(transitionAction("ready", "preparing", null)).toBe("undo_ready");
    expect(transitionAction("picked_up", "ready", null)).toBe("undo_picked_up");
    expect(transitionAction("preparing", "canceled", null)).toBe("cancel");
    expect(transitionAction("canceled", "ready", "ready")).toBe("restore");
    expect(transitionAction("canceled", "preparing", "ready")).toBeNull();
    expect(transitionAction("preparing", "picked_up", null)).toBeNull();
    expect(transitionAction("picked_up", "canceled", null)).toBeNull();
  });
  it("되돌리기 목표", () => {
    expect(undoTarget("preparing", "ready")).toBe("preparing");
    expect(undoTarget("ready", "picked_up")).toBe("ready");
    expect(undoTarget("ready", "canceled")).toBe("ready");
    expect(undoTarget("ready", "preparing")).toBeNull();
  });
});

describe("공개 목록", () => {
  it("수령 가능은 조리 완료가 오래된 순, 연속 번호와 무관하다", () => {
    const rows = [
      row(24, "ready", { ready_at: "2026-10-05T01:00:00Z" }),
      row(23, "preparing"),
      row(18, "ready", { ready_at: "2026-10-05T01:05:00Z" }),
    ];
    expect(readyList(rows).map((r) => r.order_number)).toEqual([24, 18]);
  });
  it("준비 중은 번호 순으로, 다른 상태는 빠진다", () => {
    const rows = [row(30, "preparing"), row(7, "preparing"), row(12, "ready"), row(9, "picked_up"), row(15, "preparing")];
    expect(preparingList(rows).map((r) => r.order_number)).toEqual([7, 15, 30]);
  });
  it("오래된 revision 이벤트는 최신 상태를 덮어쓰지 않는다", () => {
    const map = new Map([["o1", row(1, "picked_up", { revision: 3 })]]);
    expect(mergeByRevision(map, "o1", row(1, "ready", { revision: 2 }))).toBe(false);
    expect(map.get("o1")!.status).toBe("picked_up");
    expect(mergeByRevision(map, "o1", row(1, "ready", { revision: 4 }))).toBe(true);
  });
});

describe("직원 탭 정렬", () => {
  const o = (n: number, status: StaffOrder["status"], created: string, ready: string | null, updated: string) =>
    ({ id: `o${n}`, order_number: n, status, created_at: created, ready_at: ready, updated_at: updated, items: [] }) as unknown as StaffOrder;
  it("준비 중=등록순, 수령 대기=조리 완료순, 완료=최근 변경순", () => {
    const list = [
      o(1, "preparing", "2026-10-05T01:02:00Z", null, "2026-10-05T01:02:00Z"),
      o(2, "preparing", "2026-10-05T01:01:00Z", null, "2026-10-05T01:01:00Z"),
      o(3, "ready", "2026-10-05T01:00:00Z", "2026-10-05T01:09:00Z", "2026-10-05T01:09:00Z"),
      o(4, "ready", "2026-10-05T01:03:00Z", "2026-10-05T01:08:00Z", "2026-10-05T01:08:00Z"),
      o(5, "picked_up", "2026-10-05T01:00:00Z", null, "2026-10-05T01:20:00Z"),
      o(6, "picked_up", "2026-10-05T01:00:00Z", null, "2026-10-05T01:30:00Z"),
    ];
    expect(staffTabList(list, "preparing").map((x) => x.order_number)).toEqual([2, 1]);
    expect(staffTabList(list, "ready").map((x) => x.order_number)).toEqual([4, 3]);
    expect(staffTabList(list, "picked_up").map((x) => x.order_number)).toEqual([6, 5]);
  });
});

describe("서울 기준 날짜", () => {
  it("UTC 15:00 이후는 다음 날이다", () => {
    expect(seoulDate(new Date("2026-10-05T14:59:00Z"))).toBe("2026-10-05");
    expect(seoulDate(new Date("2026-10-05T15:00:00Z"))).toBe("2026-10-06");
  });
});
