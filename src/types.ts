export type Gender = "female" | "male" | "nonbinary" | "private";

export type NearbyProfile = {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  distanceKm: number;
  neighborhood: string;
  intro: string;
  tags: string[];
  avatarColor: string;
  lastActiveMinutes: number;
  responseRate: number;
  verified: boolean;
};

export type ChatMessage = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type ChatThread = {
  id: string;
  participant: NearbyProfile;
  unreadCount: number;
  mutedUntil?: string | null;
  messages: ChatMessage[];
};

export type RewardPerk = {
  id: string;
  title: string;
  description: string;
  cost: number;
  accent: "coral" | "teal" | "lilac" | "yellow";
};
