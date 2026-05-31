# DongneOn

5km 안의 동네 사람과 부담 없이 시작하는 안전한 친구 쪽지 앱입니다. iOS와 Android를 한 코드베이스로 운영하기 위해 Expo React Native + TypeScript를 사용합니다.

## 현재 포함된 것

- 이름, 나이, 성별만 필수로 받고 위치 권한은 목적을 설명한 뒤 요청하는 온보딩 흐름
- 5km 이내 근처 친구 탐색 UI
- 첫 쪽지와 1:1 채팅 MVP 화면
- 신고/차단, 차단 목록 확인과 차단 해제
- 메시지 단위 신고와 내 화면에서 메시지 숨김
- 신고 내역과 검토 상태 확인
- 대화 즐겨찾기와 조용한 시간 알림 설정
- 대화별 알림 끄기
- 내 동네 일시 숨김
- 사용자 데이터 JSON 내보내기
- AdMob SSV 검증 기반 리워드 광고 혜택 화면
- Supabase/PostGIS/RLS 기반 백엔드 초안
- 시장 분석, 제품 전략, 디자인 시스템 문서

## 실행

```bash
npm install
npm run start
```

Expo SDK 56 기반입니다. SDK 56의 최소 Node.js 기준은 22.13.x 계열이므로 로컬 런타임을 먼저 맞춰 주세요. 광고 SDK, 푸시, 스토어 배포까지 고려하면 Expo Go보다 EAS Development Build 기준으로 운영하는 것이 좋습니다.

브라우저에서 보이는 화면은 개발 확인용 웹 프리뷰입니다. 실제 앱 검수는 iOS/Android EAS Development Build로 진행합니다.

## 환경 변수

`.env.example`을 기준으로 Supabase와 AdMob 값을 설정합니다.

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=
EXPO_PUBLIC_ADMOB_IOS_APP_ID=
EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID=
EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID=
```

## 문서

- [DESIGN.md](./DESIGN.md)
- [시장 분석](./docs/market-analysis.md)
- [제품 전략](./docs/product-strategy.md)
- [기술 아키텍처](./docs/architecture.md)
- [서브 에이전트 운영 계획](./docs/agent-workplan.md)
- [출시 전 컴플라이언스 체크리스트](./docs/compliance-checklist.md)
- [UI/UX 디자인 점검 결과](./docs/design-qa.md)
- [채팅 경험 고도화 로드맵](./docs/chat-experience-roadmap.md)
- [모바일 빌드 준비](./docs/mobile-build.md)
- [푸시 알림 워커](./docs/notification-worker.md)
- [신고 검수 운영](./docs/moderation-operations.md)
- [AdMob SSV 리워드 검증](./docs/admob-ssv.md)
- [Supabase 연결 설정](./docs/supabase-setup.md)
- [라이브 Supabase 적용 체크리스트](./docs/live-supabase-rollout.md)
- [Supabase 초기 스키마](./supabase/migrations/001_initial_schema.sql)
- [쪽지 요청 RPC](./supabase/migrations/002_chat_flow_functions.sql)
- [대화/실시간 메시지 RPC](./supabase/migrations/003_conversation_runtime.sql)
- [설정/리워드/푸시 RPC](./supabase/migrations/004_preferences_rewards_push.sql)
- [계정 삭제 요청 RPC](./supabase/migrations/005_account_deletion_request.sql)
- [차단 목록 관리 RPC](./supabase/migrations/006_block_list_management.sql)
- [동네 노출 일시 숨김 RPC](./supabase/migrations/007_discovery_pause.sql)
- [메시지 안전 필터 RPC](./supabase/migrations/008_message_safety_filter.sql)
- [푸시 알림 작업 큐](./supabase/migrations/009_notification_jobs.sql)
- [푸시 알림 워커 RPC](./supabase/migrations/010_notification_job_claims.sql)
- [대화별 알림 끄기 RPC](./supabase/migrations/011_conversation_mute.sql)
- [신고 내역 조회 RPC](./supabase/migrations/012_report_history.sql)
- [제품 지표 이벤트 RPC](./supabase/migrations/013_client_events.sql)
- [운영자 신고 검수 RPC](./supabase/migrations/014_admin_moderation_tools.sql)
- [AdMob SSV 리워드 검증 RPC](./supabase/migrations/015_ad_reward_verification.sql)
- [메시지 신고 RPC](./supabase/migrations/016_message_report_rpc.sql)

## 출시 전 필수 결정

- 18세 이상 전용 서비스로 갈지 최종 확정
- 휴대폰 인증 또는 Apple/Google 로그인 적용 범위 확정
- 위치기반서비스, 개인정보 처리방침, 이용약관, 계정 삭제 절차 법무 검토
- 신고 처리 SLA와 운영자 콘솔 구축
