// 실시간 반영 지연·동시 연결 시험 (운영 데이터와 분리된 '시험용' 회차/프로젝트에서 실행하세요)
//
//   CLIENTS=100 STAFF_EMAIL=... STAFF_PASSWORD=... node --env-file=.env.local scripts/realtime-load.mjs
//
// 실제 앱과 같은 구조를 흉내 낸다.
// - 손님 N명이 각자 별도 WebSocket 으로 '회차 변경 + 자기 번호 변경'만 구독
// - 손님 N명이 10~15초마다 public_board 를 조회 (POLL=0 으로 끄기)
// - 직원 계정이 시험 주문 N개를 만들고 하나씩 '조리 완료' → 해당 손님이 받기까지의 시간을 잰다
// - 끝나면 시험 주문을 모두 '취소'(사유: 부하 시험)로 정리한다
// 결과: 구독 성공/실패, 이벤트 수신률, 지연 p50/p95/최대, 주기 조회 오류 수
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CLIENTS = Number(process.env.CLIENTS ?? 100);
const POLL = process.env.POLL !== "0";
const GAP_MS = Number(process.env.GAP_MS ?? 200); // 조리 완료 사이 간격 (피크 흉내: 작게)
const { STAFF_EMAIL, STAFF_PASSWORD } = process.env;
if (!url || !key || !STAFF_EMAIL || !STAFF_PASSWORD) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, STAFF_EMAIL, STAFF_PASSWORD 가 필요합니다.");
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const staff = createClient(url, key, opts);
const { error: loginError } = await staff.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PASSWORD });
if (loginError) throw loginError;
const { data: svc } = await staff.from("public_service_state").select("*").eq("id", 1).single();
if (!svc?.is_open) throw new Error("열린 회차가 없습니다. 시험용 회차를 먼저 시작하세요.");
const sessionId = svc.session_id;

// 시험 주문 번호: 9000번대에서 연속 N개
const base = 9999 - CLIENTS;
const orders = [];
for (let i = 0; i < CLIENTS; i++) {
  const res = await staff.rpc("staff_create_order", {
    p_session_id: sessionId, p_order_number: base + i, p_items: [], p_note: "부하 시험", p_request_id: crypto.randomUUID(),
  });
  if (!res.data?.ok) throw new Error(`${base + i}번 생성 실패: ${res.data?.code ?? res.error?.message} (이미 쓴 번호면 새 회차에서 실행)`);
  orders.push(res.data.order);
}
console.log(`시험 주문 ${CLIENTS}개 생성 (${base}~${base + CLIENTS - 1}번)`);

const sentAt = new Map(); // order_number → ms
const latency = [];
let subscribed = 0;
let failed = 0;
let pollErrors = 0;
let polls = 0;
const clients = [];
await Promise.all(
  orders.map((o, i) => {
    const c = createClient(url, key, opts);
    clients.push(c);
    return new Promise((resolve) => {
      c.channel(`load-${i}`, { config: { postgres_changes_options: { wait: true } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "public_service_state" }, () => {})
        .on("postgres_changes", { event: "*", schema: "public", table: "public_order_status", filter: `order_number=eq.${o.order_number}` }, (p) => {
          if (p.new?.status === "ready" && sentAt.has(o.order_number)) latency.push(Date.now() - sentAt.get(o.order_number));
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

let polling = POLL;
const pollers = POLL
  ? clients.map(async (c, i) => {
      while (polling) {
        await sleep(10_000 + Math.random() * 5_000);
        if (!polling) break;
        polls++;
        const { error } = await c.rpc("public_board", { p_picked_limit: 20, p_my_number: orders[i].order_number });
        if (error) pollErrors++;
      }
    })
  : [];

console.log("조리 완료 처리 중…");
for (const o of orders) {
  sentAt.set(o.order_number, Date.now());
  const res = await staff.rpc("staff_transition_order", {
    p_order_id: o.id, p_to_status: "ready", p_expected_revision: o.revision, p_request_id: crypto.randomUUID(), p_reason: null,
  });
  if (!res.data?.ok) console.warn(`${o.order_number}번 변경 실패: ${res.data?.code ?? res.error?.message}`);
  else Object.assign(o, res.data.order);
  await sleep(GAP_MS);
}
await sleep(5_000);
polling = false;

latency.sort((a, b) => a - b);
const pct = (p) => latency[Math.min(latency.length - 1, Math.floor((p / 100) * latency.length))] ?? NaN;
console.log("\n── 결과 ──");
console.log(`동시 연결: 성공 ${subscribed}, 실패 ${failed}`);
console.log(`내 번호 이벤트 수신: ${latency.length}/${orders.length}`);
console.log(`지연(ms): p50 ${pct(50)}, p95 ${pct(95)}, 최대 ${latency.at(-1)}  (목표 2000ms 이내)`);
if (POLL) console.log(`주기 조회: ${polls}회, 오류 ${pollErrors}회`);

console.log("\n시험 주문 정리(취소) 중…");
for (const o of orders) {
  await staff.rpc("staff_transition_order", {
    p_order_id: o.id, p_to_status: "canceled", p_expected_revision: o.revision, p_request_id: crypto.randomUUID(), p_reason: "부하 시험",
  });
}
await Promise.all(clients.map((c) => c.removeAllChannels()));
await Promise.all(pollers);
await staff.auth.signOut();
process.exit(0);
