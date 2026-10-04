// 실시간 반영 지연·동시 연결 시험 (운영 데이터와 분리된 '시험용' Supabase 프로젝트에서만 실행하세요)
//
//   CLIENTS=100 STAFF_EMAIL=... STAFF_PASSWORD=... node --env-file=.env.test scripts/realtime-load.mjs
//
// 동작: 손님 연결 N개(각각 별도 WebSocket)를 열어 현재 회차의 public_order_status 를 구독한 뒤,
// 직원 계정으로 시험 주문을 만들고 '조리 완료' → '수령 완료' 처리하며 각 연결이 변경을 받기까지의 시간을 잰다.
// 결과: 구독 성공/실패 수, 이벤트 수신률, 지연 p50/p95/최대. 시험 주문은 9000번대 번호를 쓰며 마지막에 수령 완료 상태로 남는다.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CLIENTS = Number(process.env.CLIENTS ?? 100);
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const { STAFF_EMAIL, STAFF_PASSWORD } = process.env;
if (!url || !key || !STAFF_EMAIL || !STAFF_PASSWORD) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, STAFF_EMAIL, STAFF_PASSWORD 가 필요합니다.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const staff = createClient(url, key, opts);
const { error: loginError } = await staff.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PASSWORD });
if (loginError) throw loginError;

const { data: svc } = await staff.from("public_service_state").select("*").eq("id", 1).single();
if (!svc?.is_open) throw new Error("열린 회차가 없습니다. 시험용 회차를 먼저 시작하세요.");
const sessionId = svc.session_id;

const pending = new Map(); // key: `${orderId}:${revision}` → { sentAt, received: number[] }
let subscribed = 0;
let failed = 0;
const clients = [];

console.log(`손님 연결 ${CLIENTS}개 구독 중…`);
await Promise.all(
  Array.from({ length: CLIENTS }, (_, i) => {
    const c = createClient(url, key, opts);
    clients.push(c);
    return new Promise((resolve) => {
      c.channel(`load-${i}`, { config: { postgres_changes_options: { wait: true } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "public_order_status", filter: `session_id=eq.${sessionId}` }, (p) => {
          const entry = pending.get(`${p.new.order_id}:${p.new.revision}`);
          if (entry) entry.received.push(Date.now() - entry.sentAt);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") subscribed++;
          else failed++;
          resolve();
        });
    });
  }),
);
console.log(`구독 성공 ${subscribed} / 실패 ${failed}`);

const latencies = [];
let expected = 0;
for (let r = 0; r < ROUNDS; r++) {
  const number = 9000 + Math.floor(Math.random() * 999);
  const created = await staff.rpc("staff_create_order", {
    p_session_id: sessionId, p_order_number: number, p_items: [], p_note: "부하 시험", p_request_id: crypto.randomUUID(),
  });
  if (!created.data?.ok) {
    console.warn("주문 생성 실패(번호 중복일 수 있음):", created.data?.code ?? created.error?.message);
    continue;
  }
  let order = created.data.order;
  for (const to of ["ready", "picked_up"]) {
    const entry = { sentAt: Date.now(), received: [] };
    pending.set(`${order.id}:${order.revision + 1}`, entry);
    const res = await staff.rpc("staff_transition_order", {
      p_order_id: order.id, p_to_status: to, p_expected_revision: order.revision, p_request_id: crypto.randomUUID(), p_reason: null,
    });
    if (!res.data?.ok) throw new Error(`상태 변경 실패: ${res.data?.code ?? res.error?.message}`);
    order = res.data.order;
    await new Promise((s) => setTimeout(s, 5000));
    expected += subscribed;
    latencies.push(...entry.received);
    console.log(`${number}번 → ${to}: ${entry.received.length}/${subscribed} 수신`);
  }
}

latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] ?? NaN;
console.log("\n── 결과 ──");
console.log(`동시 연결: 성공 ${subscribed}, 실패 ${failed}`);
console.log(`이벤트 수신: ${latencies.length}/${expected} (${((latencies.length / Math.max(1, expected)) * 100).toFixed(1)}%)`);
console.log(`지연(ms): p50 ${pct(50)}, p95 ${pct(95)}, 최대 ${latencies.at(-1)}  (목표: 2000ms 이내)`);

await Promise.all(clients.map((c) => c.removeAllChannels()));
await staff.auth.signOut();
process.exit(0);
