# 모바일 빌드 준비

기준일: 2026-05-30.

DongneOn은 Expo React Native 앱이며, 브라우저 화면은 확인용 웹 프리뷰다. 실제 배포 대상은 iOS와 Android 네이티브 빌드다.

## 개발 빌드

```bash
npm install
npx eas login
npx eas build:configure
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

푸시, 광고, 위치 권한을 실제 기기에서 검수하려면 Expo Go보다 EAS Development Build로 테스트한다.

## 내부 테스트

```bash
npx eas build --profile preview --platform all
```

- iOS: TestFlight 전 내부 설치 또는 Ad Hoc 배포 정책을 확정한다.
- Android: Google Play Internal Testing 트랙에 올려 권한, 알림, 위치 거부 플로우를 확인한다.

## 출시 전 확인

- `app.json`의 `ios.bundleIdentifier`, `android.package`가 스토어 계정과 일치하는지 확인한다.
- `extra.eas.projectId`는 `eas build:configure` 후 실제 프로젝트 ID로 교체한다.
- 위치 권한 문구는 정확 위치 비공개 원칙을 포함한다.
- Android 13 이상 알림을 위해 `POST_NOTIFICATIONS` 권한을 포함한다.
- Supabase `service_role` key는 모바일 앱에 넣지 않는다.
