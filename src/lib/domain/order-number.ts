import { ORDER_NUMBER_MAX, ORDER_NUMBER_MIN } from "./constants";

export type OrderNumberParse =
  | { ok: true; value: number }
  | { ok: false; reason: "empty" | "not_digits" | "out_of_range" };

/** 사용자가 입력한 주문번호를 정규화한다. `023` 은 `23` 과 같은 번호다. */
export function parseOrderNumber(raw: string): OrderNumberParse {
  const text = raw.normalize("NFKC").trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (!/^\d+$/.test(text)) return { ok: false, reason: "not_digits" };
  const stripped = text.replace(/^0+(?=\d)/, "");
  if (stripped.length > String(ORDER_NUMBER_MAX).length) return { ok: false, reason: "out_of_range" };
  const value = Number(stripped);
  if (!Number.isSafeInteger(value) || value < ORDER_NUMBER_MIN || value > ORDER_NUMBER_MAX) {
    return { ok: false, reason: "out_of_range" };
  }
  return { ok: true, value };
}

export function orderNumberErrorMessage(reason: "empty" | "not_digits" | "out_of_range"): string {
  switch (reason) {
    case "empty":
      return "주문번호를 입력해주세요.";
    case "not_digits":
      return "숫자만 입력해주세요.";
    case "out_of_range":
      return `${ORDER_NUMBER_MIN}~${ORDER_NUMBER_MAX} 사이의 번호를 입력해주세요.`;
  }
}

/** 입력란에 들어오는 값을 숫자만 남기고 최대 자릿수로 자른다 (붙여넣기 대비). */
export function sanitizeOrderNumberInput(raw: string): string {
  return raw.normalize("NFKC").replace(/\D/g, "").slice(0, String(ORDER_NUMBER_MAX).length + 2);
}
