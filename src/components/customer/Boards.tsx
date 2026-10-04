"use client";

import { useState } from "react";
import { formatShortTime, formatWon } from "@/lib/domain/time";
import type { Menu, PublicOrderStatus } from "@/lib/domain/types";
import { ChevronIcon, SmallStar } from "@/components/ui/icons";

function SectionTitle({ children, tone }: { children: React.ReactNode; tone: "yellow" | "plain" }) {
  if (tone === "yellow") {
    return (
      <h2 className="relative inline-block font-display text-[1.6rem] leading-none text-green">
        {/* 살짝 기울어진 노랑 강조 띠 — 장식이므로 글자 자체는 기울이지 않는다 */}
        <span aria-hidden className="absolute -inset-x-2 bottom-0 top-3 -rotate-2 bg-yellow" />
        <span className="relative">{children}</span>
      </h2>
    );
  }
  return <h2 className="font-display text-[1.35rem] leading-none text-ink">{children}</h2>;
}

export function ReadyBoard({ rows, myNumber }: { rows: PublicOrderStatus[]; myNumber: number | null }) {
  return (
    <section aria-labelledby="ready-title" className="mt-9">
      <div className="flex items-end justify-between gap-2">
        <span id="ready-title">
          <SectionTitle tone="yellow">지금 받아가세요!</SectionTitle>
        </span>
        <span className="text-sm font-bold text-muted">{rows.length}건</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border-2 border-dashed border-line bg-paper/60 px-4 py-5 text-center text-base text-muted">
          조리가 끝난 주문이 여기 표시돼요.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-2.5" aria-label="수령 가능한 번호">
          {rows.map((r) => {
            const mine = r.order_number === myNumber;
            return (
              <li
                key={r.order_id}
                className={`flex flex-col items-center justify-center rounded-xl border-[3px] px-1 py-2 shadow-hard-sm ${
                  mine ? "border-ink bg-red text-paper" : "border-green bg-paper text-green"
                }`}
              >
                <span className="num text-[2.1rem] leading-none">
                  {r.order_number}
                  <span className="ml-0.5 font-display text-base">번</span>
                </span>
                {mine && <span className="mt-1 text-xs font-black">내 번호</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function PickedUpBoard({
  rows,
  hasMore,
  onMore,
}: {
  rows: PublicOrderStatus[];
  hasMore: boolean;
  onMore: () => void;
}) {
  return (
    <section aria-labelledby="picked-title" className="mt-8">
      <div className="flex items-end justify-between gap-2">
        <span id="picked-title">
          <SectionTitle tone="plain">최근 수령 완료</SectionTitle>
        </span>
        <span className="text-sm text-muted">최근 순</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-base text-muted">아직 수령 완료된 주문이 없어요.</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="최근 수령 완료 번호">
            {rows.map((r) => (
              <li
                key={r.order_id}
                className="inline-flex items-baseline gap-1 rounded-lg border-2 border-line bg-paper/70 px-2.5 py-1 text-muted"
              >
                <span className="num text-xl text-ink/75">{r.order_number}</span>
                <span className="text-xs">{formatShortTime(r.picked_up_at)}</span>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={onMore}
              className="mt-3 h-11 rounded-lg border-2 border-ink px-4 text-sm font-bold text-ink"
            >
              더 보기
            </button>
          )}
        </>
      )}
    </section>
  );
}

const MENU_TONES = [
  "bg-red text-paper",
  "bg-red text-paper",
  "bg-yellow text-ink",
  "bg-green text-paper",
];

export function MenuSection({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-9 rounded-2xl border-[3px] border-ink bg-paper shadow-hard">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-list"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center justify-between gap-2 px-4 text-left"
      >
        <span className="flex items-center gap-2 font-display text-[1.35rem] text-ink">
          <SmallStar className="h-4 w-4 text-red" />
          오늘의 메뉴
        </span>
        <span className="flex items-center gap-1 text-sm font-bold text-muted">
          {open ? "접기" : "펼치기"}
          <ChevronIcon className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <ul id="menu-list" className="grid grid-cols-2 gap-2.5 border-t-2 border-ink p-3">
          {menus.map((m, i) => (
            <li key={m.id} className="overflow-hidden rounded-xl border-2 border-ink">
              <p className={`min-h-[3.75rem] px-2.5 py-2 font-display text-[1.15rem] leading-tight ${MENU_TONES[i % 4]}`}>
                {m.name}
              </p>
              <p className="num bg-paper px-2.5 py-1.5 text-right text-xl text-red">{formatWon(m.price_krw)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
