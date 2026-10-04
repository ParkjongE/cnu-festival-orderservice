# 보안 점검 (2026-10-05, 운영 배포 기준)

## 결과 요약

| 항목 | 결과 |
|---|---|
| Git 이력 전체 비밀값 검색 (DB 비밀번호·공개키 실제 값, `sb_secret_`, JWT, GitHub/Cloudflare 토큰) | 없음. `.env.local`(권한 600)은 Git 제외 |
| GitHub 저장소 | 비공개(PRIVATE) |
| 배포 파일(`out/`)에 secret/service_role 키·DB 비밀번호 | 없음. 공개용 publishable 키만 포함(설계상 공개, RLS 로 보호) |
| 운영 의존성 취약점 (`npm audit --omit=dev`) | 0건. 개발용 lint 도구(eslint-config-next → braces)에 high 5건 — 배포물에 포함되지 않음 |
| Supabase Security Advisor | ERROR 0건. WARN 6건(아래) |
| 회원가입 | 꺼짐(`disable_signup: true`), 이메일 로그인만 사용 |
| 익명 사용자 직접 호출 (운영 DB) | 주문 원본 조회·직원 RPC·공개 테이블 쓰기 모두 `permission denied` |
| 응답 헤더 | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP. 직원·데모 화면 no-store |
| CSP 동작 | 외부 스크립트·외부 요청 차단 확인. 실제 화면 조작 중 CSP 위반 0건, JS 오류 0건 |
| XSS 위험 코드 | `dangerouslySetInnerHTML`·`innerHTML`·`eval` 미사용. 모든 출력은 React 이스케이프 |

## Supabase Advisor 경고 설명

- `authenticated_security_definer_function_executable` × 5 (`am_i_staff`, `staff_*`): **의도된 설계.** 로그인 사용자만 호출할 수 있고, 각 함수가 매 호출마다 `staff_members` 활성 여부를 확인해 아니면 거부한다(테스트로 확인). `search_path = ''` 로 고정.
- `auth_leaked_password_protection`: 유출 비밀번호 차단(HaveIBeenPwned)은 Supabase **Pro 플랜 기능**. 대신 직원 비밀번호를 길고 고유하게(12자 이상, 다른 서비스와 다르게) 정한다.

## 남은 위험과 대응

- **번호만 알면 상태 조회 가능**: 공개 번호표 서비스로 설계. 노출 정보는 번호·상태·시각뿐.
- **조회 남용(대량 요청)**: 무료 플랜에는 IP별 요청 제한이 없다. 이상 징후가 보이면 Supabase 대시보드 API 사용량을 확인하고, 필요 시 Cloudflare 앞단 제한이나 Pro 전환을 검토.
- **직원 기기 분실**: 해당 계정 `staff_members.active = false` 로 즉시 차단(docs/OPERATIONS.md), 필요 시 대시보드에서 사용자 Ban.
- **공개 Broadcast 채널에 가짜 신호**: 누구나 `order:…` 채널에 신호를 보낼 수는 있지만, 화면은 신호 내용을 쓰지 않고 서버(`public_board`)에서 다시 조회하므로 잘못된 상태가 표시되지 않는다. 신호가 몰려도 번호당 최소 1초 간격으로만 조회한다.
- **CSP `script-src 'unsafe-inline'`**: Next.js 정적 내보내기의 초기화 스크립트 때문에 필요(정적 파일이라 nonce 불가). 외부 스크립트는 차단된다.
