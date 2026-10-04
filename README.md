# 청춘 맛 드림 — 주문 대기 웹

2026 용봉대동풀이 음식부스 **청춘 맛 드림**의 주문번호 확인 서비스입니다.
현장에서 주문·결제 후 받은 종이 번호표의 번호를 입력하면, 직원이 ‘조리 완료’를 누르는 순간 손님 화면이 새로고침 없이 바뀝니다.

- 손님: `/` (공통 QR 고정 URL) — 로그인·전화번호 없음
- 직원: `/admin` (`/admin/login`) — Supabase Auth + `staff_members` 권한
- 데모: `/demo`, `/demo/admin` — 항상 ‘데모 · 실제 주문 아님’ 배지, 브라우저 안에서만 동작, 운영 DB와 완전 분리

웹 푸시·문자·온라인 결제·자동 발번은 범위 밖입니다. 화면을 닫으면 알림이 오지 않는다는 안내를 손님 화면에 항상 표시합니다.

## 빠른 시작

```bash
npm install
npm run dev          # http://localhost:3000
```

Supabase 환경변수가 없으면 `/`와 `/admin`은 **‘운영 연결 준비 중’** 화면을 보여주고, 실제 주문처럼 보이는 데이터는 표시하지 않습니다.
화면과 흐름은 데모로 확인하세요.

- `/demo/admin` 과 `/demo` 를 **두 탭**에 띄우면 탭 사이에 실시간 반영됩니다 (localStorage + BroadcastChannel).
- 데모 상단의 **연결 끊기**로 연결 끊김 안내·저장 실패·재시도·복구 후 재조회를 확인할 수 있습니다.
- **데모 초기화**는 예시 주문을 다시 만듭니다.

```bash
npm run typecheck && npm run lint
npm test             # 도메인 + 데모 엔진 + PGlite 로 실제 마이그레이션·RLS·RPC 검증
npm run build
```

## Supabase 연결

1. Supabase 프로젝트 생성 (리전은 서울 `ap-northeast-2` 권장). 플랜·한도는 [공식 문서](https://supabase.com/docs/guides/realtime/limits)에서 다시 확인하세요.
2. 마이그레이션 적용 — 둘 중 하나
   - CLI: `supabase link --project-ref <ref>` → `supabase db push`
   - 대시보드 SQL Editor에서 `supabase/migrations/` 파일을 **이름 순서대로** 실행
     (`…0100_order_service.sql` → `…0200_seed_menus.sql`). 메뉴 시드는 upsert라 다시 실행해도 안전합니다.
3. **Auth 설정** (Authentication)
   - Sign In / Providers → Email: **Allow new users to sign up 끄기** (공개 회원가입 금지)
   - URL Configuration → Site URL: 배포 URL (예: `https://<도메인>`), Redirect URLs에 로컬 `http://localhost:3000` 추가
4. **Realtime 확인** (Database → Publications → `supabase_realtime`)
   마이그레이션이 `public_service_state`, `public_order_status`, `orders` 를 추가합니다. 세 테이블이 켜져 있는지 확인하세요.
   `orders`는 RLS로 직원에게만 전달되고, 손님은 민감 정보가 없는 `public_order_status`만 구독합니다.
5. 직원 계정 발급 → [docs/OPERATIONS.md](docs/OPERATIONS.md#직원-계정)
6. `.env.local` 작성 (`.env.example` 참고) 후 `npm run dev`

필요한 키는 **URL + Publishable(anon) 키 두 개뿐**입니다. service_role/secret 키는 쓰지 않습니다.

## Vercel 배포

1. 저장소를 Vercel에 Import (Framework: Next.js, 기본 빌드 설정)
2. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production/Preview)
   `NEXT_PUBLIC_` 값은 **빌드 시** 번들에 들어가므로 바꾼 뒤에는 재배포해야 합니다.
3. 배포 URL을 Supabase Site URL에 반영
4. 확정된 URL로 공통 QR 생성 → 실제 인쇄 크기로 iPhone·Android에서 스캔 확인

별도 서버 프로세스나 서버리스 함수가 없습니다. 페이지는 정적 셸이고, 데이터는 브라우저가 Supabase와 직접 주고받습니다.

## 구조

```
src/
  app/                  라우트: /, /admin, /admin/login, /demo, /demo/admin
  components/
    brand/              체커보드·타이틀·리본 (홍보물 디자인 언어)
    customer/           내 주문 카드, 수령 가능/최근 수령 완료, 메뉴
    admin/              주문 등록, 탭 목록, 상세·되돌리기·취소, 회차 시작/종료, 기록
  hooks/
    usePublicBoard.ts   손님 동기화 (스냅샷 → 구독 → 구독 후 재조회 → revision 병합 → 복귀 시 재조회 → 보조 조회)
    useStaffBoard.ts    직원 동기화
    useOrderMutations.ts 서버 성공 후 반영, 같은 request_id 재시도, 되돌리기
  lib/
    domain/             상태 전이 표, 번호 정규화, 정렬, 서울 시간
    backend/supabase/   운영 구현 (공개 조회·Realtime·직원 RPC)
    backend/demo/       데모 구현 (SQL RPC와 같은 규칙의 TS 엔진)
supabase/migrations/    스키마·RLS·RPC·Realtime, 메뉴 시드
tests/                  vitest (tests/db 는 PGlite 로 실제 SQL 실행)
scripts/realtime-load.mjs  동시 연결·반영 지연 측정
```

### 데이터와 권한 요약

| 테이블 | 손님(anon) | 직원 | 쓰기 |
|---|---|---|---|
| `public_service_state` (현재 회차 1행) | 읽기 | 읽기 | RPC |
| `public_order_status` (번호·상태·시각만) | 열린 회차만 읽기 | – | RPC |
| `menus` | 읽기 | 읽기 | 마이그레이션 |
| `service_sessions`, `orders`, `order_items`, `order_events` | ✕ | 읽기 | RPC |
| `staff_members` | ✕ | ✕ | SQL (관리자) |

- 테이블 직접 쓰기 권한은 누구에게도 없습니다. 모든 변경은 `staff_*` RPC(`security definer`, `search_path=''`, 매 호출 `staff_members` 확인)를 통해 **한 트랜잭션**으로 주문·공개 상태·이력을 함께 저장합니다.
- 동시 처리: 주문 행 잠금 + `expected_revision` 검증 → 한 요청만 성공, 나머지는 `stale` + 최신 주문 반환.
- 멱등성: `order_events.request_id` UNIQUE. 네트워크 실패 후 재시도는 같은 `request_id`를 씁니다.
- 번호: `UNIQUE(session_id, order_number)`, 범위 1~9999 (`src/lib/domain/constants.ts` 와 마이그레이션을 함께 수정).
- 열린 회차 1개: `service_sessions` 부분 UNIQUE 인덱스.

### 캐시 전략

- 주문 데이터는 HTML에 포함되지 않습니다. 브라우저의 Supabase 요청은 `cache: "no-store"`.
- `/admin*`, `/demo*` 응답은 `Cache-Control: no-store` (`next.config.ts`).
- 손님 페이지 셸은 정적이어도 무방합니다(데이터 없음).

## 문서

- [docs/OPERATIONS.md](docs/OPERATIONS.md) — 직원 계정 발급·비활성화, 운영 전 점검표, 직원용 사용 안내
- [docs/TESTING.md](docs/TESTING.md) — 확인한 테스트, 아직 확인하지 못한 항목, 부하 시험 시나리오
