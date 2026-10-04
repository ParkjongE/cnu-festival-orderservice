import { EVENT_NAME } from "@/lib/domain/constants";
import { SmallStar, StarBurst } from "@/components/ui/icons";

export function CheckerStrip({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`checker h-5 w-full border-y-2 border-ink ${className}`} />;
}

/** 포스터 제목 옆의 짧은 방사선 장식 */
function Rays({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 40 60"
      aria-hidden
      className={`h-12 w-8 shrink-0 ${flip ? "-scale-x-100" : ""}`}
      strokeLinecap="round"
      strokeWidth="4.5"
    >
      <path d="M34 8 20 16" stroke="var(--color-green)" />
      <path d="M36 30H18" stroke="var(--color-red)" />
      <path d="M34 52 20 44" stroke="var(--color-green)" />
    </svg>
  );
}

/** 브랜드 이름. 표기는 항상 '청춘 맛 드림' 그대로 쓴다. */
export function BrandTitle({ size = "lg" }: { size?: "lg" | "sm" }) {
  const cls =
    size === "lg"
      ? "text-[clamp(2.6rem,13.5vw,4.25rem)] leading-[0.95]"
      : "text-[1.6rem] leading-none";
  return (
    <span className={`font-display ${cls} whitespace-nowrap tracking-tight`}>
      <span className="text-green">청춘</span> <span className="text-red">맛</span>{" "}
      <span className="text-green">드림</span>
    </span>
  );
}

export function EventLine() {
  return (
    <p className="flex items-center justify-center gap-2 text-[0.8rem] font-bold tracking-wide text-green">
      <span aria-hidden className="h-0.5 w-6 bg-green" />
      <span aria-hidden className="h-0.5 w-3 bg-red" />
      {EVENT_NAME}
      <span aria-hidden className="h-0.5 w-3 bg-red" />
      <span aria-hidden className="h-0.5 w-6 bg-green" />
    </p>
  );
}

/** 빨강 리본 장식 (문구: 실시간 주문 현황) */
export function HeaderRibbon() {
  return (
    <p className="ribbon mx-auto inline-flex items-center gap-2 bg-red px-7 py-1.5 text-[0.95rem] font-bold text-paper">
      <SmallStar className="h-3.5 w-3.5 text-yellow" />
      실시간 주문 현황
      <SmallStar className="h-3.5 w-3.5 text-yellow" />
    </p>
  );
}

/** 손님 화면 상단: 체커보드 → 행사명 → 타이틀 → 문구. 입력란이 밀리지 않도록 높이를 낮게 유지한다. */
export function CustomerHeader() {
  return (
    <header className="relative">
      <CheckerStrip />
      <div className="relative mx-auto max-w-md px-4 pb-3 pt-4 text-center">
        <StarBurst className="absolute left-3 top-9 h-6 w-6 text-red" />
        <StarBurst className="absolute right-3 top-9 h-6 w-6 text-red" />
        <EventLine />
        <h1 className="mt-1.5 flex items-center justify-center gap-1">
          <Rays />
          <BrandTitle />
          <Rays flip />
        </h1>
        <div className="mt-2">
          <HeaderRibbon />
        </div>
      </div>
    </header>
  );
}

export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border-2 border-ink bg-yellow px-2 py-0.5 text-xs font-black text-ink shadow-hard-sm ${className}`}
    >
      데모
      <span className="font-medium">· 실제 주문 아님</span>
    </span>
  );
}
