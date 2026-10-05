"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { orderNumberErrorMessage, parseOrderNumber, sanitizeOrderNumberInput } from "@/lib/domain/order-number";
import type { OrderStatus, PublicOrderStatus } from "@/lib/domain/types";
import type { LookupState } from "@/hooks/usePublicBoard";
import { CookingDots } from "@/components/ui/CookingDots";
import { BellIcon, CheckIcon, MoonIcon, PotIcon, QuestionIcon, SmallStar, XIcon } from "@/components/ui/icons";

/** 기획서의 상태별 실제 문구 */
const STATUS_COPY: Record<OrderStatus, { title: (n: number) => string; body: string }> = {
  preparing: { title: (n) => `${n}번, 맛있게 준비 중이에요`, body: "조리가 끝나면 이 화면이 바로 ‘조리 완료’로 바뀌어요." },
  ready: { title: (n) => `${n}번, 조리 완료!`, body: "부스에서 주문번호를 말씀해주시고 받아가세요." },
  picked_up: { title: (n) => `${n}번, 수령 완료!`, body: "맛있게 드세요! 즐거운 축제 되세요!" },
  canceled: { title: () => "취소된 주문이에요", body: "확인이 필요하면 부스 직원에게 문의해주세요." },
};

const BADGE: Record<OrderStatus, { label: string; icon: ReactNode; cls: string }> = {
  preparing: { label: "준비 중", icon: <PotIcon className="h-5 w-5" />, cls: "bg-yellow text-ink" },
  ready: { label: "조리 완료", icon: <BellIcon className="h-5 w-5" />, cls: "bg-paper text-green" },
  picked_up: { label: "수령 완료", icon: <CheckIcon className="h-5 w-5" />, cls: "bg-paper text-ink" },
  canceled: { label: "취소됨", icon: <XIcon className="h-5 w-5" />, cls: "bg-paper text-red" },
};

function Card({ tone = "paper", children, animate }: { tone?: "paper" | "green"; children: ReactNode; animate?: boolean }) {
  const toneCls = tone === "green" ? "bg-green text-paper" : "bg-paper text-ink";
  return (
    <section
      aria-labelledby="my-order-title"
      className={`relative rounded-2xl border-[3px] border-ink px-5 pb-5 pt-5 shadow-hard-lg ${toneCls} ${animate ? "ready-pop" : ""}`}
    >
      {children}
    </section>
  );
}

function Headline({ children, id = "my-order-title", tone }: { children: ReactNode; id?: string; tone?: "green" }) {
  return (
    <h2 id={id} className={`font-display text-[1.65rem] leading-tight ${tone === "green" ? "text-paper" : "text-green"}`}>
      {children}
    </h2>
  );
}

export function NumberForm({
  onSubmit,
  disabled,
  notice,
}: {
  onSubmit: (n: number) => void;
  disabled?: boolean;
  notice?: ReactNode;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseOrderNumber(value);
    if (!parsed.ok) {
      setError(orderNumberErrorMessage(parsed.reason));
      return;
    }
    setError(null);
    onSubmit(parsed.value);
  }

  return (
    <Card>
      <Headline>내 주문, 어디까지 왔을까?</Headline>
      <p className="mt-1 text-base text-muted">주문번호를 입력해주세요!</p>
      {notice}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3" noValidate>
        <label htmlFor={inputId} className="sr-only">
          주문번호
        </label>
        <div className="relative">
          <input
            id={inputId}
            value={value}
            onChange={(e) => {
              setValue(sanitizeOrderNumberInput(e.target.value));
              setError(null);
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="go"
            placeholder="예: 23"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="num h-[4.5rem] w-full rounded-xl border-[3px] border-ink bg-white px-4 pr-14 text-center text-[2.6rem] text-ink placeholder:font-sans placeholder:text-xl placeholder:font-medium placeholder:text-muted/70 disabled:opacity-50"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-display text-2xl text-muted">
            번
          </span>
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-[0.95rem] font-bold text-red">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={disabled}
          className="h-14 rounded-xl border-[3px] border-ink bg-red font-display text-[1.35rem] text-paper shadow-hard transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-hard-sm disabled:opacity-50"
        >
          내 주문 확인
        </button>
      </form>
    </Card>
  );
}

function ChangeButton({ onClick, tone }: { onClick: () => void; tone?: "green" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-4 h-12 w-full rounded-xl border-2 px-4 text-base font-bold ${
        tone === "green" ? "border-paper/80 text-paper" : "border-ink bg-cream/60 text-ink"
      }`}
    >
      번호 변경
    </button>
  );
}

function BigNumber({ n, tone }: { n: number; tone: "green" | "ink" | "muted" | "paper" }) {
  const color = { green: "text-green", ink: "text-ink", muted: "text-muted", paper: "text-yellow" }[tone];
  return (
    <p className={`num text-center leading-none ${color} text-[clamp(4rem,24vw,6rem)]`}>
      {n}
      <span className="ml-1 font-display text-[0.38em]">번</span>
    </p>
  );
}

export function StatusCard({
  number,
  row,
  lookupState,
  onChange,
  onRetry,
}: {
  number: number;
  row: PublicOrderStatus | null;
  lookupState: LookupState;
  onChange: () => void;
  onRetry: () => void;
}) {
  if (!row) {
    if (lookupState === "not_found") {
      return (
        <Card>
          <p className="text-center text-sm font-bold text-muted">내 주문번호</p>
          <BigNumber n={number} tone="muted" />
          <div role="status" aria-live="polite" className="mt-3 text-center">
            <div className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-cream px-3 py-1 text-sm font-bold">
              <QuestionIcon className="h-4 w-4" /> 미등록
            </div>
            <Headline>아직 등록되지 않은 번호예요</Headline>
            <p className="mt-1 text-base text-muted">
              번호를 다시 확인해주세요. 방금 주문했다면 잠시 후 등록될 수 있어요.
            </p>
          </div>
          <ChangeButton onClick={onChange} />
        </Card>
      );
    }
    if (lookupState === "error") {
      return (
        <Card>
          <p className="text-center text-sm font-bold text-muted">내 주문번호</p>
          <BigNumber n={number} tone="muted" />
          <div role="status" aria-live="polite" className="mt-3 text-center">
            <Headline>연결을 확인하고 있어요</Headline>
            <p className="mt-1 text-base text-muted">주문 상태를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 h-12 w-full rounded-xl border-[3px] border-ink bg-red font-bold text-paper shadow-hard-sm"
          >
            다시 확인
          </button>
          <ChangeButton onClick={onChange} />
        </Card>
      );
    }
    return (
      <Card>
        <p className="text-center text-sm font-bold text-muted">내 주문번호</p>
        <BigNumber n={number} tone="muted" />
        <p role="status" className="mt-3 text-center text-base font-bold text-muted">
          주문 상태를 확인하고 있어요…
        </p>
      </Card>
    );
  }

  const copy = STATUS_COPY[row.status];
  const badge = BADGE[row.status];
  const isReady = row.status === "ready";

  return (
    // 상태가 바뀔 때마다 다시 그려 짧은 강조 애니메이션을 준다 (모션 감소 설정 시 생략)
    <Card key={`${row.status}`} tone={isReady ? "green" : "paper"} animate={isReady}>
      {isReady && (
        <>
          <SmallStar className="absolute left-4 top-4 h-5 w-5 text-yellow" />
          <SmallStar className="absolute right-4 top-4 h-5 w-5 text-yellow" />
        </>
      )}
      <p className={`text-center text-sm font-bold ${isReady ? "text-paper/85" : "text-muted"}`}>내 주문번호</p>
      <BigNumber
        n={row.order_number}
        tone={isReady ? "paper" : row.status === "preparing" ? "green" : row.status === "canceled" ? "muted" : "ink"}
      />
      <div className="mt-3 text-center">
        <div
          className={`mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-[0.95rem] font-black ${badge.cls}`}
        >
          {badge.icon}
          {badge.label}
          {row.status === "preparing" && <CookingDots />}
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          <Headline tone={isReady ? "green" : undefined}>{copy.title(row.order_number)}</Headline>
          <p className={`mt-1 text-base ${isReady ? "text-paper" : "text-muted"}`}>{copy.body}</p>
        </div>
      </div>
      {(row.status === "preparing" || isReady) && (
        <p className={`mt-3 text-center text-sm ${isReady ? "text-paper/85" : "text-muted"}`}>
          이 번호는 이 기기에 저장돼요. 창을 닫았다가 다시 들어와도 이어서 보여드려요.
        </p>
      )}
      <ChangeButton onClick={onChange} tone={isReady ? "green" : undefined} />
    </Card>
  );
}

export function RestingCard() {
  return (
    <Card>
      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-cream">
        <MoonIcon className="h-6 w-6 text-green" />
      </div>
      <div role="status" className="text-center">
        <Headline>지금은 주문 안내를 쉬고 있어요</Headline>
        <p className="mt-1 text-base text-muted">운영이 시작되면 주문번호를 확인할 수 있어요.</p>
      </div>
    </Card>
  );
}

export function LoadingCard() {
  return (
    <Card>
      <div role="status" className="py-6 text-center">
        <p className="font-display text-2xl text-green">불러오는 중…</p>
        <p className="mt-1 text-base text-muted">주문 현황을 확인하고 있어요.</p>
      </div>
    </Card>
  );
}

export function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <div role="alert" className="text-center">
        <Headline>연결을 확인하고 있어요</Headline>
        <p className="mt-1 text-base text-muted">주문 현황을 불러오지 못했어요. 인터넷 연결을 확인해주세요.</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 h-12 w-full rounded-xl border-[3px] border-ink bg-red font-bold text-paper shadow-hard-sm"
      >
        다시 시도
      </button>
    </Card>
  );
}
