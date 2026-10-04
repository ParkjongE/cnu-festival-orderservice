import type { Metadata } from "next";
import { DemoStaff } from "./DemoStaff";

export const metadata: Metadata = { title: "데모 · 직원 주문 운영" };

export default function DemoAdminPage() {
  return <DemoStaff />;
}
