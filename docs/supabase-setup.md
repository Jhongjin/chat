# Supabase 연결 설정

프로젝트 ID: `zmmukecvxhehaizwnhpz`

앱에서 사용할 Project URL:

```text
https://zmmukecvxhehaizwnhpz.supabase.co
```

## 1. 앱 환경 변수

`.env`에 `anon public` key만 넣는다. `service_role` key는 모바일 앱에 절대 넣지 않는다.

```env
EXPO_PUBLIC_SUPABASE_URL=https://zmmukecvxhehaizwnhpz.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

anon key 위치:

Supabase Dashboard → Project Settings → API 또는 API Keys → `anon public`

## 2. Auth 설정

MVP는 사용자에게 이메일/전화번호를 바로 요구하지 않기 위해 익명 세션으로 시작한다.

Supabase Dashboard → Authentication → Providers에서 Anonymous sign-ins를 활성화한 뒤 `Save changes`를 누른다. 이 설정이 꺼져 있으면 앱은 데모 모드로 계속 동작하지만 Supabase 프로필 저장은 실패한다.

## 3. DB 스키마 적용

Supabase SQL Editor에서 아래 파일을 순서대로 실행한다.

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_chat_flow_functions.sql`
3. `supabase/migrations/003_conversation_runtime.sql`
4. `supabase/migrations/004_preferences_rewards_push.sql`
5. `supabase/migrations/005_account_deletion_request.sql`
6. `supabase/migrations/006_block_list_management.sql`
7. `supabase/migrations/007_discovery_pause.sql`
8. `supabase/migrations/008_message_safety_filter.sql`
9. `supabase/migrations/009_notification_jobs.sql`
10. `supabase/migrations/010_notification_job_claims.sql`
11. `supabase/migrations/011_conversation_mute.sql`
12. `supabase/migrations/012_report_history.sql`
13. `supabase/migrations/013_client_events.sql`
14. `supabase/migrations/014_admin_moderation_tools.sql`
15. `supabase/migrations/015_ad_reward_verification.sql`
16. `supabase/migrations/016_message_report_rpc.sql`

적용 후 앱에서 가능한 흐름:

- 익명 세션 생성
- 프로필 저장
- 위치 RPC 저장
- 근처 친구 RPC 조회
- 쪽지 요청 생성
- 받은 쪽지 수락/거절
- 대화방 목록/메시지 조회
- 대화 메시지 전송 및 Realtime 발행 준비
- 관심사/노출 반경/추천 노출 설정 저장
- 리워드 광고 보상 기록
- Expo 푸시 토큰 저장
- 계정 삭제 요청 접수와 추천/위치/푸시 중지
- 신고/차단 저장
- 차단 목록 조회와 차단 해제
- 내 동네 노출 일시 숨김과 추천 제외
- 첫 쪽지/일반 채팅의 연락처·주소·외부 메신저 공유 제한
- 새 쪽지 요청/새 메시지 알림 작업 큐 생성
- Edge Function 푸시 워커의 작업 claim/완료 처리
- 대화별 알림 끄기와 푸시 큐 제외
- 내가 접수한 신고 내역과 검토 상태 조회
- 최소 제품 지표 이벤트 기록
- service role 전용 신고 큐 조회, 신고 상태 변경, 계정 제재/복구
- AdMob SSV 콜백 검증과 리워드 중복 지급 방지
- 대화 참여자만 가능한 메시지 단위 신고

## 4. 운영 주의

- 첫 쪽지에서 전화번호, 주소, 외부 메신저 ID 공유는 제한한다.
- 신고/차단은 유료 기능 뒤에 숨기지 않는다.
- 위치는 정확 좌표가 아니라 대략 거리만 클라이언트에 표시한다.
- `service_role` key는 Edge Functions 또는 서버 환경에서만 사용한다.
