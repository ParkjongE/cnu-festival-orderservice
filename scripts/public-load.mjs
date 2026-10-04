// 손님 쪽 읽기 전용 부하 시험 (데이터를 바꾸지 않는다)
//
//   CLIENTS=150 SECONDS=90 node --env-file=.env.local scripts/public-load.mjs
//
// 실제 손님 화면과 같은 동작을 N명 동시에 흉내 낸다.
// 1) 동시에 접속: public_board 1회 조회 (QR 찍고 한꺼번에 들어오는 순간)
// 2) 각자 별도 WebSocket 으로 '내 번호' Broadcast 채널 구독 (0~2초 무작위로 시작)
// 3) 10~15초마다 public_board 조회 (화면이 켜져 있는 동안)
// 결과: 구독 성공/실패, 조회 성공/실패, 조회 지연 p50/p95/최대
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CLIENTS = Number(process.env.CLIENTS ?? 150);
const SECONDS = Number(process.env.SECONDS ?? 90);
const JITTER_MS = Number(process.env.JITTER_MS ?? 2000);
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY 가 필요합니다.");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const clients = Array.from({ length: CLIENTS }, () => createClient(url, key, opts));
const latencies = [];
let ok = 0;
let fail = 0;
const errors = new Map();

async function board(c, n) {
  const t = performance.now();
  const { error } = await c.rpc("public_board", { p_picked_limit: 20, p_my_number: n });
  if (error) {
    fail++;
    errors.set(error.message, (errors.get(error.message) ?? 0) + 1);
  } else {
    ok++;
    latencies.push(performance.now() - t);
  }
}

console.log(`1) 손님 ${CLIENTS}명 동시 첫 조회`);
const t0 = performance.now();
await Promise.all(clients.map((c, i) => board(c, 1 + i)));
console.log(`   ${Math.round(performance.now() - t0)}ms 만에 완료 (성공 ${ok}, 실패 ${fail})`);

const { data: b0 } = await clients[0].rpc("public_board", { p_picked_limit: 1, p_my_number: null });
const sessionId = b0?.service?.session_id ?? "load-test";
console.log(`2) 실시간 구독 ${CLIENTS}개 (Broadcast)`);
let subOk = 0;
let subFail = 0;
const subStatus = new Map();
await Promise.all(
  clients.map(
    (c, i) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          subFail++;
          resolve();
        }, 30_000 + JITTER_MS);
        // 앱과 같게: '내 번호' Broadcast 채널 하나만, 시작 시점은 0~JITTER 초 무작위
        setTimeout(() => c.channel(`order:${sessionId}:${1 + i}`)
          .on("broadcast", { event: "changed" }, () => {})
          .subscribe((s, err) => {
            subStatus.set(s, (subStatus.get(s) ?? 0) + 1);
            if (s === "SUBSCRIBED") {
              subOk++;
              clearTimeout(timer);
              resolve();
            } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
              if (err) errors.set(`realtime: ${err.message}`, (errors.get(`realtime: ${err.message}`) ?? 0) + 1);
              subFail++;
              clearTimeout(timer);
              resolve();
            }
          }), Math.random() * JITTER_MS);
      }),
  ),
);
console.log(`   구독 성공 ${subOk}, 실패 ${subFail}`);

console.log(`3) ${SECONDS}초 동안 10~15초 주기 조회`);
const end = Date.now() + SECONDS * 1000;
await Promise.all(
  clients.map(async (c, i) => {
    await sleep(Math.random() * 10_000);
    while (Date.now() < end) {
      await board(c, 1 + i);
      await sleep(10_000 + Math.random() * 5_000);
    }
  }),
);

latencies.sort((a, b) => a - b);
const pct = (p) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]);
console.log("\n── 결과 ──");
console.log(`실시간 동시 연결: 성공 ${subOk}/${CLIENTS}, 실패 ${subFail}`);
console.log(`조회: 성공 ${ok}, 실패 ${fail} (평균 초당 약 ${(ok / (SECONDS + 5)).toFixed(1)}회)`);
console.log(`조회 지연(ms): p50 ${pct(50)}, p95 ${pct(95)}, 최대 ${pct(100)}`);
if (errors.size) console.log("오류:", Object.fromEntries(errors));
await Promise.all(clients.map((c) => c.removeAllChannels()));
process.exit(0);
