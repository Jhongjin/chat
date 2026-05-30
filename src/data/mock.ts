import { colors } from "../theme";
import type { ChatThread, NearbyProfile, RewardPerk } from "../types";

export const nearbyProfiles: NearbyProfile[] = [
  {
    id: "user-01",
    name: "서연",
    age: 29,
    gender: "female",
    distanceKm: 0.8,
    neighborhood: "성수동",
    intro: "퇴근 후 조용한 카페와 산책 루트를 잘 찾아요.",
    tags: ["카페", "산책", "영화"],
    avatarColor: colors.coral,
    lastActiveMinutes: 4,
    responseRate: 92,
    verified: true
  },
  {
    id: "user-02",
    name: "민재",
    age: 32,
    gender: "male",
    distanceKm: 1.6,
    neighborhood: "뚝섬",
    intro: "러닝 크루는 부담스럽고 가볍게 한강 뛰는 친구를 찾고 있어요.",
    tags: ["러닝", "한강", "음악"],
    avatarColor: colors.teal,
    lastActiveMinutes: 12,
    responseRate: 88,
    verified: true
  },
  {
    id: "user-03",
    name: "하린",
    age: 27,
    gender: "female",
    distanceKm: 2.4,
    neighborhood: "왕십리",
    intro: "동네 맛집 기록 중. 새로 생긴 가게 같이 가볼 분.",
    tags: ["맛집", "사진", "전시"],
    avatarColor: colors.lilac,
    lastActiveMinutes: 28,
    responseRate: 81,
    verified: false
  },
  {
    id: "user-04",
    name: "지훈",
    age: 35,
    gender: "male",
    distanceKm: 4.7,
    neighborhood: "서울숲",
    intro: "반려 식물, 책, 주말 브런치 이야기를 좋아합니다.",
    tags: ["책", "브런치", "식물"],
    avatarColor: colors.green,
    lastActiveMinutes: 35,
    responseRate: 94,
    verified: true
  }
];

export const initialThreads: ChatThread[] = [
  {
    id: "thread-01",
    participant: nearbyProfiles[0],
    unreadCount: 1,
    messages: [
      {
        id: "message-01",
        authorId: "user-01",
        body: "오늘 저녁 서울숲 산책 괜찮으세요?",
        createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString()
      },
      {
        id: "message-02",
        authorId: "me",
        body: "좋아요. 8시쯤이면 가능해요.",
        createdAt: new Date(Date.now() - 1000 * 60 * 9).toISOString()
      },
      {
        id: "message-03",
        authorId: "user-01",
        body: "그럼 입구 쪽 조용한 카페 앞에서 봐요.",
        createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString()
      }
    ]
  },
  {
    id: "thread-02",
    participant: nearbyProfiles[1],
    unreadCount: 0,
    messages: [
      {
        id: "message-04",
        authorId: "user-02",
        body: "주말 아침 러닝은 보통 몇 km 정도 뛰세요?",
        createdAt: new Date(Date.now() - 1000 * 60 * 84).toISOString()
      }
    ]
  }
];

export const rewardPerks: RewardPerk[] = [
  {
    id: "perk-01",
    title: "첫 쪽지 1회 추가",
    description: "일일 상한 안에서 첫 인사권을 하나 더 받아요.",
    cost: 1,
    accent: "coral"
  },
  {
    id: "perk-02",
    title: "프로필 부스트 30분",
    description: "인증 계정만 사용할 수 있고 신고 누적 계정은 제외돼요.",
    cost: 2,
    accent: "teal"
  },
  {
    id: "perk-03",
    title: "관심사 리프레시",
    description: "오늘의 추천 목록을 한 번 더 새로고침해요.",
    cost: 1,
    accent: "lilac"
  }
];
