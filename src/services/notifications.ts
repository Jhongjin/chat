import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type PushRegistrationResult =
  | {
      ok: true;
      platform: "android" | "ios";
      token: string;
    }
  | {
      error: string;
      ok: false;
    };

export async function requestPushRegistration(): Promise<PushRegistrationResult> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    return { ok: false, error: "Push notifications are only available on iOS and Android devices." };
  }

  const currentPermission = await Notifications.getPermissionsAsync();
  const finalPermission =
    currentPermission.status === "granted"
      ? currentPermission
      : await Notifications.requestPermissionsAsync();

  if (finalPermission.status !== "granted") {
    return { ok: false, error: "Notification permission was not granted." };
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync();

    return {
      ok: true,
      platform: Platform.OS,
      token: token.data
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create an Expo push token."
    };
  }
}
