import type { Menu } from "./types";

/** 주문번호 허용 범위. 바꿀 때는 마이그레이션의 orders.order_number check 와 RPC 검증도 함께 바꾼다. */
export const ORDER_NUMBER_MIN = 1;
export const ORDER_NUMBER_MAX = 9999;

/** 최근 수령 완료 목록 한 번에 보여주는 개수 */
export const RECENT_PICKED_UP_PAGE = 20;

/** 실시간 연결 실패 시 보조 조회 간격(ms). 매번 이 범위에서 무작위로 고른다. */
export const FALLBACK_POLL_MIN_MS = 10_000;
export const FALLBACK_POLL_MAX_MS = 15_000;

/** 상태 변경 직후 '되돌리기'를 띄워두는 시간(ms) */
export const UNDO_WINDOW_MS = 8_000;

export const NOTE_MAX_LENGTH = 200;
export const MAX_ITEM_QUANTITY = 99;

export const SERVICE_TIME_ZONE = "Asia/Seoul";

export const BRAND_NAME = "청춘 맛 드림";
export const EVENT_NAME = "2026 용봉대동풀이";

/**
 * 메뉴판 기준 메뉴. 운영 데이터는 DB(menus)가 기준이며, 이 값은 데모 모드와
 * DB 조회 실패 시의 화면 안내용 기본값으로만 쓴다.
 */
export const DEFAULT_MENUS: Menu[] = [
  { id: "lasagna", name: "알랭 라자냐", price_krw: 10000, sort_order: 10, active: true },
  { id: "chicken_nanban", name: "본쿠라 치킨난반", price_krw: 10000, sort_order: 20, active: true },
  { id: "cheese_corn", name: "멕시칸 치즈 옥수수", price_krw: 5000, sort_order: 30, active: true },
  { id: "zero_highball", name: "무알콜 하이볼", price_krw: 5000, sort_order: 40, active: true },
];
