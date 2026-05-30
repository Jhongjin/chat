---
version: alpha
name: Quiet Local Trust
description: Premium mobile design system for a nearby-friends chat app.
colors:
  ink: "#1C1D1F"
  muted-ink: "#62656B"
  paper: "#FFFCF6"
  canvas: "#F6F2EA"
  line: "#E4DED2"
  primary: "#177E76"
  primary-container: "#D8F1EC"
  human: "#EF6F6C"
  reward: "#F2B84B"
  safety: "#7966CC"
  success: "#567D46"
  error: "#C14343"
typography:
  title:
    fontSize: 30px
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: 0
  h1:
    fontSize: 24px
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: 0
  h2:
    fontSize: 19px
    fontWeight: 800
    lineHeight: 1.32
    letterSpacing: 0
  body:
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: 0
  caption:
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
radius:
  sm: 8px
  md: 12px
  lg: 18px
  pill: 999px
---

# Quiet Local Trust

DongneOn은 “가까운 사람과 가볍고 안전하게 대화를 시작하는 동네 쪽지 앱”이다. 디자인의 프리미엄은 화려함이 아니라 신뢰감, 빠른 이해, 적절한 거리감에서 나온다. 소개팅앱처럼 과열되지 않고, 지역 커뮤니티와 개인 메신저 사이의 조용한 위치를 잡는다.

## Product Feel

- 동네 기반이지만 정확한 위치를 드러내지 않는다.
- 첫 대화는 부담 없는 쪽지 요청으로 시작한다.
- 광고는 콘텐츠 흐름을 방해하지 않고, 사용자가 선택한 보상 행동에서만 등장한다.
- 신고, 차단, 숨김, 계정 삭제는 가까운 곳에 둔다.

## UI Rules

- 첫 화면은 마케팅 랜딩이 아니라 실제 탐색 화면이다.
- 하단 탭은 `동네`, `쪽지`, `리워드`, `내 정보`로 제한한다.
- 카드는 반복 항목, 모달, 도구성 패널에만 사용한다.
- 버튼과 아이콘 터치 영역은 최소 44-48px로 유지한다.
- 정확 주소 대신 `OO동 근처`, `약 2km`처럼 대략 정보만 보여준다.
- 보상 광고 영역은 reward amber를 쓰되, 대화 리스트나 채팅방 안에 끼워 넣지 않는다.

## Components

- `Onboarding Sheet`: 이름, 나이, 성별을 받고 위치 권한은 목적을 설명한 뒤 요청한다. 만 18세 미만은 진행하지 않는다.
- `Location Band`: 현재 동네 라벨, 새로고침, 위치 사용 목적을 짧게 보여준다.
- `Neighbor Row`: 이름, 나이, 대략 거리, 관심사, 확인 배지, 쪽지 버튼을 한 줄 흐름으로 둔다.
- `Message Request`: 상대가 수락해야 채팅방이 열린다는 원칙을 유지한다.
- `Chat Room`: 신고/차단 액션을 헤더 우측에 둔다.
- `Reward Card`: 추가 쪽지권, 프로필 부스트, 추천 새로고침처럼 스팸을 만들지 않는 혜택만 제공한다.
- `MascotMark`: 지도 핀, 말풍선, 작은 안심 불빛을 합친 추상 캐릭터다. 빈 상태, 권한 안내, 안전 안내에만 제한적으로 사용한다.
- `Empty State`: 위치 미허용, 근처 친구 없음, 열린 대화 없음 상태를 명확히 보여주고 다음 행동을 하나만 제공한다.
- `Safety Action Sheet`: 신고 사유, 대화 숨김, 차단을 분리해 사용자가 즉시 통제감을 갖게 한다.

## Mascot & Visual Identity

마스코트는 앱의 주인공이 아니라 안전한 안내자다. 이름은 내부적으로 `온이`를 사용한다. 형태는 말풍선과 위치 핀을 합친 추상 캐릭터이며, 동물·사람·커플·하트·불꽃 이미지는 쓰지 않는다. 사용 위치는 온보딩, 빈 상태, 신고/차단 안내, 위치 비공개 안내처럼 감정 부담을 낮추는 지점으로 제한한다.

## Voice

부드러운 존댓말을 기본으로 한다. 사용자를 몰아붙이지 않고 선택권을 준다.

좋은 예:

- `근처 친구를 찾아볼게요.`
- `대략적인 거리만 보여줘요.`
- `광고를 보면 오늘 추천을 조금 더 볼 수 있어요.`

피할 표현:

- `주변 이성 폭주`
- `지금 바로 만나기`
- `무료 충전 완료!`
- `놓치면 후회`

## Motion

화면 전환은 220-280ms, 리스트 등장과 말풍선 등장은 120-180ms 정도로 짧게 둔다. 튀는 bounce/elastic 모션은 사용하지 않는다. 위치 탐색 애니메이션은 반복적으로 시선을 빼앗지 않는다.

## References

- Google Stitch DESIGN.md docs: https://stitch.withgoogle.com/docs/design-md/overview
- Google Stitch skills docs: https://stitch.withgoogle.com/docs/skills/get-started/
- Jhongjin/open-design: https://github.com/Jhongjin/open-design
- Jhongjin/taste-skill: https://github.com/Jhongjin/taste-skill
- Jhongjin/impeccable: https://github.com/Jhongjin/impeccable
- VoltAgent/awesome-design-md: https://github.com/VoltAgent/awesome-design-md
