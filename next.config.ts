import type { NextConfig } from "next";

/**
 * 캐시 전략
 * - 주문 상태는 페이지 HTML 에 들어가지 않는다. 브라우저가 Supabase 에서 직접 조회하며 fetch 는 cache: "no-store".
 * - 페이지 셸(HTML/JS)은 정적이어도 되지만, 직원·데모 화면은 공유 캐시에 남지 않도록 no-store 로 둔다.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/admin", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/demo/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/demo", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
