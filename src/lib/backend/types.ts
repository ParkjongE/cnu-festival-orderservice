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

export interface PublicSnapshot {
  ready: PublicOrderStatus[];
  pickedUp: PublicOrderStatus[];
  hasMorePickedUp: boolean;
}

export interface PublicSubscription {
  onServiceState(state: PublicServiceState): void;
  onStatus(row: PublicOrderStatus): void;
  onHealth(health: ChannelHealth): void;
}

/** 손님 화면이 쓰는 읽기 전용 인터페이스 */
export interface PublicBackend {
  kind: BackendKind;
  getServiceState(): Promise<PublicServiceState>;
  getSnapshot(sessionId: string, pickedUpLimit: number): Promise<PublicSnapshot>;
  lookup(sessionId: string, orderNumber: number): Promise<PublicOrderStatus | null>;
  listMenus(): Promise<Menu[]>;
  /** 현재 회차 상태 변경과 해당 회차의 공개 상태 변경을 한 채널로 구독한다. */
  subscribe(sessionId: string | null, handlers: PublicSubscription): () => void;
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
