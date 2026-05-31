# 라이브 Supabase 적용 체크리스트

기준일: 2026-05-31.

대상 프로젝트:

```text
project-ref: zmmukecvxhehaizwnhpz
url: https://zmmukecvxhehaizwnhpz.supabase.co
region: ap-northeast-2
```

## 1. 적용 전

- SQL Editor에서 한 파일씩 실행한다. 오류가 나면 다음 파일로 넘어가지 않는다.
- 모바일 앱에는 `anon public` key만 들어간다.
- `service_role` key, DB password, AdMob secret 성격의 값은 채팅에 붙이지 않고 Supabase secret 또는 로컬 CLI에만 둔다.
- 이미 `001`부터 `005`까지 적용했다면 `006`부터 이어서 실행한다. 새 프로젝트라면 `001`부터 `016`까지 순서대로 실행한다.

## 2. SQL 적용 순서

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

## 3. 적용 확인 SQL

SQL Editor에서 아래 쿼리로 핵심 테이블과 RPC가 보이는지 확인한다.

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'user_locations',
    'message_requests',
    'conversations',
    'messages',
    'reports',
    'blocks',
    'notification_jobs',
    'client_events',
    'ad_reward_events'
  )
order by table_name;
```

```sql
select proname
from pg_proc
where proname in (
  'nearby_profiles',
  'create_message_request',
  'accept_message_request',
  'send_conversation_message',
  'pause_discovery_until',
  'mute_conversation_until',
  'report_message',
  'claim_ad_reward',
  'prepare_ad_reward_attempt',
  'confirm_ad_reward_from_ssv',
  'claim_notification_jobs',
  'admin_report_queue'
)
order by proname;
```

## 4. Edge Function 배포

Supabase CLI를 쓸 수 있으면 아래 순서로 배포한다.

```bash
supabase login
supabase link --project-ref zmmukecvxhehaizwnhpz
supabase functions deploy send-notifications --project-ref zmmukecvxhehaizwnhpz
supabase functions deploy verify-ad-reward --project-ref zmmukecvxhehaizwnhpz
```

필수 secret:

```bash
supabase secrets set SUPABASE_URL=https://zmmukecvxhehaizwnhpz.supabase.co --project-ref zmmukecvxhehaizwnhpz
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... --project-ref zmmukecvxhehaizwnhpz
supabase secrets set NOTIFICATION_WORKER_SECRET=... --project-ref zmmukecvxhehaizwnhpz
```

## 5. 외부 콘솔 설정

- Supabase Auth: Anonymous sign-ins 활성화
- AdMob rewarded unit: SSV callback URL을 `https://zmmukecvxhehaizwnhpz.functions.supabase.co/verify-ad-reward`로 설정
- 알림 워커: 외부 cron 또는 스케줄러에서 `send-notifications`를 호출하고 `Authorization: Bearer <NOTIFICATION_WORKER_SECRET>` 헤더를 붙인다.

## 6. smoke test

- 앱 실행 후 익명 세션이 생성되는지 확인한다.
- 온보딩에서 이름/나이/성별/동의를 저장한다.
- 위치 허용 후 `nearby_profiles` 오류가 없는지 확인한다.
- 첫 쪽지 요청, 수락, 채팅 전송을 각각 한 번씩 확인한다.
- 상대 메시지 신고 버튼을 눌러 `reports.message_id`가 기록되는지 확인한다.
- 리워드 광고는 네이티브 빌드에서만 AdMob 이벤트까지 확인한다.

## 7. 현재 로컬 검증 상태

- `npm run typecheck`: 통과
- `npx expo-doctor`: 21/21 통과
- Android Metro bundle: `200`, 약 6.3MB 생성 확인
- 웹 프리뷰: `http://localhost:19016/` 로드 및 콘솔 에러 0
- Edge Function Deno 타입검사: 로컬에 Deno가 없어 미실행
