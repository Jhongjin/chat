import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { colors } from "../theme";
import type { ChatMessage, ChatThread, Gender, NearbyProfile } from "../types";

export type ProfileDraft = {
  name: string;
  age: number;
  gender: Gender;
};

export type LocationDraft = {
  latitude: number;
  longitude: number;
  accuracyM?: number;
};

export type DiscoveryPreferences = {
  radiusKm: number;
  visible: boolean;
};

export type RewardSummary = {
  earnedToday: number;
  grantedAmount?: number;
};

export type AdRewardAttempt = {
  attemptId: string;
  userId: string;
};

export type PushTokenDraft = {
  deviceIdHash?: string;
  platform: "android" | "ios";
  token: string;
};

export type AccountDeletionState = {
  requestedAt: string;
  status: string;
};

export type ReportHistoryItem = {
  createdAt: string;
  id: string;
  reason: string;
  status: "dismissed" | "open" | "resolved" | "reviewing";
  targetName: string;
  targetUserId: string | null;
};

type NearbyProfileRow = {
  user_id: string;
  display_name: string;
  age: number;
  gender: Gender;
  distance_m: number;
  last_seen_at: string;
  avatar_color: string | null;
  interests?: string[] | null;
};

type MessageRequestRow = {
  request_id: string;
  direction: "sent" | "received";
  status: "pending" | "accepted" | "declined" | "expired";
  body_preview: string;
  created_at: string;
  peer_id: string;
  display_name: string;
  age: number;
  gender: Gender;
  avatar_color: string | null;
  distance_m: number | null;
  last_seen_at: string;
};

type ConversationRow = {
  conversation_id: string;
  peer_id: string;
  display_name: string;
  age: number;
  gender: Gender;
  avatar_color: string | null;
  distance_m: number | null;
  last_seen_at: string;
  last_message_body: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  muted_until?: string | null;
  unread_count: number | null;
};

type MessageRow = {
  id?: string;
  message_id?: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type PreferenceStateRow = {
  interests: string[] | null;
  pause_until?: string | null;
  radius_m: number | null;
  visible: boolean | null;
};

type RewardSummaryRow = {
  earned_today: number | null;
  granted_amount?: number | null;
};

type AdRewardAttemptRow = {
  attempt_id: string;
  viewer_id: string;
};

type AccountDeletionRow = {
  requested_at: string;
  status: string;
};

type ReportHistoryRow = {
  created_at: string;
  reason: string;
  report_id: string;
  status: ReportHistoryItem["status"];
  target_display_name: string | null;
  target_user_id: string | null;
};

export type MessageRequestItem = {
  id: string;
  body: string;
  createdAt: string;
  direction: "sent" | "received";
  peer: NearbyProfile;
  status: "pending" | "accepted" | "declined" | "expired";
};

type BackendResult<T> =
  | { data: T; ok: true }
  | { error: string; ok: false };

export function canUseBackend() {
  return isSupabaseConfigured && Boolean(supabase);
}

export async function ensureAnonymousSession(): Promise<BackendResult<string>> {
  if (!supabase) {
    return { ok: false, error: "Supabase anon key is not configured." };
  }

  const current = await supabase.auth.getSession();

  if (current.data.session?.user.id) {
    return { ok: true, data: current.data.session.user.id };
  }

  const created = await supabase.auth.signInAnonymously();

  if (created.error || !created.data.user?.id) {
    return {
      ok: false,
      error:
        created.error?.message ??
        "Anonymous sign-in failed. Enable anonymous sign-ins in Supabase Auth settings."
    };
  }

  return { ok: true, data: created.data.user.id };
}

export async function fetchPreferenceState(): Promise<
  BackendResult<{ interests: string[]; pauseUntil: string | null; radiusKm: number; visible: boolean }>
> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("my_preference_state");

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = ((data ?? []) as PreferenceStateRow[])[0];

  return {
    ok: true,
    data: {
      interests: row?.interests ?? [],
      pauseUntil: row?.pause_until ?? null,
      radiusKm: Math.round((row?.radius_m ?? 5000) / 1000),
      visible: row?.visible ?? true
    }
  };
}

export async function pauseDiscoveryUntil(pauseUntil: string | null): Promise<BackendResult<string | null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("pause_discovery_until", {
    paused_until: pauseUntil
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = ((data ?? []) as Array<{ pause_until: string | null }>)[0];

  return { ok: true, data: row?.pause_until ?? null };
}

export async function saveProfile(draft: ProfileDraft): Promise<BackendResult<string>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const birthYear = new Date().getFullYear() - draft.age;
  const { error } = await supabase.from("profiles").upsert({
    id: session.data,
    display_name: draft.name.trim(),
    birth_year: birthYear,
    gender: draft.gender,
    last_seen_at: new Date().toISOString()
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: session.data };
}

export async function saveProfileInterests(interests: string[]): Promise<BackendResult<null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { error } = await supabase.rpc("save_profile_interests", {
    interests
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: null };
}

export async function saveDiscoveryPreferences(
  preferences: DiscoveryPreferences
): Promise<BackendResult<null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { error } = await supabase.rpc("save_discovery_preferences", {
    radius_m: preferences.radiusKm * 1000,
    visible: preferences.visible
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: null };
}

export async function updateMyLocation(location: LocationDraft): Promise<BackendResult<null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { error } = await supabase.rpc("update_my_location", {
    lat: location.latitude,
    lng: location.longitude,
    accuracy_m: location.accuracyM ?? null
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: null };
}

export async function fetchNearbyProfiles(radiusKm: number): Promise<BackendResult<NearbyProfile[]>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { data, error } = await supabase.rpc("nearby_profiles", {
    radius_m: radiusKm * 1000
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    data: ((data ?? []) as NearbyProfileRow[]).map((row, index) => toNearbyProfile(row, index))
  };
}

export async function createMessageRequest(
  toUserId: string,
  body: string
): Promise<BackendResult<string>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { data, error } = await supabase.rpc("create_message_request", {
    target_user_id: toUserId,
    body
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: String(data) };
}

export async function fetchMessageRequests(): Promise<BackendResult<MessageRequestItem[]>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("my_message_requests");

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    data: ((data ?? []) as MessageRequestRow[]).map((row, index) => ({
      id: row.request_id,
      body: row.body_preview,
      createdAt: row.created_at,
      direction: row.direction,
      peer: toNearbyProfile(toPeerRow(row), index),
      status: row.status
    }))
  };
}

export async function acceptMessageRequest(requestId: string): Promise<BackendResult<string>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { data, error } = await supabase.rpc("accept_message_request", {
    request_id: requestId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: String(data) };
}

export async function declineMessageRequest(requestId: string): Promise<BackendResult<null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { error } = await supabase.rpc("decline_message_request", {
    request_id: requestId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: null };
}

export async function fetchConversations(): Promise<BackendResult<ChatThread[]>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("my_conversations");

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as ConversationRow[];
  const threads = await Promise.all(
    rows.map(async (row, index) => {
      const messages = await fetchConversationMessages(row.conversation_id, session.data);

      return {
        id: row.conversation_id,
        messages: messages.ok ? messages.data : toPreviewMessages(row, session.data),
        mutedUntil: row.muted_until ?? null,
        participant: toNearbyProfile(toConversationPeerRow(row), index),
        unreadCount: row.unread_count ?? 0
      };
    })
  );

  return { ok: true, data: threads };
}

export async function fetchConversationMessages(
  conversationId: string,
  currentUserId?: string
): Promise<BackendResult<ChatMessage[]>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  let userId = currentUserId;

  if (!userId) {
    const session = await ensureAnonymousSession();

    if (!session.ok) {
      return { ok: false, error: session.error };
    }

    userId = session.data;
  }

  const { data, error } = await supabase.rpc("conversation_messages", {
    target_conversation_id: conversationId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    data: ((data ?? []) as MessageRow[]).map((row) => toChatMessage(row, userId))
  };
}

export async function sendConversationMessage(
  conversationId: string,
  body: string
): Promise<BackendResult<ChatMessage>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("send_conversation_message", {
    body,
    target_conversation_id: conversationId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    data: {
      id: String(data),
      authorId: "me",
      body,
      createdAt: new Date().toISOString()
    }
  };
}

export async function markConversationRead(conversationId: string): Promise<BackendResult<null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { error } = await supabase.rpc("mark_conversation_read", {
    target_conversation_id: conversationId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: null };
}

export async function muteConversationUntil(
  conversationId: string,
  mutedUntil: string | null
): Promise<BackendResult<string | null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("mute_conversation_until", {
    next_muted_until: mutedUntil,
    target_conversation_id: conversationId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = ((data ?? []) as Array<{ muted_until: string | null }>)[0];

  return { ok: true, data: row?.muted_until ?? null };
}

export async function subscribeToConversationMessages(
  conversationId: string,
  onMessage: (message: ChatMessage) => void
): Promise<BackendResult<() => void>> {
  const client = supabase;

  if (!client) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const channel = client
    .channel(`conversation:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        filter: `conversation_id=eq.${conversationId}`,
        schema: "public",
        table: "messages"
      },
      (payload) => onMessage(toChatMessage(payload.new as MessageRow, session.data))
    )
    .subscribe();

  return {
    ok: true,
    data: () => {
      void client.removeChannel(channel);
    }
  };
}

export async function fetchRewardSummary(): Promise<BackendResult<RewardSummary>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("my_reward_summary");

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = ((data ?? []) as RewardSummaryRow[])[0];

  return { ok: true, data: { earnedToday: row?.earned_today ?? 0 } };
}

export async function prepareAdRewardAttempt(): Promise<BackendResult<AdRewardAttempt>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("prepare_ad_reward_attempt", {
    ad_unit_id: null,
    amount: 1,
    reward_type: "credit"
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = ((data ?? []) as AdRewardAttemptRow[])[0];

  if (!row?.attempt_id || !row.viewer_id) {
    return { ok: false, error: "Reward attempt was not created." };
  }

  return {
    ok: true,
    data: {
      attemptId: row.attempt_id,
      userId: row.viewer_id
    }
  };
}

export async function claimAdReward(clientAttemptId?: string): Promise<BackendResult<RewardSummary>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("claim_ad_reward", {
    amount: 1,
    reward_type: "credit",
    ssv_id: clientAttemptId ?? null
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = ((data ?? []) as RewardSummaryRow[])[0];

  return {
    ok: true,
    data: {
      earnedToday: row?.earned_today ?? 0,
      grantedAmount: row?.granted_amount ?? 1
    }
  };
}

export async function registerPushToken(draft: PushTokenDraft): Promise<BackendResult<null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { error } = await supabase.rpc("save_push_token", {
    device_id_hash: draft.deviceIdHash ?? null,
    expo_push_token: draft.token,
    platform: draft.platform
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: null };
}

export async function requestAccountDeletion(): Promise<BackendResult<AccountDeletionState>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("request_account_deletion");

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as AccountDeletionRow[];
  const row = rows[0];

  return {
    ok: true,
    data: {
      requestedAt: row?.requested_at ?? new Date().toISOString(),
      status: row?.status ?? "requested"
    }
  };
}

export async function fetchBlockedProfiles(): Promise<BackendResult<NearbyProfile[]>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("my_blocked_profiles");

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    data: ((data ?? []) as NearbyProfileRow[]).map(toNearbyProfile)
  };
}

export async function fetchReportHistory(): Promise<BackendResult<ReportHistoryItem[]>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data, error } = await supabase.rpc("my_report_history");

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    data: ((data ?? []) as ReportHistoryRow[]).map((row) => ({
      createdAt: row.created_at,
      id: row.report_id,
      reason: row.reason,
      status: row.status,
      targetName: row.target_display_name ?? "알 수 없는 사용자",
      targetUserId: row.target_user_id
    }))
  };
}

export async function blockProfile(blockedId: string): Promise<BackendResult<null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { error } = await supabase.from("blocks").upsert({
    blocker_id: session.data,
    blocked_id: blockedId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: null };
}

export async function unblockProfile(blockedId: string): Promise<BackendResult<null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { error } = await supabase.rpc("unblock_profile", {
    blocked_user_id: blockedId
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: null };
}

export async function reportProfile(
  targetUserId: string,
  reason: string,
  details?: string
): Promise<BackendResult<null>> {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return session;
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: session.data,
    target_user_id: targetUserId,
    reason,
    details: details ?? null
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: null };
}

function toNearbyProfile(row: NearbyProfileRow, index: number): NearbyProfile {
  return {
    id: row.user_id,
    name: row.display_name,
    age: row.age,
    gender: row.gender,
    distanceKm: Math.max(0.1, row.distance_m / 1000),
    neighborhood: "근처",
    intro: "아직 소개를 준비 중이에요.",
    tags: row.interests?.length ? row.interests.slice(0, 3) : ["동네"],
    avatarColor: row.avatar_color ?? fallbackAvatarColor(index),
    lastActiveMinutes: estimateLastActiveMinutes(row.last_seen_at),
    responseRate: 80,
    verified: true
  };
}

function toPeerRow(row: MessageRequestRow): NearbyProfileRow {
  return {
    user_id: row.peer_id,
    display_name: row.display_name,
    age: row.age,
    gender: row.gender,
    distance_m: row.distance_m ?? 0,
    last_seen_at: row.last_seen_at,
    avatar_color: row.avatar_color,
    interests: null
  };
}

function toConversationPeerRow(row: ConversationRow): NearbyProfileRow {
  return {
    user_id: row.peer_id,
    display_name: row.display_name,
    age: row.age,
    gender: row.gender,
    distance_m: row.distance_m ?? 0,
    last_seen_at: row.last_seen_at,
    avatar_color: row.avatar_color,
    interests: null
  };
}

function toChatMessage(row: MessageRow, currentUserId: string): ChatMessage {
  return {
    id: row.message_id ?? row.id ?? `message-${row.created_at}`,
    authorId: row.sender_id === currentUserId ? "me" : row.sender_id,
    body: row.body,
    createdAt: row.created_at
  };
}

function toPreviewMessages(row: ConversationRow, currentUserId: string): ChatMessage[] {
  if (!row.last_message_body || !row.last_message_at || !row.last_message_sender_id) {
    return [];
  }

  return [
    {
      id: `${row.conversation_id}-preview`,
      authorId: row.last_message_sender_id === currentUserId ? "me" : row.last_message_sender_id,
      body: row.last_message_body,
      createdAt: row.last_message_at
    }
  ];
}

function fallbackAvatarColor(index: number) {
  const palette = [colors.teal, colors.coral, colors.lilac, colors.green, colors.yellow];

  return palette[index % palette.length];
}

function estimateLastActiveMinutes(lastSeenAt: string) {
  const diff = Date.now() - new Date(lastSeenAt).getTime();

  if (!Number.isFinite(diff) || diff < 0) {
    return 1;
  }

  return Math.max(1, Math.round(diff / 60000));
}
