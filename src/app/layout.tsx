import type { Metadata, Viewport } from "next";
import { Black_Han_Sans, Noto_Sans_KR } from "next/font/google";
import { BRAND_NAME, EVENT_NAME } from "@/lib/domain/constants";
import { LegacyBrowserNotice } from "@/components/LegacyBrowserNotice";
import "./globals.css";

// 두 글꼴 모두 SIL Open Font License (Google Fonts) — 상업적 사용·웹 임베딩 가능
const display = Black_Han_Sans({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-black-han-sans",
  preload: false,
  display: "swap",
});

const sans = Noto_Sans_KR({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-noto-sans-kr",
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND_NAME} · 주문 확인`,
  description: `${EVENT_NAME} ${BRAND_NAME} — 주문번호로 조리 현황을 실시간으로 확인하세요.`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f7ebd2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${display.variable} ${sans.variable} antialiased`}>
      <body className="min-h-dvh">
        {children}
        <LegacyBrowserNotice />
      </body>
    </html>
  );
}
