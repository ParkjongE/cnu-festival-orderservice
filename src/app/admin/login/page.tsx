import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "직원 로그인 · 청춘 맛 드림" };

export default function LoginPage() {
  return <LoginForm />;
}
