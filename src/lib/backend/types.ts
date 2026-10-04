import type {
  Menu,
  NewOrderItemInput,
  OrderEvent,
  OrderMutationResult,
  OrderStatus,
  PublicOrderStatus,
  PublicServiceState,
  ServiceSession,
  SessionMutationResult,
  StaffOrder,
} from "@/lib/domain/types";

export type BackendKind = "supabase" | "demo";

/** 'live' = 실시간 채널 구독 완료. 그 외에는 화면에 '실시간'이라고 표시하지 않는다. */
export type ChannelHealth = "live" | "down";

/** 손님 화면 한 번 조회 결과 (public_board RPC). 회차가 열려 있지 않으면 목록은 비어 있다. */
export interface PublicBoardSnapshot {
  service: PublicServiceState;
  ready: PublicOrderStatus[];
  pickedUp: PublicOrderStatus[];
  hasMorePickedUp: boolean;
  /** 요청한 내 번호의 현재 회차 상태. 등록되지 않았으면 null */
  mine: PublicOrderStatus | null;
}

export interface PublicSubscription {
  onServiceState(state: PublicServiceState): void;
  onStatus(row: PublicOrderStatus): void;
  onHealth(health: ChannelHealth): void;
}

/** 손님 화면이 쓰는 읽기 전용 인터페이스 */
export interface PublicBackend {
  kind: BackendKind;
  /** 회차 정보 + 수령 가능 + 최근 수령 완료 + 내 번호를 요청 한 번으로 가져온다. */
  getBoard(pickedUpLimit: number, myNumber: number | null): Promise<PublicBoardSnapshot>;
  listMenus(): Promise<Menu[]>;
  /**
   * 회차 변경과 '내 번호'의 상태 변경만 실시간으로 구독한다.
   * (모든 주문 변경을 모든 손님에게 보내면 메시지가 손님 수만큼 늘어나므로, 목록은 주기 조회로 갱신한다.)
   */
  subscribe(sessionId: string | null, myNumber: number | null, handlers: PublicSubscription): () => void;
}

export interface StaffUser {
  id: string;
  email: string | null;
}

export interface StaffSubscription {
  /** 원본 주문 행 변경 (items 는 포함되지 않을 수 있다) */
  onOrder(row: Omit<StaffOrder, "items"> & { items?: StaffOrder["items"] }): void;
  onServiceState(state: PublicServiceState): void;
  onHealth(health: ChannelHealth): void;
}

/** 직원 화면 인터페이스. 모든 쓰기는 서버(RPC)에서 권한·revision·멱등성을 검증한다. */
export interface StaffBackend {
  kind: BackendKind;
  getUser(): Promise<StaffUser | null>;
  signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }>;
  signOut(): Promise<void>;
  isStaff(): Promise<boolean>;
  onAuthChange(cb: (user: StaffUser | null) => void): () => void;

  getOpenSession(): Promise<ServiceSession | null>;
  listSessions(): Promise<ServiceSession[]>;
  listOrders(sessionId: string): Promise<StaffOrder[]>;
  getOrder(orderId: string): Promise<StaffOrder | null>;
  listEvents(orderId: string): Promise<OrderEvent[]>;
  listMenus(): Promise<Menu[]>;

  createOrder(input: {
    sessionId: string;
    orderNumber: number;
    items: NewOrderItemInput[];
    note: string | null;
    requestId: string;
  }): Promise<OrderMutationResult>;
  transition(input: {
    orderId: string;
    to: OrderStatus;
    expectedRevision: number;
    requestId: string;
    reason?: string | null;
  }): Promise<OrderMutationResult>;
  openSession(label: string, serviceDate: string): Promise<SessionMutationResult>;
  closeSession(sessionId: string): Promise<SessionMutationResult>;

  subscribe(sessionId: string | null, handlers: StaffSubscription): () => void;
}
