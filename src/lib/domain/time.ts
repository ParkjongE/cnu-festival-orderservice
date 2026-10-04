import { SERVICE_TIME_ZONE } from "./constants";

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: SERVICE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const shortTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: SERVICE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SERVICE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** HH:mm:ss (서울 기준) */
export function formatClock(value: Date | string | number): string {
  return timeFmt.format(new Date(value));
}

/** HH:mm (서울 기준) */
export function formatShortTime(value: Date | string | number | null): string {
  if (value === null) return "-";
  return shortTimeFmt.format(new Date(value));
}

/** 서울 기준 오늘 날짜 YYYY-MM-DD */
export function seoulDate(now: Date = new Date()): string {
  return dateFmt.format(now);
}

/** 2026-10-05 → 10월 5일 (월) */
export function formatServiceDate(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return `${m}월 ${d}일 (${weekday})`;
}

export function minutesSince(value: string | null, now: number): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((now - Date.parse(value)) / 60_000));
}

export function formatWon(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}
