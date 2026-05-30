# 서브 에이전트 운영 계획

이번 초기 작업에서는 세 가지 병렬 에이전트를 사용했다.

| 역할 | 산출물 |
| --- | --- |
| 시장/제품 전략 | 경쟁 앱 매트릭스, MVP/확장 전략, 리스크 |
| 기술 아키텍처 | Expo/Supabase/PostGIS/RLS 기반 설계, 데이터 모델, 개발 순서 |
| 디자인 시스템 | Quiet Local Trust 디자인 방향, DESIGN.md 토큰/컴포넌트 원칙 |

## 앞으로 필요한 역할

- Product Lead: 우선순위, 지표, 지역 출시 전략
- Mobile Developer: Expo 앱, 네이티브 권한, 푸시, 광고 SDK
- Backend Developer: Supabase 스키마, Edge Functions, RLS, Realtime
- Designer: 디자인 시스템, 온보딩/탐색/채팅/신고 플로우
- Trust & Safety: 신고/차단 정책, 운영자 콘솔, 제재 기준
- QA/Debugger: iOS/AOS 실기기, 권한 거부, 네트워크 오류, RLS 침투 테스트
- Growth/Monetization: 지역 밀도 확보, 리워드 광고, IAP 실험
- Legal/Privacy Reviewer: 위치기반서비스, 개인정보, 청소년 보호, 계정 삭제

## 병렬 작업 방식

- Mobile과 Backend는 기능 단위로 나누되, API 계약은 먼저 문서화한다.
- Designer는 `DESIGN.md`와 실제 앱 화면 차이를 계속 줄인다.
- QA는 구현 완료 후가 아니라, 위치/채팅/신고처럼 위험도가 높은 기능마다 병렬로 검증한다.
- Trust & Safety는 MVP 이후가 아니라 첫 베타 전 필수 트랙으로 둔다.

## 다음 스프린트 후보

1. Expo Router 도입 및 화면 단위 파일 분리
2. Supabase 프로젝트 연결과 인증 구현
3. PostGIS `nearby_profiles` RPC 실제 연결
4. 쪽지 요청 수락/거절 플로우
5. 신고/차단 DB 연동
6. 운영자 콘솔 최소 버전
7. AdMob 리워드 광고 개발 빌드 테스트
