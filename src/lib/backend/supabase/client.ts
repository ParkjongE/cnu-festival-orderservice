import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// 새 'publishable' 키(sb_publishable_...)나 기존 anon 키 모두 사용할 수 있다. 둘 다 브라우저 공개용 키다.
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && publicKey);

let client: SupabaseClient | null = null;

/** 브라우저 탭마다 하나의 클라이언트(=하나의 Realtime 연결)를 재사용한다. */
export function getSupabase(): SupabaseClient {
  if (!url || !publicKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다 (.env.example 참고)");
  }
  if (!client) {
    client = createClient(url, publicKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "ytd-staff-auth",
      },
      global: {
        // 상태 조회가 브라우저/중간 캐시에 남지 않도록 한다
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }
  return client;
}
