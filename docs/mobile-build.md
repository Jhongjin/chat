# 모바일 빌드 준비

기준일: 2026-05-30.

DongneOn은 Expo React Native 앱이며, 브라우저 화면은 확인용 웹 프리뷰다. 실제 배포 대상은 iOS와 Android 네이티브 빌드다.

## 개발 빌드

```bash
npm install
npx eas login
npx eas whoami
npx eas build:configure
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

푸시, 광고, 위치 권한을 실제 기기에서 검수하려면 Expo Go보다 EAS Development Build로 테스트한다.

## 광고 설정

`react-native-google-mobile-ads`는 네이티브 config plugin이 필요하므로 Expo Go가 아니라 EAS Development Build에서 검수한다. 개발 중에는 Google 테스트 App ID와 테스트 리워드 지면 ID를 기본값으로 사용하며, 출시 전에는 `.env`에 실제 AdMob 값을 넣는다.

```bash
EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=
EXPO_PUBLIC_ADMOB_IOS_APP_ID=
EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID=
EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID=
```

리워드 버튼은 네이티브 빌드에서 광고 시청 완료 이벤트를 받은 뒤 Supabase `claim_ad_reward` RPC로 하루 3회 보상 상한을 기록한다. 운영 빌드에서는 광고 요청에 `serverSideVerificationOptions`를 포함하고, AdMob SSV 콜백은 `verify-ad-reward` Edge Function이 검증한다. 웹 프리뷰에서는 UI 검수용 개발 보상만 지급한다.

## 내부 테스트

```bash
npx eas build --profile preview --platform all
```

- iOS: TestFlight 전 내부 설치 또는 Ad Hoc 배포 정책을 확정한다.
- Android: Google Play Internal Testing 트랙에 올려 권한, 알림, 위치 거부 플로우를 확인한다.
- `development`/`preview` Android 빌드는 빠른 내부 설치를 위해 APK로 생성한다.

## 출시 전 확인

- `app.json`의 `ios.bundleIdentifier`, `android.package`가 스토어 계정과 일치하는지 확인한다.
- `ios.buildNumber`, `android.versionCode`는 배포마다 증가시킨다.
- `extra.eas.projectId`는 `eas build:configure` 후 실제 프로젝트 ID로 교체한다.
- 위치 권한 문구는 정확 위치 비공개 원칙을 포함한다.
- Android 13 이상 알림을 위해 `POST_NOTIFICATIONS` 권한을 포함한다.
- Supabase `service_role` key는 모바일 앱에 넣지 않는다.
- AdMob 실제 App ID와 광고 단위 ID를 테스트 ID에서 운영 ID로 교체한다.
- Supabase Edge Function secret에 `NOTIFICATION_WORKER_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`를 설정한다.
- AdMob 리워드 광고 단위에 `verify-ad-reward` SSV 콜백 URL을 설정하고 테스트 콜백을 실행한다.
