import { Platform } from "react-native";

export type UserDataExportPayload = {
  blockedProfiles: Array<{ id: string; name: string; neighborhood: string }>;
  conversations: Array<{
    id: string;
    participantName: string;
    unreadCount: number;
    mutedUntil: string | null;
    messages: Array<{ authorId: string; body: string; createdAt: string; id: string }>;
  }>;
  deletionStatus: string;
  discovery: {
    discoverable: boolean;
    pauseUntil: string | null;
    radiusKm: number;
    selectedInterests: string[];
  };
  favoriteThreadIds: string[];
  profile: {
    age: string;
    gender: string;
    locationLabel: string;
    name: string;
    permissionGranted: boolean;
  };
  rewards: {
    credits: number;
    earnedToday: number;
    extraMessagePasses: number;
  };
  settings: {
    pushStatus: string;
    quietHoursEnabled: boolean;
  };
};

export type UserDataExportResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function exportUserData(payload: UserDataExportPayload): Promise<UserDataExportResult> {
  const exportBody = JSON.stringify(
    {
      app: "DongneOn",
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      ...payload
    },
    null,
    2
  );

  if (Platform.OS === "web") {
    return exportFromWeb(exportBody);
  }

  try {
    const FileSystem = await import("expo-file-system/legacy");
    const Sharing = await import("expo-sharing");
    const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

    if (!baseDirectory) {
      return { ok: false, error: "내보내기 파일을 저장할 위치를 찾지 못했어요." };
    }

    const fileUri = `${baseDirectory}dongneon-data-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(fileUri, exportBody, {
      encoding: FileSystem.EncodingType.UTF8
    });

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, error: "이 기기에서는 공유 시트를 열 수 없어요." };
    }

    await Sharing.shareAsync(fileUri, {
      dialogTitle: "DongneOn 데이터 내보내기",
      mimeType: "application/json",
      UTI: "public.json"
    });

    return { ok: true, message: "데이터 내보내기 공유 창을 열었어요." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "데이터 내보내기 중 문제가 발생했어요."
    };
  }
}

function exportFromWeb(exportBody: string): UserDataExportResult {
  if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof document === "undefined") {
    return { ok: false, error: "현재 환경에서는 브라우저 다운로드를 시작할 수 없어요." };
  }

  const blob = new Blob([exportBody], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `dongneon-data-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return { ok: true, message: "브라우저 다운로드를 시작했어요." };
}
