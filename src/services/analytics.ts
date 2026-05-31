import { Platform } from "react-native";
import { supabase } from "../lib/supabase";
import { canUseBackend, ensureAnonymousSession } from "./chatBackend";

type EventProperties = Record<string, boolean | number | string | null | undefined>;

const allowedEvents = new Set([
  "account_deletion_requested",
  "ad_reward_claimed",
  "conversation_muted",
  "conversation_unmuted",
  "data_export_started",
  "discovery_pause_disabled",
  "discovery_pause_enabled",
  "message_hidden",
  "message_reported",
  "message_request_sent",
  "message_sent",
  "onboarding_completed",
  "profile_blocked",
  "profile_reported",
  "push_enabled"
]);

export async function trackEvent(eventName: string, properties: EventProperties = {}) {
  if (!allowedEvents.has(eventName) || !canUseBackend() || !supabase) {
    return;
  }

  const session = await ensureAnonymousSession();

  if (!session.ok) {
    return;
  }

  const cleanProperties = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined)
  );

  await supabase.rpc("track_client_event", {
    event_name: eventName,
    platform: Platform.OS,
    properties: cleanProperties
  });
}
