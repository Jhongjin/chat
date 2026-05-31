# 푸시 알림 워커

기준일: 2026-05-31.

`notification_jobs`는 새 쪽지 요청과 새 메시지를 Expo Push API로 보내기 위한 서버 큐다. 모바일 앱은 푸시 토큰만 저장하고, 실제 발송은 `supabase/functions/send-notifications` Edge Function이 처리한다.

## 환경 변수

Supabase Edge Function secret으로 설정한다.

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NOTIFICATION_WORKER_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY`는 앱 `.env`에 절대 넣지 않는다.

## 배포

```bash
supabase functions deploy send-notifications
supabase secrets set NOTIFICATION_WORKER_SECRET=replace-with-long-random-value
```

스케줄러나 외부 크론에서 호출할 때는 아래 헤더를 붙인다.

```bash
Authorization: Bearer replace-with-long-random-value
```

## 처리 흐름

1. DB trigger가 `notification_jobs`에 pending 작업을 만든다.
2. Edge Function이 `claim_notification_jobs` RPC로 최대 50개를 processing 상태로 claim한다.
3. 대상 사용자의 Expo Push Token을 조회한다.
4. Expo Push API로 발송한다.
5. `complete_notification_job` RPC로 `sent`, `failed`, `skipped` 상태를 기록한다.

`reset_stale_notification_jobs`는 10분 이상 processing 상태에 남은 작업을 pending으로 되돌려 재시도할 수 있게 한다.
