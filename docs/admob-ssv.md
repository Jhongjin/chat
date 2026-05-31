# AdMob SSV 리워드 검증

기준일: 2026-05-31.

DongneOn의 리워드 광고는 사용자 경험을 위해 클라이언트 보상 콜백을 받으면 즉시 크레딧을 지급하고, AdMob Server-side verification(SSV) 콜백이 도착하면 같은 이벤트를 검증 상태로 보강하는 구조다. Google도 SSV 콜백은 지연될 수 있으므로 일반적인 앱에서는 클라이언트 콜백으로 먼저 보상하고 서버 콜백으로 전체 보상을 검증하는 방식을 권장한다.

## 구성 요소

- `supabase/migrations/015_ad_reward_verification.sql`
  - `prepare_ad_reward_attempt`: 광고를 띄우기 전 `pending` 보상 시도를 만든다.
  - `claim_ad_reward`: 기존 즉시 보상 RPC를 유지하되, 준비된 시도 ID가 있으면 같은 row를 `confirmed`로 바꾼다.
  - `confirm_ad_reward_from_ssv`: service role 전용 RPC다. AdMob `transaction_id`를 유니크하게 저장하고, SSV가 먼저 오거나 나중에 와도 중복 지급하지 않는다.
  - `admin_reject_ad_reward`: 운영자가 명백한 이상 보상 이벤트를 거절 처리할 수 있다.
- `supabase/functions/verify-ad-reward`
  - AdMob SSV GET 콜백을 받는다.
  - AdMob 공개키를 가져와 `key_id`와 `signature`를 검증한다.
  - 검증된 콜백만 `confirm_ad_reward_from_ssv`에 전달한다.
- `src/services/rewardedAds.ts`
  - 네이티브 AdMob 요청에 `serverSideVerificationOptions.userId`와 `customData`를 싣는다.
  - `customData`는 `prepare_ad_reward_attempt`가 만든 attempt id다.

## Supabase 적용 순서

1. SQL Editor에서 `supabase/migrations/015_ad_reward_verification.sql`을 적용한다.
2. Edge Function을 배포한다.

```bash
supabase functions deploy verify-ad-reward --project-ref zmmukecvxhehaizwnhpz
```

3. Edge Function secret을 설정한다.

```bash
supabase secrets set SUPABASE_URL=https://zmmukecvxhehaizwnhpz.supabase.co --project-ref zmmukecvxhehaizwnhpz
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... --project-ref zmmukecvxhehaizwnhpz
```

4. AdMob 리워드 광고 단위에서 SSV 콜백 URL을 설정한다.

```text
https://zmmukecvxhehaizwnhpz.functions.supabase.co/verify-ad-reward
```

## 운영 흐름

1. 사용자가 리워드 버튼을 누르면 앱이 `prepare_ad_reward_attempt`를 호출한다.
2. 앱은 AdMob 광고 요청에 `userId=<auth.uid()>`, `customData=<attempt_id>`를 넣는다.
3. 광고 완료 이벤트가 앱에 도착하면 `claim_ad_reward`가 하루 3회 상한을 확인하고 즉시 크레딧을 지급한다.
4. AdMob SSV 콜백이 도착하면 Edge Function이 서명을 검증한다.
5. 검증된 콜백은 `transaction_id` 기준으로 idempotent 처리된다. 이미 클라이언트 보상으로 확정된 attempt라면 같은 row에 SSV 정보를 덧붙이고, 아직 pending이면 그 row를 확정한다.

## 검수 포인트

- `transaction_id` 중복 콜백은 보상을 한 번만 기록해야 한다.
- 하루 3회 상한을 넘은 SSV 콜백은 `rejected`로 기록되어야 한다.
- Edge Function 응답이 `200`이어야 AdMob 재시도가 멈춘다. 일시적인 DB 오류는 `500`으로 두어 재시도를 유도한다.
- AdMob 공개키는 24시간 미만으로 캐시한다. 현재 함수는 23시간 캐시한다.
- `SUPABASE_SERVICE_ROLE_KEY`는 Edge Function secret에만 두고 앱 번들에는 절대 포함하지 않는다.

## 공식 참고

- Android SSV: https://developers.google.com/admob/android/ssv
- iOS SSV: https://developers.google.com/admob/ios/ssv
- AdMob key server: https://www.gstatic.com/admob/reward/verifier-keys.json
