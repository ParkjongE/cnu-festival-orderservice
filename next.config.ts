import type { NextConfig } from "next";

/**
 * Cloudflare Pages(정적 호스팅)에 올리기 위해 정적 파일로 내보낸다 → `out/`.
 * 서버 코드가 없다: 모든 데이터는 브라우저가 Supabase 와 직접 주고받는다(RLS·RPC 로 보호).
 *
 * 캐시·보안 헤더는 정적 내보내기에서 next.config 의 headers() 를 쓸 수 없으므로 public/_headers 에 둔다.
 * - 주문 상태는 HTML 에 들어가지 않으며, Supabase 요청은 cache: "no-store".
 * - 직원·데모 화면 HTML 은 no-store.
 */
const nextConfig: NextConfig = {
  output: "export",
  poweredByHeader: false,
};

export default nextConfig;
