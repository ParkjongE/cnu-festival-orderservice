import type { Metadata } from "next";
import { DemoCustomer } from "./DemoCustomer";

export const metadata: Metadata = { title: "데모 · 청춘 맛 드림 주문 확인" };

export default function DemoPage() {
  return <DemoCustomer />;
}
