# 출시 전 컴플라이언스 체크리스트

법률 자문이 아니라 제품/개발 준비용 체크리스트다. 출시 전 한국 법무 검토가 필요하다.

## 개인정보/위치

- 이름, 나이, 성별, 위치의 수집 목적과 보관 기간을 명확히 고지한다.
- 위치 권한은 `동네 친구 추천`이라는 핵심 기능에만 사용한다.
- 권한 거부 시에도 앱을 둘러볼 수 있는 fallback을 둔다.
- 정확 좌표는 공개하지 않고 거리 구간/대략 동네만 표시한다.
- 위치 데이터는 TTL을 두고 만료한다.
- 계정 삭제와 개인정보 삭제 요청 경로를 앱 안에 제공한다.

## UGC/채팅 안전

- 가입 전 이용약관과 커뮤니티 정책 동의를 받는다.
- 불쾌한 콘텐츠와 금지 행위를 약관/정책에 명시한다.
- 모든 1:1 대화에는 신고와 차단 기능을 제공한다.
- 신고 접수 후 운영자 검토/제재/기록 절차를 둔다.
- 미성년자 접근 정책을 명확히 한다. MVP는 18세 이상 전용을 권장한다.
- 성적 콘텐츠, 괴롭힘, 스팸을 조장하는 유료/보상 기능을 만들지 않는다.

## 광고/리워드

- 리워드 광고는 사용자가 명시적으로 선택한 행동에서만 표시한다.
- 광고 시청 전 보상 내용과 필요한 행동을 명확히 보여준다.
- 보상 지급은 서버 검증 이벤트로 기록한다.
- 안전 기능, 신고/차단, 계정 삭제는 광고나 결제 뒤에 숨기지 않는다.

## 스토어 제출

- App Store Privacy Nutrition Label과 Google Play Data Safety를 실제 수집/공유와 일치시킨다.
- 위치 권한 설명은 앱 기능과 직접 연결된 문구로 작성한다.
- 계정 생성이 있으면 앱 내 계정 삭제도 제공한다.
- 푸시 알림은 별도 동의 후 사용한다.
- iOS/AOS 실기기에서 권한 거부, 위치 실패, 차단/신고, 계정 삭제를 QA한다.

## Sources

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion requirements: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Google Play UGC policy: https://support.google.com/googleplay/android-developer/answer/9876937
- Google Play data deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- AdMob rewarded ads policy: https://support.google.com/admob/answer/7313578
- Korea Location Information Act: https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010202&lsiSeq=236317&urlMode=engLsInfoR&viewCls=engLsInfoR
- Korea Personal Information Protection Act: https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010203&lsiSeq=248613&urlMode=engLsInfoR&viewCls=engLsInfoR
