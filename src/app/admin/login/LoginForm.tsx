"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isSupabaseConfigured } from "@/lib/backend/supabase/client";
import { createSupabaseStaffBackend } from "@/lib/backend/supabase/staff";
import { BrandTitle, CheckerStrip } from "@/components/brand/Brand";
import { SetupRequired } from "@/components/SetupRequired";

export function LoginForm() {
  const router = useRouter();
  const [backend] = useState(createSupabaseStaffBackend);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSupabaseConfigured) return <SetupRequired area="staff" />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await backend.signIn(email.trim(), password);
    if (!res.ok) {
      setBusy(false);
      setError(res.message);
      return;
    }
    // 로그인만으로는 부족하다: staff_members 에 등록된 활성 계정인지 서버에서 확인한다
    try {
      if (!(await backend.isStaff())) {
        await backend.signOut();
        setBusy(false);
        setError("직원 권한이 없는 계정이에요. 관리자에게 등록을 요청해주세요.");
        return;
      }
    } catch {
      setBusy(false);
      setError("권한을 확인하지 못했어요. 연결을 확인하고 다시 시도해주세요.");
      return;
    }
    router.replace("/admin");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <CheckerStrip />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
        <p className="text-center">
          <BrandTitle size="sm" />
        </p>
        <form onSubmit={submit} className="mt-5 rounded-2xl border-[3px] border-ink bg-paper p-5 shadow-hard-lg">
          <h1 className="font-display text-2xl text-green">직원 로그인</h1>
          <p className="mt-1 text-sm text-muted">발급받은 직원 계정으로 로그인하세요. 회원가입은 제공하지 않아요.</p>
          <label className="mt-4 block">
            <span className="text-sm font-bold text-muted">이메일</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-12 w-full rounded-lg border-2 border-ink bg-white px-3 text-base"
            />
          </label>
          <label className="mt-3 block">
            <span className="text-sm font-bold text-muted">비밀번호</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-12 w-full rounded-lg border-2 border-ink bg-white px-3 text-base"
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 text-sm font-bold text-red">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 h-14 w-full rounded-xl border-[3px] border-ink bg-red text-lg font-black text-paper shadow-hard-sm disabled:opacity-60"
          >
            {busy ? "확인 중…" : "로그인"}
          </button>
        </form>
        <Link href="/" className="mt-6 block text-center text-sm text-muted underline">
          손님 화면으로
        </Link>
      </main>
      <CheckerStrip />
    </div>
  );
}
