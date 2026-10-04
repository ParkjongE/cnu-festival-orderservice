import type { Metadata } from "next";
import { LiveStaff } from "./LiveStaff";

export const metadata: Metadata = { title: "직원 · 청춘 맛 드림 주문 운영" };

export default function AdminPage() {
  return <LiveStaff />;
}
