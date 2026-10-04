import Link from "next/link";
import { CheckerStrip, CustomerHeader } from "@/components/brand/Brand";

/** 운영 Supabase 가 연결되지 않았을 때. 데모 데이터를 실제 주문처럼 보여주지 않는다. */
export function SetupRequired({ area }: { area: "customer" | "staff" }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <CustomerHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10">
        <section className="rounded-2xl border-[3px] border-ink bg-paper p-5 shadow-hard-lg">
          <h2 className="font-display text-[1.6rem] leading-tight text-green">운영 연결 준비 중이에요</h2>
          <p className="mt-2 text-base text-muted">
            {area === "customer"
              ? "아직 주문 서버가 연결되지 않아 실제 주문 상태를 보여드릴 수 없어요."
              : "직원 화면을 쓰려면 Supabase 연결 설정이 필요해요."}
          </p>
          <p className="mt-3 rounded-lg border-2 border-dashed border-line bg-cream/60 p-3 text-sm text-muted">
            관리자 안내: <code className="font-bold text-ink">.env.local</code> 에 <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> 를 넣고 다시 빌드하세요. 자세한 절차는 README 를 참고하세요.
          </p>
          <Link
            href={area === "customer" ? "/demo" : "/demo/admin"}
            className="mt-4 flex h-12 items-center justify-center rounded-xl border-[3px] border-ink bg-yellow font-bold text-ink shadow-hard-sm"
          >
            데모 화면 둘러보기 (실제 주문 아님)
          </Link>
        </section>
      </main>
      <CheckerStrip />
    </div>
  );
}
