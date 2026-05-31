# 기술 아키텍처

기준일: 2026-05-30.

## 권장 스택

- Mobile: Expo React Native SDK 56, TypeScript
- Native services: expo-location, expo-notifications, EAS Development Build
- Backend: Supabase Auth, Postgres, PostGIS, RLS, Realtime, Edge Functions
- Admin: Next.js 또는 Supabase 기반 내부 콘솔
- Ads: AdMob Rewarded Ads, 서버 사이드 보상 검증

Expo SDK 56은 2026-05-21 릴리스되었고 React Native 0.85 및 React 19.2.3 계열을 포함한다. Expo SDK reference의 최소 Node.js 기준은 22.13.x 계열이다. 광고 SDK와 푸시, 스토어 배포를 고려하면 Expo Go가 아니라 EAS Development Build 중심으로 개발하는 편이 맞다.

## 데이터 원칙

- 프로필 정보와 인증 식별자는 분리한다.
- 정확 좌표는 공개하지 않는다.
- 위치 데이터는 TTL을 두고 만료한다.
- 타인 프로필은 직접 SELECT하지 않고 RPC로 필요한 필드만 반환한다.
- 서비스 role key는 모바일 앱에 절대 포함하지 않는다.
- 18세 이상 전용을 기본 정책으로 둔다.

## 핵심 테이블

- `profiles`: 표시 이름, 출생연도/나이, 성별, 상태, 마지막 활동
- `user_locations`: PostGIS point, 정확도, geohash, 만료 시각
- `discovery_settings`: 노출 여부, 반경, 필터
- `message_requests`: 첫 쪽지 요청, 수락/거절/만료
- `conversations`: 대화방
- `conversation_members`: 참여자와 읽음 상태
- `messages`: 메시지 본문, 상태, moderation 상태
- `blocks`: 차단 관계
- `reports`: 신고
- `moderation_actions`: 운영자 조치
- `push_tokens`: 푸시 토큰
- `ad_reward_events`: 리워드 광고 시도, 클라이언트 보상, AdMob SSV 검증 이벤트
- `account_deletion_requests`: 계정 삭제 요청
- `notification_jobs`: 새 쪽지 요청/새 메시지 푸시 발송 대기 큐

## API/RLS 정책

- `profiles`: 본인 전체 조회/수정, 타인은 `nearby_profiles` RPC 결과만 조회
- `user_locations`: 클라이언트 SELECT 금지, `update_my_location` RPC로만 갱신
- `nearby_profiles`: 5km 상한, 차단 관계 제외, 정지/삭제/위치 만료 계정 제외
- `message_requests`: 생성은 Edge Function 경유, 일일 제한/금칙어/차단 여부 검사
- `messages`: 대화 참여자만 조회/작성 가능
- `blocks`: 본인이 건 차단만 생성/조회/해제 가능
- `reports`: 사용자는 프로필/메시지 신고 생성과 자기 신고 조회만 가능, 운영자는 service role 또는 admin claim 사용
- `admin_report_queue`: service role 전용 신고 큐 조회
- `admin_suspend_profile`: service role 전용 계정 제재 기록

## Realtime

Supabase Realtime은 대화방 단위 private channel로 묶는다. 채널 join은 `conversation_members`에 해당 유저가 있는지 확인한다. 새 메시지 푸시는 DB trigger가 `notification_jobs`에 적재하고, Edge Function 또는 별도 워커가 Expo Push API로 전송한다.

## Ads

리워드 광고는 사용자가 기다리지 않도록 클라이언트 완료 콜백으로 먼저 보상하고, AdMob SSV 콜백으로 사후 검증한다. 앱은 광고 요청에 Supabase 사용자 ID와 pending attempt ID를 싣고, `verify-ad-reward` Edge Function은 AdMob 공개키 서명 검증 후 service role RPC로 같은 이벤트를 확정한다. `transaction_id`는 유니크하게 저장해 재시도 콜백과 중복 지급을 막는다.

## Moderation

출시 전 필수:

- 약관/개인정보/위치 동의
- 신고, 차단, 메시지 숨김
- 금칙어/스팸 필터
- 운영자 정지/영구 정지
- 계정 삭제
- 운영자 연락처

Apple/Google의 UGC 정책상 신고/차단과 운영 대응은 MVP에서도 빠지면 안 된다.

## 개발 순서

1. 정책 확정: 18+, 약관, 개인정보, 위치 동의, 계정 삭제
2. Expo 앱: 라우팅, 디자인 토큰, 온보딩, 위치 권한
3. Supabase: 스키마, RLS, PostGIS RPC
4. 탐색: 근처 친구, 반경 필터, 노출 일시정지
5. 쪽지: 요청권, 수락/거절, 차단
6. 채팅: Realtime, 읽음, 푸시
7. 운영: 신고 큐, 운영자 콘솔, 제재
8. 광고: AdMob, 리워드 검증, 일일 상한
9. QA: iOS/AOS 실기기, 권한 거부, 위치 오류, RLS 침투 테스트
10. 베타: TestFlight, Google Internal Testing, 신고 대응 리허설

## Sources

- Expo SDK 56: https://expo.dev/changelog/sdk-56
- expo-location: https://docs.expo.dev/versions/latest/sdk/location/
- expo-notifications: https://docs.expo.dev/versions/latest/sdk/notifications/
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Realtime Authorization: https://supabase.com/docs/guides/realtime/authorization
- Supabase PostGIS: https://supabase.com/docs/guides/database/extensions/postgis
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play UGC policy: https://support.google.com/googleplay/android-developer/answer/9876937
- AdMob rewarded ads policy: https://support.google.com/admob/answer/7313578
- Korea Location Information Act: https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010202&lsiSeq=236317&urlMode=engLsInfoR&viewCls=engLsInfoR
- Korea Personal Information Protection Act: https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010203&lsiSeq=248613&urlMode=engLsInfoR&viewCls=engLsInfoR
