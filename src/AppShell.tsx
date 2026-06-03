import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MascotMark, type MascotMood } from "./components/MascotMark";
import { initialThreads, nearbyProfiles, rewardPerks } from "./data/mock";
import {
  acceptMessageRequest,
  blockProfile,
  canUseBackend,
  claimAdReward,
  createMessageRequest,
  declineMessageRequest,
  fetchBlockedProfiles,
  fetchConversations,
  fetchMessageRequests,
  fetchNearbyProfiles,
  fetchPreferenceState,
  fetchReportHistory,
  fetchRewardSummary,
  markConversationRead,
  muteConversationUntil,
  pauseDiscoveryUntil,
  prepareAdRewardAttempt,
  registerPushToken,
  reportMessage,
  reportProfile,
  requestAccountDeletion,
  saveDiscoveryPreferences,
  saveProfile,
  saveProfileInterests,
  sendConversationMessage,
  subscribeToConversationMessages,
  unblockProfile,
  updateMyLocation,
  type LocationDraft,
  type MessageRequestItem,
  type ReportHistoryItem
} from "./services/chatBackend";
import { requestNeighborhoodLocation } from "./services/location";
import { requestPushRegistration } from "./services/notifications";
import { exportUserData } from "./services/dataExport";
import { trackEvent } from "./services/analytics";
import { showRewardedAd } from "./services/rewardedAds";
import { colors, radius, shadow, spacing, type } from "./theme";
import type { ChatMessage, ChatThread, Gender, NearbyProfile, RewardPerk } from "./types";
import { clampRadius, formatDistance, sortByDistance } from "./utils/distance";

type TabKey = "discover" | "chats" | "rewards" | "profile";
type IconName = ComponentProps<typeof Ionicons>["name"];
type InterestFilter = (typeof interestFilters)[number];

type LocalMessageRequest = MessageRequestItem;

type OnboardingProfile = {
  name: string;
  age: string;
  gender: Gender;
  locationLabel: string;
  permissionGranted: boolean;
  policyAccepted: boolean;
};

const genderOptions: Array<{ value: Gender; label: string }> = [
  { value: "female", label: "여성" },
  { value: "male", label: "남성" },
  { value: "nonbinary", label: "논바이너리" },
  { value: "private", label: "비공개" }
];

const interestFilters = ["전체", "카페", "산책", "러닝", "맛집", "책"] as const;
const profileInterestOptions = interestFilters.filter((filter) => filter !== "전체");
const baseDailyMessageRequests = 3;
const blockedProfilesStorageKey = "dongneon.blockedProfiles";
const discoveryPreferencesStorageKey = "dongneon.discoveryPreferences";
const favoriteThreadsStorageKey = "dongneon.favoriteThreadIds";
const hiddenMessageIdsStorageKey = "dongneon.hiddenMessageIds";
const onboardingProfileStorageKey = "dongneon.onboardingProfile";
const quietHoursStorageKey = "dongneon.quietHoursEnabled";
const quietHoursLabel = "23:00-08:00";

type MessageSafetyTarget = {
  message: ChatMessage;
  thread: ChatThread;
};

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabKey>("discover");
  const [radiusKm, setRadiusKm] = useState(5);
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(initialThreads[0]?.id);
  const [composerText, setComposerText] = useState("");
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [isOnboardingOpen, setOnboardingOpen] = useState(false);
  const [isOnboarded, setOnboarded] = useState(false);
  const [isLocating, setLocating] = useState(false);
  const [isBackendLoading, setBackendLoading] = useState(false);
  const [isAdLoading, setAdLoading] = useState(false);
  const [rewardCredits, setRewardCredits] = useState(2);
  const [earnedToday, setEarnedToday] = useState(0);
  const [extraMessagePasses, setExtraMessagePasses] = useState(0);
  const [selectedInterest, setSelectedInterest] = useState<InterestFilter>("전체");
  const [selectedInterests, setSelectedInterests] = useState<string[]>(["카페", "산책"]);
  const [isDiscoverable, setDiscoverable] = useState(true);
  const [discoveryPauseUntil, setDiscoveryPauseUntil] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState("알림 준비 전");
  const [deletionStatus, setDeletionStatus] = useState("요청 가능");
  const [pendingRequests, setPendingRequests] = useState<LocalMessageRequest[]>([]);
  const [blockedProfileIds, setBlockedProfileIds] = useState<string[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<NearbyProfile[]>([]);
  const [blockedProfilesLoaded, setBlockedProfilesLoaded] = useState(false);
  const [reportHistory, setReportHistory] = useState<ReportHistoryItem[]>([]);
  const [favoriteThreadIds, setFavoriteThreadIds] = useState<string[]>([]);
  const [favoriteThreadIdsLoaded, setFavoriteThreadIdsLoaded] = useState(false);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>([]);
  const [hiddenMessageIdsLoaded, setHiddenMessageIdsLoaded] = useState(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [quietHoursLoaded, setQuietHoursLoaded] = useState(false);
  const [discoveryPreferencesLoaded, setDiscoveryPreferencesLoaded] = useState(false);
  const [storedProfileLoaded, setStoredProfileLoaded] = useState(false);
  const [messageRequestTarget, setMessageRequestTarget] = useState<NearbyProfile | null>(null);
  const [messageRequestText, setMessageRequestText] = useState("");
  const [isPolicyModalOpen, setPolicyModalOpen] = useState(false);
  const [isSafetySettingsOpen, setSafetySettingsOpen] = useState(false);
  const [safetyThread, setSafetyThread] = useState<ChatThread | null>(null);
  const [messageSafetyTarget, setMessageSafetyTarget] = useState<MessageSafetyTarget | null>(null);
  const [lastLocation, setLastLocation] = useState<LocationDraft | null>(null);
  const [remoteProfiles, setRemoteProfiles] = useState<NearbyProfile[] | null>(null);
  const [backendNotice, setBackendNotice] = useState(
    canUseBackend() ? "서비스 연결 준비됨" : "체험 모드로 둘러보는 중이에요"
  );
  const [profile, setProfile] = useState<OnboardingProfile>({
    name: "",
    age: "",
    gender: "private",
    locationLabel: "위치 확인 전",
    permissionGranted: false,
    policyAccepted: false
  });

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(onboardingProfileStorageKey).then((value) => {
      if (!active) {
        return;
      }

      let shouldOpenOnboarding = true;

      try {
        const parsed = value ? JSON.parse(value) : null;
        const storedProfile = parseStoredOnboardingProfile(parsed);

        if (storedProfile && isCompleteOnboardingProfile(storedProfile)) {
          setProfile(storedProfile);
          setOnboarded(true);
          setOnboardingOpen(false);
          shouldOpenOnboarding = false;
        }
      } catch {
        shouldOpenOnboarding = true;
      } finally {
        if (shouldOpenOnboarding) {
          setOnboardingOpen(true);
        }
        setStoredProfileLoaded(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!storedProfileLoaded || !isOnboarded) {
      return;
    }

    void AsyncStorage.setItem(onboardingProfileStorageKey, JSON.stringify(profile));
  }, [isOnboarded, profile, storedProfileLoaded]);

  const visibleProfiles = useMemo(
    () => {
      if (!isOnboarded || !profile.permissionGranted) {
        return [];
      }

      return sortByDistance(remoteProfiles ?? nearbyProfiles)
        .filter(
          (item) =>
            !isDiscoveryPaused(discoveryPauseUntil) &&
            item.distanceKm <= radiusKm &&
            !blockedProfileIds.includes(item.id) &&
            (selectedInterest === "전체" || item.tags.includes(selectedInterest))
        )
        .sort((left, right) => {
          const scoreGap =
            calculateMatchScore(right, selectedInterests) - calculateMatchScore(left, selectedInterests);

          return scoreGap || left.distanceKm - right.distanceKm;
        });
    },
    [
      blockedProfileIds,
      isOnboarded,
      discoveryPauseUntil,
      profile.permissionGranted,
      radiusKm,
      remoteProfiles,
      selectedInterest,
      selectedInterests
    ]
  );

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0];
  const activeThreadId = selectedThread?.id;
  const orderedThreads = useMemo(() => {
    const originalOrder = new Map(threads.map((thread, index) => [thread.id, index]));

    return [...threads].sort((left, right) => {
      const favoriteGap = Number(favoriteThreadIds.includes(right.id)) - Number(favoriteThreadIds.includes(left.id));

      return favoriteGap || (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0);
    });
  }, [favoriteThreadIds, threads]);
  const draftThreadIds = useMemo(
    () => new Set(Object.entries(messageDrafts).filter(([, text]) => text.trim()).map(([threadId]) => threadId)),
    [messageDrafts]
  );
  const sentRequestCount = pendingRequests.filter((request) => request.direction === "sent").length;
  const totalMessageRequestAllowance = baseDailyMessageRequests + extraMessagePasses;
  const remainingMessageRequests = Math.max(0, totalMessageRequestAllowance - sentRequestCount);

  useEffect(() => {
    setComposerText(activeThreadId ? messageDrafts[activeThreadId] ?? "" : "");
  }, [activeThreadId]);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(discoveryPreferencesStorageKey).then((value) => {
      if (!active) {
        return;
      }

      try {
        const parsed = value ? JSON.parse(value) : null;
        const storedPreferences = parseStoredDiscoveryPreferences(parsed);

        if (storedPreferences) {
          setRadiusKm(storedPreferences.radiusKm);
          setSelectedInterest(storedPreferences.selectedInterest);
          setSelectedInterests(storedPreferences.selectedInterests);
          setDiscoverable(storedPreferences.isDiscoverable);
          setDiscoveryPauseUntil(storedPreferences.discoveryPauseUntil);
        }
      } catch {
        setSelectedInterest("전체");
      } finally {
        setDiscoveryPreferencesLoaded(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!discoveryPreferencesLoaded || !isOnboarded) {
      return;
    }

    void AsyncStorage.setItem(
      discoveryPreferencesStorageKey,
      JSON.stringify({
        discoveryPauseUntil,
        isDiscoverable,
        radiusKm,
        selectedInterest,
        selectedInterests
      })
    );
  }, [
    discoveryPauseUntil,
    discoveryPreferencesLoaded,
    isDiscoverable,
    isOnboarded,
    radiusKm,
    selectedInterest,
    selectedInterests
  ]);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(blockedProfilesStorageKey).then((value) => {
      if (!active) {
        return;
      }

      try {
        const parsed = value ? JSON.parse(value) : [];
        if (Array.isArray(parsed)) {
          const profiles = parsed.filter(isStoredNearbyProfile);
          setBlockedProfiles(profiles);
          setBlockedProfileIds(profiles.map((item) => item.id));
        }
      } catch {
        setBlockedProfiles([]);
        setBlockedProfileIds([]);
      } finally {
        setBlockedProfilesLoaded(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!blockedProfilesLoaded) {
      return;
    }

    void AsyncStorage.setItem(blockedProfilesStorageKey, JSON.stringify(blockedProfiles));
  }, [blockedProfiles, blockedProfilesLoaded]);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(favoriteThreadsStorageKey).then((value) => {
      if (!active) {
        return;
      }

      try {
        const parsed = value ? JSON.parse(value) : [];
        if (Array.isArray(parsed)) {
          setFavoriteThreadIds(parsed.filter((item): item is string => typeof item === "string"));
        }
      } catch {
        setFavoriteThreadIds([]);
      } finally {
        setFavoriteThreadIdsLoaded(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!favoriteThreadIdsLoaded) {
      return;
    }

    void AsyncStorage.setItem(favoriteThreadsStorageKey, JSON.stringify(favoriteThreadIds));
  }, [favoriteThreadIds, favoriteThreadIdsLoaded]);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(hiddenMessageIdsStorageKey).then((value) => {
      if (!active) {
        return;
      }

      try {
        const parsed = value ? JSON.parse(value) : [];
        if (Array.isArray(parsed)) {
          setHiddenMessageIds(parsed.filter((item): item is string => typeof item === "string"));
        }
      } catch {
        setHiddenMessageIds([]);
      } finally {
        setHiddenMessageIdsLoaded(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hiddenMessageIdsLoaded) {
      return;
    }

    void AsyncStorage.setItem(hiddenMessageIdsStorageKey, JSON.stringify(hiddenMessageIds));
  }, [hiddenMessageIds, hiddenMessageIdsLoaded]);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(quietHoursStorageKey).then((value) => {
      if (!active) {
        return;
      }

      if (value === "true" || value === "false") {
        setQuietHoursEnabled(value === "true");
      }

      setQuietHoursLoaded(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!quietHoursLoaded) {
      return;
    }

    void AsyncStorage.setItem(quietHoursStorageKey, String(quietHoursEnabled));
  }, [quietHoursEnabled, quietHoursLoaded]);

  useEffect(() => {
    if (isOnboarded && canUseBackend()) {
      void syncChatState();
      void syncBlockedProfiles();
      void syncReportHistory();
      void syncPreferenceState();
      void syncRewardSummary();
    }
  }, [isOnboarded]);

  useEffect(() => {
    if (!selectedThread?.id || !isUuid(selectedThread.id) || !canUseBackend()) {
      return undefined;
    }

    let cleanup: (() => void) | undefined;
    let active = true;

    void subscribeToConversationMessages(selectedThread.id, (message) => {
      appendMessageToThread(selectedThread.id, message);
    }).then((result) => {
      if (!active) {
        if (result.ok) {
          result.data();
        }
        return;
      }

      if (result.ok) {
        cleanup = result.data;
      } else {
        setBackendNotice(`Supabase 실시간 연결 필요: ${result.error}`);
      }
    });

    void markConversationRead(selectedThread.id);

    return () => {
      active = false;
      cleanup?.();
    };
  }, [selectedThread?.id]);

  async function syncNearbyProfiles(nextRadiusKm = radiusKm) {
    if (!canUseBackend()) {
      return;
    }

    setBackendLoading(true);
    const result = await fetchNearbyProfiles(nextRadiusKm);

    if (result.ok) {
      setRemoteProfiles(result.data);
      setBackendNotice(result.data.length ? "Supabase 근처 친구 동기화 완료" : "Supabase 연결됨 - 아직 근처 친구가 없어요");
    } else {
      setBackendNotice(`Supabase 동기화 필요: ${result.error}`);
    }

    setBackendLoading(false);
  }

  async function syncChatState() {
    if (!canUseBackend()) {
      return;
    }

    setBackendLoading(true);
    const [requests, conversations] = await Promise.all([fetchMessageRequests(), fetchConversations()]);

    if (requests.ok) {
      setPendingRequests(requests.data);
    } else {
      setBackendNotice(`Supabase 요청함 동기화 필요: ${requests.error}`);
    }

    if (conversations.ok) {
      setThreads(conversations.data);
      setSelectedThreadId((current) =>
        conversations.data.some((thread) => thread.id === current) ? current : conversations.data[0]?.id
      );
    } else {
      setBackendNotice(`Supabase 대화 동기화 필요: ${conversations.error}`);
    }

    if (requests.ok && conversations.ok) {
      setBackendNotice("Supabase 대화/요청함 동기화 완료");
    }

    setBackendLoading(false);
  }

  async function syncBlockedProfiles() {
    if (!canUseBackend()) {
      return;
    }

    const blocked = await fetchBlockedProfiles();

    if (!blocked.ok) {
      setBackendNotice(`Supabase 차단 목록 동기화 필요: ${blocked.error}`);
      return;
    }

    setBlockedProfiles(blocked.data);
    setBlockedProfileIds(blocked.data.map((profileItem) => profileItem.id));
  }

  async function syncReportHistory() {
    if (!canUseBackend()) {
      return;
    }

    const reports = await fetchReportHistory();

    if (!reports.ok) {
      setBackendNotice(`Supabase 신고 내역 동기화 필요: ${reports.error}`);
      return;
    }

    setReportHistory(reports.data);
  }

  async function syncPreferenceState() {
    if (!canUseBackend()) {
      return;
    }

    const preferences = await fetchPreferenceState();

    if (!preferences.ok) {
      setBackendNotice(`Supabase 설정 동기화 필요: ${preferences.error}`);
      return;
    }

    setRadiusKm(clampRadius(preferences.data.radiusKm));
    setDiscoverable(preferences.data.visible);
    setDiscoveryPauseUntil(preferences.data.pauseUntil);
    if (preferences.data.interests.length > 0) {
      setSelectedInterests(preferences.data.interests);
    }
  }

  async function syncRewardSummary() {
    if (!canUseBackend()) {
      return;
    }

    const summary = await fetchRewardSummary();

    if (!summary.ok) {
      setBackendNotice(`Supabase 리워드 동기화 필요: ${summary.error}`);
      return;
    }

    setEarnedToday(summary.data.earnedToday);
  }

  async function handleLocate() {
    setLocating(true);
    const location = await requestNeighborhoodLocation();
    const nextLocation = location.permissionGranted
      ? {
          accuracyM: location.accuracyM,
          latitude: location.latitude,
          longitude: location.longitude
        }
      : null;

    setProfile((current) => ({
      ...current,
      locationLabel: location.label,
      permissionGranted: location.permissionGranted
    }));
    setLastLocation(nextLocation);

    if (nextLocation && isOnboarded && canUseBackend()) {
      const updated = await updateMyLocation(nextLocation);

      if (!updated.ok) {
        setBackendNotice(`위치 동기화 필요: ${updated.error}`);
      } else {
        await syncNearbyProfiles();
      }
    }

    setLocating(false);
  }

  function handleChangeTab(tab: TabKey) {
    setActiveTab(tab);

    if (tab === "chats" && isOnboarded && canUseBackend()) {
      void syncChatState();
    }
  }

  async function handleCompleteOnboarding() {
    const ageNumber = Number(profile.age);

    if (!profile.name.trim() || Number.isNaN(ageNumber) || ageNumber < 18) {
      Alert.alert("프로필 확인", "이름과 만 18세 이상의 나이를 입력해 주세요.");
      return;
    }

    if (!profile.policyAccepted) {
      Alert.alert("동의가 필요해요", "만 18세 이상 확인과 서비스 정책 동의가 필요합니다.");
      return;
    }

    if (!profile.permissionGranted) {
      setProfile((current) => ({
        ...current,
        locationLabel: current.locationLabel === "위치 확인 전" ? "동네 선택 전" : current.locationLabel
      }));
      Alert.alert("위치 없이 시작", "위치 권한을 허용하면 5km 이내 추천이 더 정확해집니다.");
    }

    if (canUseBackend()) {
      setBackendLoading(true);
      const saved = await saveProfile({
        age: ageNumber,
        gender: profile.gender,
        name: profile.name
      });

      if (!saved.ok) {
        setBackendNotice(`Supabase 프로필 저장 필요: ${saved.error}`);
      } else {
        const [interestsSaved, preferencesSaved] = await Promise.all([
          saveProfileInterests(selectedInterests),
          saveDiscoveryPreferences({ radiusKm, visible: isDiscoverable })
        ]);

        if (!interestsSaved.ok) {
          setBackendNotice(`Supabase 관심사 저장 필요: ${interestsSaved.error}`);
        } else if (!preferencesSaved.ok) {
          setBackendNotice(`Supabase 노출 설정 저장 필요: ${preferencesSaved.error}`);
        } else if (lastLocation) {
          const updated = await updateMyLocation(lastLocation);

          if (!updated.ok) {
            setBackendNotice(`Supabase 위치 저장 필요: ${updated.error}`);
          } else {
            await syncNearbyProfiles();
          }
        } else {
          setBackendNotice("Supabase 프로필 저장 완료 - 위치 허용 후 추천을 볼 수 있어요");
        }
      }

      setBackendLoading(false);
    }

    setOnboarded(true);
    setOnboardingOpen(false);
    void trackEvent("onboarding_completed", {
      hasLocation: profile.permissionGranted,
      interestCount: selectedInterests.length,
      radiusKm
    });
  }

  function handleCloseOnboarding() {
    if (isOnboarded) {
      setOnboardingOpen(false);
      return;
    }

    Alert.alert("프로필을 먼저 완성해 주세요", "안전한 동네 추천을 위해 최소 프로필과 동의가 필요합니다.");
  }

  function handleChangeRadius(nextRadiusKm: number) {
    const clampedRadius = clampRadius(nextRadiusKm);

    setRadiusKm(clampedRadius);

    if (isOnboarded && canUseBackend()) {
      void saveDiscoveryPreferences({ radiusKm: clampedRadius, visible: isDiscoverable }).then((result) => {
        if (!result.ok) {
          setBackendNotice(`Supabase 반경 저장 필요: ${result.error}`);
        }
      });
    }

    if (profile.permissionGranted) {
      void syncNearbyProfiles(clampedRadius);
    }
  }

  function handleToggleInterest(interest: string) {
    setSelectedInterests((current) => {
      if (current.includes(interest)) {
        return current.filter((item) => item !== interest);
      }

      return [...current, interest].slice(-5);
    });
  }

  async function handleToggleDiscoverable() {
    const nextVisible = !isDiscoverable;
    setDiscoverable(nextVisible);

    if (!canUseBackend()) {
      return;
    }

    const saved = await saveDiscoveryPreferences({ radiusKm, visible: nextVisible });

    if (!saved.ok) {
      setDiscoverable(!nextVisible);
      setBackendNotice(`Supabase 노출 설정 저장 필요: ${saved.error}`);
      Alert.alert("노출 설정 저장 실패", saved.error);
    } else {
      setBackendNotice(nextVisible ? "동네 추천 노출이 켜졌어요" : "동네 추천 노출을 잠시 껐어요");
    }
  }

  async function handleToggleDiscoveryPause() {
    const nextPauseUntil = isDiscoveryPaused(discoveryPauseUntil) ? null : createTomorrowMorningPause();
    setDiscoveryPauseUntil(nextPauseUntil);

    if (!canUseBackend()) {
      return;
    }

    const saved = await pauseDiscoveryUntil(nextPauseUntil);

    if (!saved.ok) {
      setDiscoveryPauseUntil(discoveryPauseUntil);
      setBackendNotice(`Supabase 동네 숨김 저장 필요: ${saved.error}`);
      Alert.alert("동네 숨김 저장 실패", saved.error);
      return;
    }

    setDiscoveryPauseUntil(saved.data);
    setBackendNotice(saved.data ? "내 동네 노출을 내일까지 숨겼어요" : "내 동네 노출 숨김을 해제했어요");
    void trackEvent(saved.data ? "discovery_pause_enabled" : "discovery_pause_disabled", {
      radiusKm
    });
    if (profile.permissionGranted) {
      void syncNearbyProfiles();
    }
  }

  async function handleEnablePush() {
    setPushStatus("알림 권한 확인 중");
    const token = await requestPushRegistration();

    if (!token.ok) {
      setPushStatus("알림 등록 필요");
      Alert.alert("알림 등록 실패", token.error);
      return;
    }

    if (!canUseBackend()) {
      setPushStatus(quietHoursEnabled ? "기기 알림 준비 완료 · 조용한 시간 적용" : "기기 알림 준비 완료");
      return;
    }

    const saved = await registerPushToken({
      platform: token.platform,
      token: token.token
    });

    if (!saved.ok) {
      setPushStatus("알림 토큰 저장 필요");
      Alert.alert("알림 저장 실패", saved.error);
      return;
    }

    setPushStatus(quietHoursEnabled ? "쪽지 알림 준비 완료 · 조용한 시간 적용" : "쪽지 알림 준비 완료");
    void trackEvent("push_enabled", {
      quietHoursEnabled
    });
  }

  function handleToggleQuietHours() {
    setQuietHoursEnabled((current) => !current);
  }

  function handleRequestAccountDeletion() {
    if (deletionStatus === "요청됨") {
      Alert.alert("계정 삭제 요청됨", "이미 삭제 요청이 접수됐어요. 운영 검수 후 보관 정책에 맞춰 처리됩니다.");
      return;
    }

    Alert.alert(
      "계정 삭제 요청",
      "프로필 노출, 위치 추천, 푸시 토큰을 중지하고 삭제 요청 큐에 등록합니다. 대화 기록은 법적 보관 정책에 따라 처리될 수 있어요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제 요청",
          style: "destructive",
          onPress: () => {
            void submitAccountDeletion();
          }
        }
      ]
    );
  }

  async function submitAccountDeletion() {
    if (!canUseBackend()) {
      setDeletionStatus("체험 요청됨");
      Alert.alert("체험 모드", "실제 계정 연동 후 삭제 요청을 저장할 수 있어요.");
      return;
    }

    setBackendLoading(true);
    const requested = await requestAccountDeletion();
    setBackendLoading(false);

    if (!requested.ok) {
      setBackendNotice(`Supabase 삭제 요청 필요: ${requested.error}`);
      Alert.alert("삭제 요청 실패", requested.error);
      return;
    }

    await Promise.all([
      AsyncStorage.removeItem(blockedProfilesStorageKey),
      AsyncStorage.removeItem(discoveryPreferencesStorageKey),
      AsyncStorage.removeItem(favoriteThreadsStorageKey),
      AsyncStorage.removeItem(hiddenMessageIdsStorageKey),
      AsyncStorage.removeItem(onboardingProfileStorageKey)
    ]);

    setDeletionStatus("요청됨");
    setDiscoverable(false);
    setRemoteProfiles([]);
    setBlockedProfiles([]);
    setBlockedProfileIds([]);
    setReportHistory([]);
    setPendingRequests([]);
    setThreads([]);
    setFavoriteThreadIds([]);
    setSelectedThreadId(undefined);
    setComposerText("");
    setMessageDrafts({});
    setOnboarded(false);
    setOnboardingOpen(false);
    setProfile((current) => ({
      ...current,
      locationLabel: "계정 삭제 요청됨",
      permissionGranted: false
    }));
    setBackendNotice("계정 삭제 요청이 Supabase에 접수됐어요");
    setActiveTab("profile");
    void trackEvent("account_deletion_requested");
    Alert.alert("삭제 요청 접수", "프로필 노출과 위치 추천을 중지했어요. 운영 보관 정책에 따라 삭제가 처리됩니다.");
  }

  function clearThreadDraft(threadId: string) {
    setMessageDrafts((current) => {
      if (!(threadId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[threadId];
      return next;
    });
  }

  function handleSelectThread(threadId: string) {
    setSelectedThreadId(threadId);
    setComposerText(messageDrafts[threadId] ?? "");
  }

  function handleChangeComposerText(value: string) {
    setComposerText(value);

    if (!activeThreadId) {
      return;
    }

    setMessageDrafts((current) => {
      if (!value) {
        if (!(activeThreadId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[activeThreadId];
        return next;
      }

      if (current[activeThreadId] === value) {
        return current;
      }

      return {
        ...current,
        [activeThreadId]: value
      };
    });
  }

  async function handleSendMessage(thread: ChatThread) {
    const text = composerText.trim();

    if (!text) {
      return;
    }

    if (containsSensitiveContact(text)) {
      Alert.alert("연락처 공유 제한", "전화번호, 주소, 외부 메신저 ID는 초기 안전 정책상 조금 더 신뢰가 쌓인 뒤 허용할 예정입니다.");
      return;
    }

    if (canUseBackend() && isUuid(thread.id)) {
      setBackendLoading(true);
      const sent = await sendConversationMessage(thread.id, text);
      setBackendLoading(false);

      if (!sent.ok) {
        setBackendNotice(`Supabase 메시지 전송 필요: ${sent.error}`);
        Alert.alert("메시지 전송 실패", sent.error);
        return;
      }

      appendMessageToThread(thread.id, sent.data);
      setBackendNotice("Supabase 메시지 전송 완료");
      clearThreadDraft(thread.id);
      setComposerText("");
      void trackEvent("message_sent", {
        bodyLength: text.length
      });
      return;
    }

    appendMessageToThread(thread.id, {
      id: `message-${Date.now()}`,
      authorId: "me",
      body: text,
      createdAt: new Date().toISOString()
    });
    clearThreadDraft(thread.id);
    setComposerText("");
    void trackEvent("message_sent", {
      bodyLength: text.length
    });
  }

  function appendMessageToThread(threadId: string, message: ChatMessage) {
    setThreads((current) =>
      current.map((item) => {
        if (item.id !== threadId || item.messages.some((existing) => existing.id === message.id)) {
          return item;
        }

        return {
          ...item,
          messages: [...item.messages, message],
          unreadCount: selectedThreadId === threadId || message.authorId === "me" ? item.unreadCount : item.unreadCount + 1
        };
      })
    );
  }

  function handleLoadDemoThreads() {
    setThreads(initialThreads);
    setSelectedThreadId(initialThreads[0]?.id);
    setComposerText("");
    setMessageDrafts({});
    setHiddenMessageIds([]);
    setBackendNotice("체험용 대화를 불러왔어요");
    setActiveTab("chats");
  }

  function handleStartMessage(target: NearbyProfile) {
    const existingThread = threads.find((thread) => thread.participant.id === target.id);

    if (existingThread) {
      handleSelectThread(existingThread.id);
      setActiveTab("chats");
      return;
    }

    const pendingRequest = pendingRequests.find((request) => request.peer.id === target.id);

    if (pendingRequest) {
      Alert.alert("요청 대기 중", "상대가 수락하면 채팅방이 열립니다.");
      setActiveTab("chats");
      return;
    }

    setMessageRequestTarget(target);
    setMessageRequestText("안녕하세요. 근처 관심사가 비슷해서 쪽지드려요.");
  }

  async function handleSendMessageRequest() {
    const target = messageRequestTarget;
    const text = messageRequestText.trim();

    if (!target) {
      return;
    }

    if (text.length < 8) {
      Alert.alert("쪽지를 조금 더 적어주세요", "상대가 안심하고 수락할 수 있도록 한 문장 이상 작성해 주세요.");
      return;
    }

    if (containsSensitiveContact(text)) {
      Alert.alert("첫 쪽지는 앱 안에서만", "전화번호, 주소, 외부 메신저 ID가 포함된 첫 쪽지는 보낼 수 없어요.");
      return;
    }

    if (sentRequestCount >= baseDailyMessageRequests + extraMessagePasses) {
      Alert.alert("오늘의 첫 쪽지를 모두 사용했어요", "리워드 탭에서 추가 쪽지권을 받을 수 있습니다.");
      setActiveTab("rewards");
      setMessageRequestTarget(null);
      return;
    }

    if (sentRequestCount >= baseDailyMessageRequests && extraMessagePasses > 0) {
      setExtraMessagePasses((current) => Math.max(0, current - 1));
    }

    let requestId = `request-${Date.now()}`;

    if (canUseBackend() && isUuid(target.id)) {
      setBackendLoading(true);
      const created = await createMessageRequest(target.id, text);
      setBackendLoading(false);

      if (!created.ok) {
        setBackendNotice(`Supabase 쪽지 요청 필요: ${created.error}`);
        Alert.alert("쪽지 요청 실패", created.error);
        return;
      }

      requestId = created.data;
      setBackendNotice("Supabase 쪽지 요청 저장 완료");
    }

    setPendingRequests((current) => [
      {
        id: requestId,
        peer: target,
        body: text.slice(0, 160),
        createdAt: new Date().toISOString(),
        direction: "sent",
        status: "pending"
      },
      ...current
    ]);
    setMessageRequestTarget(null);
    setMessageRequestText("");
    setActiveTab("chats");
    void trackEvent("message_request_sent", {
      bodyLength: text.length
    });
    Alert.alert("쪽지 요청을 보냈어요", "상대가 수락하면 대화가 열립니다.");
  }

  async function handleAcceptRequest(request: LocalMessageRequest) {
    if (request.direction !== "received") {
      return;
    }

    if (canUseBackend() && isUuid(request.id)) {
      setBackendLoading(true);
      const accepted = await acceptMessageRequest(request.id);
      setBackendLoading(false);

      if (!accepted.ok) {
        setBackendNotice(`Supabase 요청 수락 필요: ${accepted.error}`);
        Alert.alert("요청 수락 실패", accepted.error);
        return;
      }

      setBackendNotice("Supabase 대화방 생성 완료");
      await syncChatState();
      handleSelectThread(accepted.data);
      setActiveTab("chats");
      return;
    }

    const threadId = `thread-${Date.now()}`;
    setThreads((current) => [
      {
        id: threadId,
        participant: request.peer,
        unreadCount: 0,
        messages: [
          {
            id: `message-${Date.now()}`,
            authorId: request.peer.id,
            body: request.body,
            createdAt: request.createdAt
          }
        ]
      },
      ...current
    ]);
    setPendingRequests((current) => current.filter((item) => item.id !== request.id));
    setSelectedThreadId(threadId);
    setComposerText("");
  }

  async function handleDeclineRequest(request: LocalMessageRequest) {
    if (request.direction !== "received") {
      return;
    }

    if (canUseBackend() && isUuid(request.id)) {
      setBackendLoading(true);
      const declined = await declineMessageRequest(request.id);
      setBackendLoading(false);

      if (!declined.ok) {
        setBackendNotice(`Supabase 요청 거절 필요: ${declined.error}`);
        Alert.alert("요청 거절 실패", declined.error);
        return;
      }
    }

    setPendingRequests((current) => current.filter((item) => item.id !== request.id));
    setBackendNotice("쪽지 요청을 정리했어요");
  }

  function handleHideThread(threadId: string) {
    setThreads((current) => current.filter((thread) => thread.id !== threadId));
    setFavoriteThreadIds((current) => current.filter((id) => id !== threadId));
    clearThreadDraft(threadId);
    setComposerText("");
    setSelectedThreadId(undefined);
    setSafetyThread(null);
  }

  async function handleBlockThread(thread: ChatThread) {
    if (canUseBackend() && isUuid(thread.participant.id)) {
      setBackendLoading(true);
      const blocked = await blockProfile(thread.participant.id);
      setBackendLoading(false);

      if (!blocked.ok) {
        setBackendNotice(`Supabase 차단 저장 필요: ${blocked.error}`);
        Alert.alert("차단 저장 실패", blocked.error);
        return;
      }
    }

    setBlockedProfileIds((current) => [...new Set([...current, thread.participant.id])]);
    setBlockedProfiles((current) => {
      if (current.some((profileItem) => profileItem.id === thread.participant.id)) {
        return current;
      }

      return [thread.participant, ...current];
    });
    setThreads((current) => current.filter((item) => item.id !== thread.id));
    setFavoriteThreadIds((current) => current.filter((id) => id !== thread.id));
    setPendingRequests((current) => current.filter((request) => request.peer.id !== thread.participant.id));
    clearThreadDraft(thread.id);
    setComposerText("");
    setSelectedThreadId(undefined);
    setSafetyThread(null);
    void trackEvent("profile_blocked");
    Alert.alert("차단했어요", "상대는 더 이상 추천과 쪽지 목록에 표시되지 않습니다.");
  }

  async function handleReportThread(reason: string) {
    if (safetyThread && canUseBackend() && isUuid(safetyThread.participant.id)) {
      setBackendLoading(true);
      const reported = await reportProfile(safetyThread.participant.id, reason);
      setBackendLoading(false);

      if (!reported.ok) {
        setBackendNotice(`Supabase 신고 저장 필요: ${reported.error}`);
        Alert.alert("신고 저장 실패", reported.error);
        return;
      }

      await syncReportHistory();
    } else if (safetyThread) {
      setReportHistory((current) => [
        {
          createdAt: new Date().toISOString(),
          id: `local-report-${Date.now()}`,
          reason,
          status: "open",
          targetName: safetyThread.participant.name,
          targetUserId: safetyThread.participant.id
        },
        ...current
      ]);
    }

    setSafetyThread(null);
    void trackEvent("profile_reported", {
      reason
    });
    Alert.alert("신고가 접수됐어요", `${reason} 사유로 운영 검토 큐에 등록됩니다.`);
  }

  function handleHideMessage(threadId: string, messageId: string) {
    setHiddenMessageIds((current) => (current.includes(messageId) ? current : [messageId, ...current]));
    setMessageSafetyTarget(null);
    void trackEvent("message_hidden", {
      threadId
    });
    Alert.alert("메시지를 숨겼어요", "내 화면에서만 숨겨지며, 신고 없이 상대에게 알림이 가지 않습니다.");
  }

  async function handleReportMessage(reason: string) {
    const target = messageSafetyTarget;

    if (!target) {
      return;
    }

    if (canUseBackend() && isUuid(target.message.id)) {
      setBackendLoading(true);
      const reported = await reportMessage(target.message.id, reason, target.message.body);
      setBackendLoading(false);

      if (!reported.ok) {
        setBackendNotice(`Supabase 메시지 신고 저장 필요: ${reported.error}`);
        Alert.alert("메시지 신고 실패", reported.error);
        return;
      }

      await syncReportHistory();
    } else {
      setReportHistory((current) => [
        {
          createdAt: new Date().toISOString(),
          id: `local-message-report-${Date.now()}`,
          reason: `메시지: ${reason}`,
          status: "open",
          targetName: target.thread.participant.name,
          targetUserId: target.thread.participant.id
        },
        ...current
      ]);
    }

    setHiddenMessageIds((current) =>
      current.includes(target.message.id) ? current : [target.message.id, ...current]
    );
    setMessageSafetyTarget(null);
    void trackEvent("message_reported", {
      reason
    });
    Alert.alert("메시지 신고가 접수됐어요", "해당 메시지는 내 화면에서 숨기고 운영 검토 큐에 등록했습니다.");
  }

  function handleToggleFavoriteThread(threadId: string) {
    setFavoriteThreadIds((current) =>
      current.includes(threadId) ? current.filter((id) => id !== threadId) : [threadId, ...current]
    );
  }

  async function handleToggleThreadMute(thread: ChatThread) {
    const nextMutedUntil = isThreadMuted(thread.mutedUntil) ? null : createTomorrowMorningPause();

    if (canUseBackend() && isUuid(thread.id)) {
      setBackendLoading(true);
      const muted = await muteConversationUntil(thread.id, nextMutedUntil);
      setBackendLoading(false);

      if (!muted.ok) {
        setBackendNotice(`Supabase 대화 알림 설정 필요: ${muted.error}`);
        Alert.alert("대화 알림 설정 실패", muted.error);
        return;
      }

      updateThreadMute(thread.id, muted.data);
      setBackendNotice(muted.data ? "이 대화 알림을 내일까지 껐어요" : "이 대화 알림을 다시 켰어요");
      void trackEvent(muted.data ? "conversation_muted" : "conversation_unmuted");
    } else {
      updateThreadMute(thread.id, nextMutedUntil);
      void trackEvent(nextMutedUntil ? "conversation_muted" : "conversation_unmuted");
    }

    Alert.alert(
      nextMutedUntil ? "대화 알림 끄기" : "대화 알림 켜기",
      nextMutedUntil ? "이 대화의 새 메시지 알림을 내일 오전까지 쉬게 했어요." : "이 대화의 새 메시지 알림을 다시 받을 수 있어요."
    );
  }

  function updateThreadMute(threadId: string, mutedUntil: string | null) {
    setThreads((current) =>
      current.map((item) => (item.id === threadId ? { ...item, mutedUntil } : item))
    );
  }

  async function handleUnblockProfile(profileId: string) {
    if (canUseBackend() && isUuid(profileId)) {
      setBackendLoading(true);
      const unblocked = await unblockProfile(profileId);
      setBackendLoading(false);

      if (!unblocked.ok) {
        setBackendNotice(`Supabase 차단 해제 필요: ${unblocked.error}`);
        Alert.alert("차단 해제 실패", unblocked.error);
        return;
      }

      setBackendNotice("Supabase 차단 해제 완료");
    }

    setBlockedProfileIds((current) => current.filter((id) => id !== profileId));
    setBlockedProfiles((current) => current.filter((profileItem) => profileItem.id !== profileId));
    if (profile.permissionGranted) {
      void syncNearbyProfiles();
    }
    Alert.alert("차단 해제", "다시 동네 추천 목록에 표시될 수 있어요.");
  }

  async function handleExportData() {
    void trackEvent("data_export_started", {
      conversationCount: threads.length,
      reportCount: reportHistory.length
    });

    const exported = await exportUserData({
      blockedProfiles: blockedProfiles.map((profileItem) => ({
        id: profileItem.id,
        name: profileItem.name,
        neighborhood: profileItem.neighborhood
      })),
      conversations: threads.map((thread) => ({
        id: thread.id,
        messages: thread.messages,
        mutedUntil: thread.mutedUntil ?? null,
        participantName: thread.participant.name,
        unreadCount: thread.unreadCount
      })),
      hiddenMessageIds,
      reports: reportHistory,
      deletionStatus,
      discovery: {
        discoverable: isDiscoverable,
        pauseUntil: discoveryPauseUntil,
        radiusKm,
        selectedInterests
      },
      favoriteThreadIds,
      profile: {
        age: profile.age,
        gender: profile.gender,
        locationLabel: profile.locationLabel,
        name: profile.name,
        permissionGranted: profile.permissionGranted
      },
      rewards: {
        credits: rewardCredits,
        earnedToday,
        extraMessagePasses
      },
      settings: {
        pushStatus,
        quietHoursEnabled
      }
    });

    Alert.alert(exported.ok ? "데이터 내보내기" : "내보내기 실패", exported.ok ? exported.message : exported.error);
  }

  function handleReward(perk: RewardPerk) {
    if (rewardCredits < perk.cost) {
      Alert.alert("광고 시청 필요", "리워드 광고를 보고 크레딧을 충전할 수 있습니다.");
      return;
    }

    setRewardCredits((current) => current - perk.cost);
    if (perk.id === "perk-01") {
      setExtraMessagePasses((current) => current + 1);
    }
    Alert.alert("혜택 적용", `${perk.title} 혜택이 적용되었습니다.`);
  }

  async function handleEarnCredit() {
    if (earnedToday >= 3) {
      Alert.alert("오늘은 충분해요", "리워드 광고 보상은 하루 3회까지만 받을 수 있습니다.");
      return;
    }

    setAdLoading(true);

    const rewardAttempt = canUseBackend() ? await prepareAdRewardAttempt() : null;
    const preparedRewardAttempt = rewardAttempt?.ok ? rewardAttempt.data : null;
    const ad = await showRewardedAd(
      preparedRewardAttempt
        ? {
            customData: preparedRewardAttempt.attemptId,
            userId: preparedRewardAttempt.userId
          }
        : undefined
    );

    if (!ad.ok) {
      setAdLoading(false);
      Alert.alert("광고 확인 실패", ad.error);
      return;
    }

    try {
      let grantedRewardAmount = 1;

      if (canUseBackend()) {
        const reward = await claimAdReward(preparedRewardAttempt?.attemptId);

        if (!reward.ok) {
          setAdLoading(false);
          setBackendNotice(`Supabase 리워드 기록 필요: ${reward.error}`);
          Alert.alert("보상 지급 실패", reward.error);
          return;
        }

        grantedRewardAmount = reward.data.grantedAmount ?? 1;
        setRewardCredits((current) => current + grantedRewardAmount);
        setEarnedToday(reward.data.earnedToday);
        setBackendNotice(grantedRewardAmount > 0 ? "Supabase 리워드 기록 완료" : "이미 확인된 리워드 기록");
      } else {
        grantedRewardAmount = Math.max(1, ad.reward.amount || 1);
        setRewardCredits((current) => current + grantedRewardAmount);
        setEarnedToday((current) => current + 1);
      }

      setAdLoading(false);
      void trackEvent("ad_reward_claimed", {
        source: ad.source,
        verificationPrepared: Boolean(preparedRewardAttempt)
      });
      const rewardAlertMessage =
        grantedRewardAmount <= 0
          ? "이미 서버에서 확인된 리워드라 추가 크레딧은 지급하지 않았어요."
          : ad.source === "admob"
          ? "광고 시청이 확인되어 1 크레딧을 지급했어요."
          : "개발 프리뷰 보상으로 1 크레딧을 지급했어요.";

      Alert.alert(
        grantedRewardAmount > 0 ? "보상 지급" : "보상 확인",
        rewardAlertMessage
      );
    } catch (error) {
      setAdLoading(false);
      Alert.alert("보상 지급 실패", error instanceof Error ? error.message : "보상 지급 중 문제가 발생했어요.");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.appRoot}
      >
        <View style={styles.header}>
          <View style={styles.brandLockup}>
            <MascotMark mood="chat" size="sm" />
            <View>
              <Text style={styles.kicker}>DongneOn</Text>
              <Text style={styles.headerTitle}>가까운 사람과 안전하게</Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="내 프로필 열기"
            accessibilityRole="button"
            onPress={() => setOnboardingOpen(true)}
            style={styles.iconButton}
          >
            <Ionicons color={colors.ink} name="person-circle-outline" size={25} />
          </Pressable>
        </View>

        {activeTab === "discover" ? (
          <DiscoverScreen
            isDiscoveryPaused={isDiscoveryPaused(discoveryPauseUntil)}
            isOnboarded={isOnboarded}
            locationLabel={profile.locationLabel}
            locationPermissionGranted={profile.permissionGranted}
            selectedInterest={selectedInterest}
            selectedInterests={selectedInterests}
            profiles={visibleProfiles}
            radiusKm={radiusKm}
            remainingMessageRequests={remainingMessageRequests}
            totalMessageRequestAllowance={totalMessageRequestAllowance}
            backendNotice={backendNotice}
            isBackendLoading={isBackendLoading}
            onChangeRadius={handleChangeRadius}
            onChangeInterest={setSelectedInterest}
            onOpenOnboarding={() => setOnboardingOpen(true)}
            onOpenProfile={() => setActiveTab("profile")}
            onStartMessage={handleStartMessage}
            onRefreshLocation={handleLocate}
            isLocating={isLocating}
          />
        ) : null}

        {activeTab === "chats" ? (
          <ChatsScreen
            backendNotice={backendNotice}
            composerText={composerText}
            draftThreadIds={draftThreadIds}
            favoriteThreadIds={favoriteThreadIds}
            hiddenMessageIds={hiddenMessageIds}
            isBackendLoading={isBackendLoading}
            onChangeComposerText={handleChangeComposerText}
            onAcceptRequest={handleAcceptRequest}
            onDeclineRequest={handleDeclineRequest}
            onLoadDemoThreads={handleLoadDemoThreads}
            onOpenMessageSafety={(thread, message) => setMessageSafetyTarget({ message, thread })}
            onSelectThread={handleSelectThread}
            onSendMessage={handleSendMessage}
            onOpenSafety={setSafetyThread}
            onOpenOnboarding={() => setOnboardingOpen(true)}
            onRefreshChats={syncChatState}
            onToggleThreadMute={handleToggleThreadMute}
            onToggleFavoriteThread={handleToggleFavoriteThread}
            selectedThread={selectedThread}
            threads={orderedThreads}
            pendingRequests={pendingRequests}
          />
        ) : null}

        {activeTab === "rewards" ? (
          <RewardsScreen
            credits={rewardCredits}
            earnedToday={earnedToday}
            extraMessagePasses={extraMessagePasses}
            isAdLoading={isAdLoading}
            onEarnCredit={handleEarnCredit}
            onUseReward={handleReward}
          />
        ) : null}

        {activeTab === "profile" ? (
          <ProfileScreen
            blockedProfileCount={blockedProfiles.length}
            deletionStatus={deletionStatus}
            favoriteThreadCount={favoriteThreadIds.filter((id) => threads.some((thread) => thread.id === id)).length}
            isDiscoverable={isDiscoverable}
            onEnablePush={handleEnablePush}
            onExportData={handleExportData}
            onOpenChats={() => setActiveTab("chats")}
            onOpenPolicy={() => setPolicyModalOpen(true)}
            onRequestAccountDeletion={handleRequestAccountDeletion}
            onOpenSafetySettings={() => setSafetySettingsOpen(true)}
            profile={profile}
            pushStatus={pushStatus}
            discoveryPauseUntil={discoveryPauseUntil}
            quietHoursEnabled={quietHoursEnabled}
            radiusKm={radiusKm}
            selectedInterests={selectedInterests}
            onToggleDiscoverable={handleToggleDiscoverable}
            onToggleDiscoveryPause={handleToggleDiscoveryPause}
            onToggleQuietHours={handleToggleQuietHours}
            onOpenOnboarding={() => setOnboardingOpen(true)}
          />
        ) : null}

        <BottomTabs activeTab={activeTab} onChangeTab={handleChangeTab} unreadCount={totalUnread(threads)} />

        <OnboardingModal
          canClose={isOnboarded}
          isLocating={isLocating}
          isOpen={isOnboardingOpen}
          onClose={handleCloseOnboarding}
          onComplete={handleCompleteOnboarding}
          onToggleInterest={handleToggleInterest}
          onOpenPolicy={() => setPolicyModalOpen(true)}
          onLocate={handleLocate}
          profile={profile}
          selectedInterests={selectedInterests}
          setProfile={setProfile}
        />

        <MessageRequestModal
          onChangeText={setMessageRequestText}
          onClose={() => setMessageRequestTarget(null)}
          onSend={handleSendMessageRequest}
          target={messageRequestTarget}
          text={messageRequestText}
        />

        <SafetyActionModal
          onBlock={handleBlockThread}
          onClose={() => setSafetyThread(null)}
          onHide={handleHideThread}
          onReport={handleReportThread}
          thread={safetyThread}
        />

        <MessageSafetyModal
          onClose={() => setMessageSafetyTarget(null)}
          onHide={handleHideMessage}
          onReport={handleReportMessage}
          target={messageSafetyTarget}
        />

        <PolicyNoticeModal isOpen={isPolicyModalOpen} onClose={() => setPolicyModalOpen(false)} />

        <SafetySettingsModal
          blockedProfiles={blockedProfiles}
          isOpen={isSafetySettingsOpen}
          onClose={() => setSafetySettingsOpen(false)}
          reportHistory={reportHistory}
          onUnblock={handleUnblockProfile}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DiscoverScreen({
  isDiscoveryPaused,
  isLocating,
  isOnboarded,
  isBackendLoading,
  backendNotice,
  locationLabel,
  locationPermissionGranted,
  selectedInterest,
  selectedInterests,
  onChangeInterest,
  onChangeRadius,
  onOpenOnboarding,
  onOpenProfile,
  onRefreshLocation,
  onStartMessage,
  profiles,
  radiusKm,
  remainingMessageRequests,
  totalMessageRequestAllowance
}: {
  isDiscoveryPaused: boolean;
  isLocating: boolean;
  isOnboarded: boolean;
  isBackendLoading: boolean;
  backendNotice: string;
  locationLabel: string;
  locationPermissionGranted: boolean;
  selectedInterest: InterestFilter;
  selectedInterests: string[];
  onChangeInterest: (filter: InterestFilter) => void;
  onChangeRadius: (radiusKm: number) => void;
  onOpenOnboarding: () => void;
  onOpenProfile: () => void;
  onRefreshLocation: () => void;
  onStartMessage: (profile: NearbyProfile) => void;
  profiles: NearbyProfile[];
  radiusKm: number;
  remainingMessageRequests: number;
  totalMessageRequestAllowance: number;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.locationBand}>
        <View style={styles.locationIcon}>
          <Ionicons color={colors.teal} name="location" size={22} />
        </View>
        <View style={styles.fill}>
          <Text style={styles.sectionEyebrow}>내 동네</Text>
          <Text style={styles.locationTitle}>{locationLabel}</Text>
        </View>
        <Pressable
          accessibilityLabel="위치 새로고침"
          accessibilityRole="button"
          onPress={onRefreshLocation}
          style={styles.smallIconButton}
        >
          {isLocating ? (
            <ActivityIndicator color={colors.teal} size="small" />
          ) : (
            <Ionicons color={colors.teal} name="refresh" size={19} />
          )}
        </Pressable>
      </View>

      <View style={styles.backendBand}>
        <Ionicons color={canUseBackend() ? colors.teal : colors.mutedInk} name="shield-checkmark" size={18} />
        <Text style={styles.backendText}>{isBackendLoading ? "새 내용을 확인하는 중..." : formatServiceNotice(backendNotice)}</Text>
      </View>

      <View style={styles.radiusPanel}>
        <View>
          <Text style={styles.panelTitle}>반경 {radiusKm}km</Text>
          <Text style={styles.panelCaption}>정확한 위치는 서로에게 보이지 않아요.</Text>
        </View>
        <View style={styles.radiusStepper}>
          <Pressable
            accessibilityLabel="반경 줄이기"
            accessibilityRole="button"
            onPress={() => onChangeRadius(radiusKm - 1)}
            style={styles.stepButton}
          >
            <Ionicons color={colors.ink} name="remove" size={18} />
          </Pressable>
          <Text style={styles.radiusValue}>{radiusKm}</Text>
          <Pressable
            accessibilityLabel="반경 늘리기"
            accessibilityRole="button"
            onPress={() => onChangeRadius(radiusKm + 1)}
            style={styles.stepButton}
          >
            <Ionicons color={colors.ink} name="add" size={18} />
          </Pressable>
        </View>
      </View>

      <View style={styles.filterRow}>
        {interestFilters.map((filter) => {
          const active = selectedInterest === filter;

          return (
            <Pressable
              accessibilityLabel={`${filter} 관심사 필터`}
              accessibilityRole="button"
              key={filter}
              onPress={() => onChangeInterest(filter)}
              style={[styles.filterChip, active ? styles.filterChipActive : undefined]}
            >
              <Text style={[styles.filterText, active ? styles.filterTextActive : undefined]}>{filter}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.recommendationBand}>
        <View style={styles.recommendationMetric}>
          <Ionicons color={colors.teal} name="chatbubble-ellipses" size={19} />
          <View style={styles.fill}>
            <Text style={styles.panelTitle}>오늘 첫 쪽지 {remainingMessageRequests}회 남음</Text>
            <Text style={styles.panelCaption}>기본 {baseDailyMessageRequests}회 + 리워드 보상까지 반영해요.</Text>
          </View>
          <Text style={styles.metricPill}>
            {remainingMessageRequests}/{totalMessageRequestAllowance}
          </Text>
        </View>
        <View style={styles.recommendationMetric}>
          <Ionicons color={colors.lilac} name="sparkles" size={19} />
          <View style={styles.fill}>
            <Text style={styles.panelTitle}>추천 기준</Text>
            <Text style={styles.panelCaption}>공통 관심사, 가까운 거리, 최근 활동을 조용히 참고해요.</Text>
          </View>
        </View>
      </View>

      <SectionHeader title="가까운 친구" value={`${profiles.length}명`} />

      {!isOnboarded ? (
        <EmptyState
          actionLabel="프로필 완성하기"
          icon="lock-closed"
          mascotMood="safe"
          onAction={onOpenOnboarding}
          title="안전 프로필을 먼저 확인해요"
          body="만 18세 이상 확인과 기본 동의가 끝나면 가까운 친구를 볼 수 있어요."
        />
      ) : !locationPermissionGranted ? (
        <EmptyState
          actionLabel="위치 허용하기"
          icon="location"
          mascotMood="location"
          onAction={onRefreshLocation}
          title="아직 동네를 확인하지 않았어요"
          body="정확한 주소는 보이지 않고, 5km 이내 추천에만 사용해요."
        />
      ) : isDiscoveryPaused ? (
        <EmptyState
          actionLabel="내 정보에서 해제"
          icon="pause-circle"
          mascotMood="empty"
          onAction={onOpenProfile}
          title="내 동네 노출을 잠시 숨겼어요"
          body="숨김 시간이 끝나거나 내 정보에서 해제하면 다시 가까운 친구 추천에 참여합니다."
        />
      ) : profiles.length === 0 ? (
        <EmptyState
          actionLabel="위치 다시 확인"
          icon="search"
          mascotMood="empty"
          onAction={onRefreshLocation}
          title="아직 5km 안에 표시할 친구가 없어요"
          body="처음에는 지역 밀도를 천천히 채워가요. 위치를 다시 확인하거나 잠시 후 확인해 주세요."
        />
      ) : (
        <View style={styles.profileList}>
          {profiles.map((profile) => (
            <NeighborRow
              key={profile.id}
              onMessage={onStartMessage}
              profile={profile}
              selectedInterests={selectedInterests}
            />
          ))}
        </View>
      )}

      <View style={styles.safetyBand}>
        <MascotMark mood="safe" size="xs" />
        <View style={styles.fill}>
          <Text style={styles.panelTitle}>먼저 안전하게 시작해요</Text>
          <Text style={styles.panelCaption}>
            첫 쪽지는 신고/차단이 가능한 요청으로 보내고, 수락 후 대화가 열립니다.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function NeighborRow({
  onMessage,
  profile,
  selectedInterests
}: {
  onMessage: (profile: NearbyProfile) => void;
  profile: NearbyProfile;
  selectedInterests: string[];
}) {
  const sharedInterestCount = profile.tags.filter((tag) => selectedInterests.includes(tag)).length;
  const insight = getRecommendationInsight(profile, selectedInterests);
  const visibleTags = profile.tags.slice(0, 3);
  const hiddenTagCount = Math.max(0, profile.tags.length - visibleTags.length);

  return (
    <View style={styles.neighborRow}>
      <Avatar color={profile.avatarColor} label={profile.name} />
      <View style={styles.neighborBody}>
        <View style={styles.neighborTopLine}>
          <Text style={styles.neighborName}>
            {profile.name}, {profile.age}
          </Text>
          {profile.verified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons color={colors.teal} name="checkmark-circle" size={14} />
              <Text style={styles.verifiedText}>확인됨</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.neighborMeta}>
          {profile.neighborhood} · {formatDistance(profile.distanceKm)} · {formatLastActive(profile.lastActiveMinutes)}
        </Text>
        <View style={styles.neighborSignalRow}>
          <View style={styles.neighborSignalPill}>
            <Ionicons color={colors.teal} name="albums-outline" size={13} />
            <Text style={styles.neighborSignalText}>
              {sharedInterestCount > 0 ? `공통 관심사 ${sharedInterestCount}개` : profile.tags[0]}
            </Text>
          </View>
          <View style={styles.neighborSignalPill}>
            <Ionicons color={colors.lilac} name="flash-outline" size={13} />
            <Text style={styles.neighborSignalText}>{formatResponseStyle(profile.responseRate)}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.recommendReason}>
          {insight}
        </Text>
        <Text numberOfLines={1} style={styles.neighborIntro}>
          {profile.intro}
        </Text>
        <View style={styles.neighborActionRow}>
          <View style={styles.neighborTagSummary}>
            {visibleTags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
            {hiddenTagCount ? (
              <View style={styles.tagMuted}>
                <Text style={styles.tagMutedText}>+{hiddenTagCount}</Text>
              </View>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={`${profile.name}님에게 첫 쪽지 요청 보내기`}
            accessibilityRole="button"
            onPress={() => onMessage(profile)}
            style={({ pressed }) => [styles.neighborMessageButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.white} name="chatbubble-ellipses" size={16} />
            <Text style={styles.neighborMessageText}>첫 쪽지</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ChatsScreen({
  backendNotice,
  composerText,
  draftThreadIds,
  favoriteThreadIds,
  hiddenMessageIds,
  isBackendLoading,
  onAcceptRequest,
  onChangeComposerText,
  onDeclineRequest,
  onLoadDemoThreads,
  onOpenMessageSafety,
  onOpenOnboarding,
  onOpenSafety,
  onRefreshChats,
  onSelectThread,
  onSendMessage,
  onToggleFavoriteThread,
  onToggleThreadMute,
  pendingRequests,
  selectedThread,
  threads
}: {
  backendNotice: string;
  composerText: string;
  draftThreadIds: Set<string>;
  favoriteThreadIds: string[];
  hiddenMessageIds: string[];
  isBackendLoading: boolean;
  onAcceptRequest: (request: LocalMessageRequest) => void | Promise<void>;
  onChangeComposerText: (value: string) => void;
  onDeclineRequest: (request: LocalMessageRequest) => void | Promise<void>;
  onLoadDemoThreads: () => void;
  onOpenMessageSafety: (thread: ChatThread, message: ChatMessage) => void;
  onOpenOnboarding: () => void;
  onOpenSafety: (thread: ChatThread) => void;
  onRefreshChats: () => void | Promise<void>;
  onSelectThread: (threadId: string) => void;
  onSendMessage: (thread: ChatThread) => void | Promise<void>;
  onToggleFavoriteThread: (threadId: string) => void;
  onToggleThreadMute: (thread: ChatThread) => void | Promise<void>;
  pendingRequests: LocalMessageRequest[];
  selectedThread?: ChatThread;
  threads: ChatThread[];
}) {
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const messageScrollRef = useRef<ScrollView | null>(null);
  const hasThreads = threads.length > 0;
  const normalizedChatSearch = chatSearchQuery.trim().toLowerCase();
  const filteredThreads = useMemo(() => {
    if (!normalizedChatSearch) {
      return threads;
    }

    return threads.filter((thread) => {
      const searchable = [
        thread.participant.name,
        thread.participant.neighborhood,
        thread.participant.intro,
        ...thread.participant.tags,
        ...thread.messages.map((message) => message.body)
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedChatSearch);
    });
  }, [normalizedChatSearch, threads]);
  const filteredPendingRequests = useMemo(() => {
    if (!normalizedChatSearch) {
      return pendingRequests;
    }

    return pendingRequests.filter((request) => {
      const searchable = [
        request.body,
        request.peer.name,
        request.peer.neighborhood,
        request.status,
        ...request.peer.tags
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedChatSearch);
    });
  }, [normalizedChatSearch, pendingRequests]);
  const visibleMessages = selectedThread
    ? selectedThread.messages.filter((message) => !hiddenMessageIds.includes(message.id))
    : [];
  const isConversationOpen = Boolean(selectedThread);
  const composerHasSensitiveContact = containsSensitiveContact(composerText);
  const threadRailExtraData = `${selectedThread?.id ?? ""}:${Array.from(draftThreadIds).sort().join("|")}:${favoriteThreadIds.join("|")}`;

  useEffect(() => {
    if (!selectedThread) {
      return;
    }

    const timer = setTimeout(() => {
      messageScrollRef.current?.scrollToEnd({ animated: false });
    }, 80);

    return () => clearTimeout(timer);
  }, [selectedThread, visibleMessages.length]);

  return (
    <View style={styles.chatScreen}>
      {!isConversationOpen ? (
        <View style={styles.chatStatusBand}>
          <Ionicons color={canUseBackend() ? colors.teal : colors.mutedInk} name="sync" size={18} />
          <Text style={styles.backendText}>
            {isBackendLoading ? "대화를 새로 확인하는 중..." : formatServiceNotice(backendNotice)}
          </Text>
          <Pressable
            accessibilityLabel="대화 새로고침"
            accessibilityRole="button"
            onPress={onRefreshChats}
            style={styles.smallIconButton}
          >
            {isBackendLoading ? (
              <ActivityIndicator color={colors.teal} size="small" />
            ) : (
              <Ionicons color={colors.teal} name="refresh" size={18} />
            )}
          </Pressable>
        </View>
      ) : null}

      {!isConversationOpen ? (
        <View style={styles.chatSearchBox}>
          <Ionicons color={colors.mutedInk} name="search" size={17} />
          <TextInput
            accessibilityLabel="대화 검색"
            onChangeText={setChatSearchQuery}
            placeholder="이름, 동네, 메시지 검색"
            placeholderTextColor={colors.mutedInk}
            style={styles.chatSearchInput}
            value={chatSearchQuery}
          />
          {chatSearchQuery ? (
            <Pressable
              accessibilityLabel="대화 검색어 지우기"
              accessibilityRole="button"
              onPress={() => setChatSearchQuery("")}
              style={styles.searchClearButton}
            >
              <Ionicons color={colors.mutedInk} name="close" size={16} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!isConversationOpen && normalizedChatSearch ? (
        <Text style={styles.searchResultText}>
          대화 {filteredThreads.length}개 · 요청 {filteredPendingRequests.length}개
        </Text>
      ) : null}

      {hasThreads ? (
        <View style={styles.threadRail}>
          <FlatList
            data={filteredThreads}
            extraData={threadRailExtraData}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.threadRailContent}
            renderItem={({ item }) => {
              const hasDraft = draftThreadIds.has(item.id);

              return (
                <Pressable
                  accessibilityLabel={`${item.participant.name}님과의 대화 열기${hasDraft ? ", 작성 중인 메시지 있음" : ""}`}
                  accessibilityRole="button"
                  onPress={() => onSelectThread(item.id)}
                  style={[
                    styles.threadChip,
                    selectedThread?.id === item.id ? styles.threadChipActive : undefined
                  ]}
                >
                  <Avatar color={item.participant.avatarColor} label={item.participant.name} size={34} />
                  <Text style={styles.threadChipText}>{item.participant.name}</Text>
                  {hasDraft ? (
                    <View style={styles.threadDraftBadge}>
                      <Ionicons color={colors.teal} name="create-outline" size={12} />
                      <Text style={styles.threadDraftText}>작성 중</Text>
                    </View>
                  ) : null}
                  {favoriteThreadIds.includes(item.id) ? (
                    <Ionicons color={colors.yellow} name="star" size={13} />
                  ) : null}
                  {isThreadMuted(item.mutedUntil) ? (
                    <Ionicons color={colors.mutedInk} name="notifications-off" size={13} />
                  ) : null}
                  {item.unreadCount ? <View style={styles.unreadDot} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      {filteredPendingRequests.length > 0 ? (
        <View style={styles.pendingPanel}>
          <SectionHeader title="쪽지 요청함" value={`${filteredPendingRequests.length}개 대기`} />
          {filteredPendingRequests.map((request) => (
            <PendingRequestRow
              key={request.id}
              onAccept={onAcceptRequest}
              onDecline={onDeclineRequest}
              request={request}
            />
          ))}
        </View>
      ) : null}

      {!isConversationOpen && normalizedChatSearch && filteredThreads.length === 0 && filteredPendingRequests.length === 0 ? (
        <View style={styles.searchEmptyState}>
          <Ionicons color={colors.mutedInk} name="search" size={20} />
          <Text style={styles.panelTitle}>검색 결과가 없어요</Text>
          <Text style={styles.panelCaption}>다른 이름, 동네, 메시지 단어로 찾아보세요.</Text>
        </View>
      ) : null}

      {selectedThread ? (
        <>
          <View style={styles.chatHeader}>
            <Avatar color={selectedThread.participant.avatarColor} label={selectedThread.participant.name} size={44} />
            <View style={styles.fill}>
              <Text style={styles.panelTitle}>{selectedThread.participant.name}</Text>
              <Text style={styles.panelCaption}>
                {selectedThread.participant.neighborhood} · {formatDistance(selectedThread.participant.distanceKm)} ·{" "}
                {formatLastActive(selectedThread.participant.lastActiveMinutes)}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={`${selectedThread.participant.name}님과의 대화 즐겨찾기 ${
                favoriteThreadIds.includes(selectedThread.id) ? "해제" : "추가"
              }`}
              accessibilityRole="button"
              onPress={() => onToggleFavoriteThread(selectedThread.id)}
              style={styles.smallIconButton}
            >
              <Ionicons
                color={favoriteThreadIds.includes(selectedThread.id) ? colors.yellow : colors.mutedInk}
                name={favoriteThreadIds.includes(selectedThread.id) ? "star" : "star-outline"}
                size={18}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={`${selectedThread.participant.name}님과의 대화 알림 ${
                isThreadMuted(selectedThread.mutedUntil) ? "켜기" : "끄기"
              }`}
              accessibilityRole="button"
              onPress={() => onToggleThreadMute(selectedThread)}
              style={styles.smallIconButton}
            >
              <Ionicons
                color={isThreadMuted(selectedThread.mutedUntil) ? colors.mutedInk : colors.teal}
                name={isThreadMuted(selectedThread.mutedUntil) ? "notifications-off" : "notifications"}
                size={18}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="신고 또는 차단 메뉴 열기"
              accessibilityRole="button"
              onPress={() => onOpenSafety(selectedThread)}
              style={styles.smallIconButton}
            >
              <Ionicons color={colors.danger} name="ban" size={18} />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chatContextRail}
            contentContainerStyle={styles.chatContextContent}
          >
            <ChatContextPill icon="location-outline" label={`${selectedThread.participant.neighborhood} 근처`} />
            <ChatContextPill icon="navigate-outline" label={formatDistance(selectedThread.participant.distanceKm)} />
            <ChatContextPill
              icon="chatbubble-ellipses-outline"
              label={formatResponseStyle(selectedThread.participant.responseRate)}
            />
            <ChatContextPill
              icon={selectedThread.participant.verified ? "shield-checkmark" : "shield-outline"}
              label={selectedThread.participant.verified ? "인증 프로필" : "안전 대화"}
              tone="safe"
            />
          </ScrollView>

          <ScrollView
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => messageScrollRef.current?.scrollToEnd({ animated: false })}
            ref={messageScrollRef}
            showsVerticalScrollIndicator={false}
            style={styles.messageScroll}
          >
            {visibleMessages.map((message) => {
              const mine = message.authorId === "me";

              return (
                <View key={message.id} style={[styles.messageRow, mine ? styles.messageRowMine : undefined]}>
                  {!mine ? (
                    <Pressable
                      accessibilityLabel="이 메시지 신고 또는 숨기기"
                      accessibilityRole="button"
                      onPress={() => onOpenMessageSafety(selectedThread, message)}
                      style={styles.messageSafetyButton}
                    >
                      <Ionicons color={colors.danger} name="flag-outline" size={15} />
                    </Pressable>
                  ) : null}
                  <View style={[styles.messageBubbleStack, mine ? styles.messageBubbleStackMine : undefined]}>
                    <View style={[styles.messageBubble, mine ? styles.messageMine : styles.messageOther]}>
                      <Text style={[styles.messageText, mine ? styles.messageTextMine : undefined]}>
                        {message.body}
                      </Text>
                    </View>
                    <Text style={[styles.messageMetaText, mine ? styles.messageMetaTextMine : undefined]}>
                      {formatMessageTime(message.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            })}
            {selectedThread.messages.length > 0 && visibleMessages.length === 0 ? (
              <View style={styles.hiddenMessagesNotice}>
                <Ionicons color={colors.mutedInk} name="eye-off" size={18} />
                <Text style={styles.panelCaption}>이 대화의 메시지를 모두 숨겼어요.</Text>
              </View>
            ) : null}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickReplyBar}
            contentContainerStyle={styles.quickReplyContent}
          >
            {getQuickReplies(selectedThread.participant).map((reply) => (
              <Pressable
                accessibilityLabel={`빠른 답장: ${reply}`}
                accessibilityRole="button"
                key={reply}
                onPress={() => onChangeComposerText(reply)}
                style={styles.quickReplyChip}
              >
                <Text style={styles.quickReplyText}>{reply}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={[styles.composerSafetyHint, composerHasSensitiveContact ? styles.composerSafetyHintWarning : undefined]}>
            <Ionicons
              color={composerHasSensitiveContact ? colors.danger : colors.lilac}
              name={composerHasSensitiveContact ? "alert-circle" : "shield-checkmark"}
              size={15}
            />
            <Text style={[styles.composerSafetyText, composerHasSensitiveContact ? styles.composerSafetyTextWarning : undefined]}>
              {composerHasSensitiveContact
                ? "전화번호, 정확한 주소, 외부 메신저 ID는 아직 보낼 수 없어요."
                : "연락처와 정확한 주소는 충분히 신뢰가 생긴 뒤 공유하세요."}
            </Text>
          </View>

          <View style={styles.composer}>
            <TextInput
              multiline
              onChangeText={onChangeComposerText}
              placeholder="메시지 입력"
              placeholderTextColor={colors.mutedInk}
              style={styles.composerInput}
              value={composerText}
            />
            <Pressable
              accessibilityLabel={composerHasSensitiveContact ? "민감 정보가 포함되어 메시지를 보낼 수 없음" : "메시지 전송"}
              accessibilityRole="button"
              disabled={composerHasSensitiveContact}
              onPress={() => onSendMessage(selectedThread)}
              style={[styles.sendButton, composerHasSensitiveContact ? styles.sendButtonDisabled : undefined]}
            >
              <Ionicons color={colors.white} name="send" size={18} />
            </Pressable>
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.screenScroll} showsVerticalScrollIndicator={false}>
          <EmptyState
            actionLabel={__DEV__ ? "체험 대화 보기" : "프로필 확인"}
            icon="chatbubbles"
            mascotMood="empty"
            onAction={__DEV__ ? onLoadDemoThreads : onOpenOnboarding}
            title="아직 열린 대화가 없어요"
            body={
              __DEV__
                ? "채팅 UI, 신고, 숨김, 차단 흐름을 먼저 살펴볼 수 있어요."
                : "상대가 쪽지 요청을 수락하면 이곳에 안전한 대화방이 열립니다."
            }
          />
        </ScrollView>
      )}
    </View>
  );
}

function PendingRequestRow({
  onAccept,
  onDecline,
  request
}: {
  onAccept: (request: LocalMessageRequest) => void | Promise<void>;
  onDecline: (request: LocalMessageRequest) => void | Promise<void>;
  request: LocalMessageRequest;
}) {
  const received = request.direction === "received";

  return (
    <View style={styles.pendingRow}>
      <Avatar color={request.peer.avatarColor} label={request.peer.name} size={38} />
      <View style={styles.fill}>
        <Text style={styles.panelTitle}>
          {received ? `${request.peer.name}님에게서 온 요청` : `${request.peer.name}님에게 보낸 요청`}
        </Text>
        <Text numberOfLines={1} style={styles.panelCaption}>
          {request.body}
        </Text>
      </View>
      {received ? (
        <View style={styles.pendingActions}>
          <Pressable
            accessibilityLabel={`${request.peer.name} 요청 거절`}
            accessibilityRole="button"
            onPress={() => onDecline(request)}
            style={styles.pendingActionGhost}
          >
            <Ionicons color={colors.mutedInk} name="close" size={17} />
          </Pressable>
          <Pressable
            accessibilityLabel={`${request.peer.name} 요청 수락`}
            accessibilityRole="button"
            onPress={() => onAccept(request)}
            style={styles.pendingActionButton}
          >
            <Ionicons color={colors.white} name="checkmark" size={17} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>대기</Text>
        </View>
      )}
    </View>
  );
}

function RewardsScreen({
  credits,
  earnedToday,
  extraMessagePasses,
  isAdLoading,
  onEarnCredit,
  onUseReward
}: {
  credits: number;
  earnedToday: number;
  extraMessagePasses: number;
  isAdLoading: boolean;
  onEarnCredit: () => void;
  onUseReward: (perk: RewardPerk) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.rewardHero}>
        <View style={styles.rewardIcon}>
          <Ionicons color={colors.ink} name="sparkles" size={25} />
        </View>
        <View style={styles.fill}>
          <Text style={styles.rewardTitle}>{credits} 크레딧</Text>
          <Text style={styles.rewardCaption}>
            선택한 보상에서만 광고를 보여주고, 오늘 {earnedToday}/3회 지급했어요. 추가 쪽지권 {extraMessagePasses}개 보유 중.
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityLabel="리워드 광고 보고 크레딧 받기"
        accessibilityRole="button"
        disabled={isAdLoading}
        onPress={onEarnCredit}
        style={[styles.earnButton, isAdLoading ? styles.disabledButton : undefined]}
      >
        {isAdLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Ionicons color={colors.white} name="play-circle" size={21} />
        )}
        <Text style={styles.earnButtonText}>{isAdLoading ? "광고 확인 중" : "리워드 광고 보고 1 크레딧 받기"}</Text>
      </Pressable>

      <SectionHeader title="사용 가능한 혜택" value="오늘 3회까지" />

      <View style={styles.rewardList}>
        {rewardPerks.map((perk) => (
          <RewardRow key={perk.id} credits={credits} onUseReward={onUseReward} perk={perk} />
        ))}
      </View>
    </ScrollView>
  );
}

function RewardRow({
  credits,
  onUseReward,
  perk
}: {
  credits: number;
  onUseReward: (perk: RewardPerk) => void;
  perk: RewardPerk;
}) {
  const accent = {
    coral: colors.coral,
    teal: colors.teal,
    lilac: colors.lilac,
    yellow: colors.yellow
  }[perk.accent];

  return (
    <View style={styles.rewardRow}>
      <View style={[styles.rewardDot, { backgroundColor: accent }]} />
      <View style={styles.fill}>
        <Text style={styles.panelTitle}>{perk.title}</Text>
        <Text style={styles.panelCaption}>{perk.description}</Text>
      </View>
      <Pressable
        accessibilityLabel={`${perk.title} 사용`}
        accessibilityRole="button"
        onPress={() => onUseReward(perk)}
        style={[styles.rewardUseButton, credits < perk.cost ? styles.disabledButton : undefined]}
      >
        <Text style={styles.rewardUseText}>{perk.cost}</Text>
        <Ionicons color={colors.white} name="flash" size={14} />
      </Pressable>
    </View>
  );
}

function ProfileScreen({
  blockedProfileCount,
  deletionStatus,
  discoveryPauseUntil,
  favoriteThreadCount,
  isDiscoverable,
  onEnablePush,
  onExportData,
  onOpenChats,
  onOpenOnboarding,
  onOpenPolicy,
  onOpenSafetySettings,
  onRequestAccountDeletion,
  onToggleDiscoverable,
  onToggleDiscoveryPause,
  onToggleQuietHours,
  profile,
  pushStatus,
  quietHoursEnabled,
  radiusKm,
  selectedInterests
}: {
  blockedProfileCount: number;
  deletionStatus: string;
  discoveryPauseUntil: string | null;
  favoriteThreadCount: number;
  isDiscoverable: boolean;
  onEnablePush: () => void | Promise<void>;
  onExportData: () => void | Promise<void>;
  onOpenChats: () => void;
  onOpenOnboarding: () => void;
  onOpenPolicy: () => void;
  onOpenSafetySettings: () => void;
  onRequestAccountDeletion: () => void;
  onToggleDiscoverable: () => void | Promise<void>;
  onToggleDiscoveryPause: () => void | Promise<void>;
  onToggleQuietHours: () => void;
  profile: OnboardingProfile;
  pushStatus: string;
  quietHoursEnabled: boolean;
  radiusKm: number;
  selectedInterests: string[];
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.profileSummary}>
        <Avatar color={colors.coral} label={profile.name || "나"} size={70} />
        <View style={styles.fill}>
          <Text style={styles.profileName}>{profile.name || "프로필 설정 필요"}</Text>
          <Text style={styles.panelCaption}>
            {profile.age || "-"}세 · {genderLabel(profile.gender)} · {profile.locationLabel}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="프로필 수정"
          accessibilityRole="button"
          onPress={onOpenOnboarding}
          style={styles.smallIconButton}
        >
          <Ionicons color={colors.teal} name="create-outline" size={19} />
        </Pressable>
      </View>

      <View style={styles.settingsGroup}>
        <SettingRow
          icon={isDiscoverable ? "eye" : "eye-off"}
          label="동네 추천 노출"
          onPress={onToggleDiscoverable}
          value={isDiscoverable ? "켜짐" : "꺼짐"}
        />
        <SettingRow
          icon={isDiscoveryPaused(discoveryPauseUntil) ? "pause-circle" : "pause-circle-outline"}
          label="내 동네 일시 숨김"
          onPress={onToggleDiscoveryPause}
          value={formatDiscoveryPause(discoveryPauseUntil)}
        />
        <SettingRow
          icon="sparkles"
          label="관심사"
          onPress={onOpenOnboarding}
          value={selectedInterests.length ? selectedInterests.join(", ") : "미설정"}
        />
        <SettingRow icon="notifications" label="쪽지 알림" onPress={onEnablePush} value={pushStatus} />
        <SettingRow
          icon={quietHoursEnabled ? "moon" : "moon-outline"}
          label="조용한 시간"
          onPress={onToggleQuietHours}
          value={quietHoursEnabled ? `${quietHoursLabel} 켜짐` : "꺼짐"}
        />
        <SettingRow
          icon="star"
          label="즐겨찾기 대화"
          onPress={onOpenChats}
          value={favoriteThreadCount ? `${favoriteThreadCount}개 고정` : "없음"}
        />
        <SettingRow icon="navigate" label="노출 반경" onPress={onOpenOnboarding} value={`${radiusKm}km 이내`} />
        <SettingRow
          icon="eye-off"
          label="정확 위치"
          onPress={() => Alert.alert("정확 위치 비공개", "상대에게는 대략 거리와 동네 범위만 표시됩니다.")}
          value="비공개"
        />
        <SettingRow icon="download" label="데이터 내보내기" onPress={onExportData} value="JSON" />
        <SettingRow icon="document-text" label="약관/개인정보" onPress={onOpenPolicy} value="보기" />
        <SettingRow
          icon="shield-checkmark"
          label="신고/차단"
          onPress={onOpenSafetySettings}
          value={blockedProfileCount ? `${blockedProfileCount}명 차단` : "항상 사용 가능"}
        />
        <SettingRow
          danger
          icon="trash"
          label="계정 삭제"
          onPress={onRequestAccountDeletion}
          value={deletionStatus}
        />
      </View>

      <View style={styles.safetyBand}>
        <MascotMark mood="safe" size="xs" />
        <View style={styles.fill}>
          <Text style={styles.panelTitle}>개인정보 최소 수집</Text>
          <Text style={styles.panelCaption}>
            앱에는 표시용 이름, 나이, 성별, 근거리 추천용 위치만 요구하는 구조로 설계했어요.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function SettingRow({
  danger,
  icon,
  label,
  onPress,
  value
}: {
  danger?: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
  value: string;
}) {
  return (
    <Pressable accessibilityLabel={`${label} 설정 열기`} accessibilityRole="button" onPress={onPress} style={styles.settingRow}>
      <View style={[styles.settingIcon, danger ? styles.settingIconDanger : undefined]}>
        <Ionicons color={danger ? colors.danger : colors.teal} name={icon} size={18} />
      </View>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </Pressable>
  );
}

function OnboardingModal({
  canClose,
  isLocating,
  isOpen,
  onClose,
  onComplete,
  onToggleInterest,
  onLocate,
  onOpenPolicy,
  profile,
  selectedInterests,
  setProfile
}: {
  canClose: boolean;
  isLocating: boolean;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  onToggleInterest: (interest: string) => void;
  onLocate: () => void;
  onOpenPolicy: () => void;
  profile: OnboardingProfile;
  selectedInterests: string[];
  setProfile: (profile: OnboardingProfile) => void;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={isOpen}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalTitleRow}>
            <View style={styles.modalTitleCopy}>
              <MascotMark mood="location" size="sm" />
              <Text style={styles.kicker}>시작하기</Text>
              <Text style={styles.modalTitle}>필요한 정보만 받을게요</Text>
            </View>
            {canClose ? (
              <Pressable
                accessibilityLabel="온보딩 닫기"
                accessibilityRole="button"
                onPress={onClose}
                style={styles.smallIconButton}
              >
                <Ionicons color={colors.ink} name="close" size={20} />
              </Pressable>
            ) : null}
          </View>

          <TextInput
            onChangeText={(name) => setProfile({ ...profile, name })}
            placeholder="이름"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
            value={profile.name}
          />
          <TextInput
            keyboardType="number-pad"
            onChangeText={(age) => setProfile({ ...profile, age })}
            placeholder="나이"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
            value={profile.age}
          />

          <View style={styles.segmentGroup}>
            {genderOptions.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setProfile({ ...profile, gender: option.value })}
                style={[
                  styles.segmentButton,
                  profile.gender === option.value ? styles.segmentButtonActive : undefined
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    profile.gender === option.value ? styles.segmentTextActive : undefined
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.interestPanel}>
            <Text style={styles.sectionEyebrow}>관심사</Text>
            <View style={styles.filterRow}>
              {profileInterestOptions.map((interest) => {
                const active = selectedInterests.includes(interest);

                return (
                  <Pressable
                    accessibilityLabel={`${interest} 관심사 선택`}
                    accessibilityRole="button"
                    key={interest}
                    onPress={() => onToggleInterest(interest)}
                    style={[styles.filterChip, active ? styles.filterChipActive : undefined]}
                  >
                    <Text style={[styles.filterText, active ? styles.filterTextActive : undefined]}>
                      {interest}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            accessibilityLabel="위치 권한 요청"
            accessibilityRole="button"
            onPress={onLocate}
            style={styles.locationPermission}
          >
            <Ionicons color={colors.teal} name="locate" size={21} />
            <View style={styles.fill}>
              <Text style={styles.panelTitle}>{profile.locationLabel}</Text>
              <Text style={styles.panelCaption}>5km 이내 추천에만 사용하고, 나중에 허용해도 돼요.</Text>
            </View>
            {isLocating ? <ActivityIndicator color={colors.teal} /> : <Ionicons color={colors.teal} name="chevron-forward" size={19} />}
          </Pressable>

          <Pressable
            accessibilityLabel="만 18세 이상 및 서비스 정책 동의"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: profile.policyAccepted }}
            onPress={() => setProfile({ ...profile, policyAccepted: !profile.policyAccepted })}
            style={styles.policyRow}
          >
            <View style={[styles.checkbox, profile.policyAccepted ? styles.checkboxActive : undefined]}>
              {profile.policyAccepted ? <Ionicons color={colors.white} name="checkmark" size={17} /> : null}
            </View>
            <Text style={styles.policyText}>
              만 18세 이상이며, 약관·개인정보·위치기반서비스 안내를 확인했어요.
            </Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={onOpenPolicy} style={styles.policyLinkButton}>
            <Ionicons color={colors.teal} name="document-text" size={17} />
            <Text style={styles.policyLinkText}>약관/개인정보 안내 보기</Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={onComplete} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>동네 친구 보기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function MessageRequestModal({
  onChangeText,
  onClose,
  onSend,
  target,
  text
}: {
  onChangeText: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
  target: NearbyProfile | null;
  text: string;
}) {
  const requestHasSensitiveContact = containsSensitiveContact(text);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(target)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          {target ? (
            <>
              <View style={styles.modalTitleRow}>
                <View style={styles.requestTitle}>
                  <Avatar color={target.avatarColor} label={target.name} size={48} />
                  <View style={styles.fill}>
                    <Text style={styles.kicker}>쪽지 요청</Text>
                    <Text style={styles.modalTitle}>{target.name}님에게 먼저 인사하기</Text>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel="쪽지 요청 닫기"
                  accessibilityRole="button"
                  onPress={onClose}
                  style={styles.smallIconButton}
                >
                  <Ionicons color={colors.ink} name="close" size={20} />
                </Pressable>
              </View>

              <Text style={styles.requestHelp}>
                상대가 수락하면 채팅방이 열립니다. 같은 문구 반복과 불편한 표현은 제한돼요.
              </Text>

              <View style={[styles.requestSafetyBand, requestHasSensitiveContact ? styles.requestSafetyBandWarning : undefined]}>
                <Ionicons
                  color={requestHasSensitiveContact ? colors.danger : colors.teal}
                  name={requestHasSensitiveContact ? "alert-circle" : "shield-checkmark"}
                  size={19}
                />
                <Text style={[styles.requestSafetyText, requestHasSensitiveContact ? styles.requestSafetyTextWarning : undefined]}>
                  {requestHasSensitiveContact
                    ? "전화번호, 상세 주소, 외부 메신저 ID가 포함된 첫 쪽지는 보낼 수 없어요."
                    : "첫 대화는 앱 안에서만 시작해요. 연락처, 상세 주소, 외부 메신저 ID는 자동으로 막습니다."}
                </Text>
              </View>

              <View style={styles.icebreakerPanel}>
                <Text style={styles.sectionEyebrow}>대화 시작 템플릿</Text>
                <View style={styles.icebreakerList}>
                  {getIcebreakers(target).map((icebreaker) => (
                    <Pressable
                      accessibilityLabel={`첫 쪽지 템플릿: ${icebreaker}`}
                      accessibilityRole="button"
                      key={icebreaker}
                      onPress={() => onChangeText(icebreaker)}
                      style={styles.icebreakerChip}
                    >
                      <Text style={styles.icebreakerText}>{icebreaker}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <TextInput
                multiline
                maxLength={160}
                onChangeText={onChangeText}
                placeholder="가볍고 구체적인 첫 인사를 적어보세요"
                placeholderTextColor={colors.mutedInk}
                style={styles.requestInput}
                value={text}
              />
              <Text style={styles.characterCount}>{text.trim().length}/160</Text>

              <Pressable
                accessibilityLabel={requestHasSensitiveContact ? "민감 정보가 포함되어 쪽지 요청을 보낼 수 없음" : "쪽지 요청 보내기"}
                accessibilityRole="button"
                disabled={requestHasSensitiveContact}
                onPress={onSend}
                style={[styles.primaryButton, requestHasSensitiveContact ? styles.disabledButton : undefined]}
              >
                <Text style={styles.primaryButtonText}>쪽지 요청 보내기</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function SafetyActionModal({
  onBlock,
  onClose,
  onHide,
  onReport,
  thread
}: {
  onBlock: (thread: ChatThread) => void;
  onClose: () => void;
  onHide: (threadId: string) => void;
  onReport: (reason: string) => void;
  thread: ChatThread | null;
}) {
  const reportReasons = ["불쾌한 메시지", "스팸/홍보", "위험한 만남 유도"];

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(thread)}>
      <View style={styles.centerModalBackdrop}>
        <View style={styles.actionSheet}>
          {thread ? (
            <>
              <View style={styles.actionHeader}>
                <MascotMark mood="safe" size="sm" />
                <View style={styles.fill}>
                  <Text style={styles.kicker}>안전 메뉴</Text>
                  <Text style={styles.actionTitle}>{thread.participant.name}님과의 대화</Text>
                </View>
              </View>

              {reportReasons.map((reason) => (
                <Pressable
                  accessibilityLabel={`${reason} 사유로 신고하기`}
                  accessibilityRole="button"
                  key={reason}
                  onPress={() => onReport(reason)}
                  style={styles.actionRow}
                >
                  <Ionicons color={colors.danger} name="flag" size={20} />
                  <Text style={styles.actionText}>{reason}</Text>
                </Pressable>
              ))}

              <Pressable
                accessibilityLabel="대화 숨기기"
                accessibilityRole="button"
                onPress={() => onHide(thread.id)}
                style={styles.actionRow}
              >
                <Ionicons color={colors.mutedInk} name="archive" size={20} />
                <Text style={styles.actionText}>대화 숨기기</Text>
              </Pressable>

              <Pressable
                accessibilityLabel={`${thread.participant.name}님 차단하기`}
                accessibilityRole="button"
                onPress={() => onBlock(thread)}
                style={styles.actionRowDanger}
              >
                <Ionicons color={colors.white} name="ban" size={20} />
                <Text style={styles.actionTextDanger}>차단하고 추천에서 숨기기</Text>
              </Pressable>

              <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>닫기</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function MessageSafetyModal({
  onClose,
  onHide,
  onReport,
  target
}: {
  onClose: () => void;
  onHide: (threadId: string, messageId: string) => void;
  onReport: (reason: string) => void | Promise<void>;
  target: MessageSafetyTarget | null;
}) {
  const reportReasons = ["불쾌한 표현", "개인정보/연락처 요구", "스팸 또는 사기 의심"];

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(target)}>
      <View style={styles.centerModalBackdrop}>
        <View style={styles.actionSheet}>
          {target ? (
            <>
              <View style={styles.actionHeader}>
                <MascotMark mood="safe" size="sm" />
                <View style={styles.fill}>
                  <Text style={styles.kicker}>메시지 안전</Text>
                  <Text style={styles.actionTitle}>{target.thread.participant.name}님의 메시지</Text>
                </View>
              </View>

              <View style={styles.messagePreviewBox}>
                <Text numberOfLines={3} style={styles.panelCaption}>
                  {target.message.body}
                </Text>
              </View>

              {reportReasons.map((reason) => (
                <Pressable
                  accessibilityLabel={`${reason} 사유로 메시지 신고하기`}
                  accessibilityRole="button"
                  key={reason}
                  onPress={() => onReport(reason)}
                  style={styles.actionRow}
                >
                  <Ionicons color={colors.danger} name="flag" size={20} />
                  <Text style={styles.actionText}>{reason}</Text>
                </Pressable>
              ))}

              <Pressable
                accessibilityLabel="이 메시지만 숨기기"
                accessibilityRole="button"
                onPress={() => onHide(target.thread.id, target.message.id)}
                style={styles.actionRow}
              >
                <Ionicons color={colors.mutedInk} name="eye-off" size={20} />
                <Text style={styles.actionText}>이 메시지만 숨기기</Text>
              </Pressable>

              <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>닫기</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function PolicyNoticeModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const sections = [
    {
      title: "서비스 이용",
      items: [
        "만 18세 이상 사용자를 전제로 운영합니다.",
        "불쾌한 메시지, 스팸, 위험한 만남 유도는 신고 대상입니다.",
        "신고와 차단은 무료로 제공하며 운영 검토에 사용됩니다."
      ]
    },
    {
      title: "개인정보",
      items: [
        "가입에는 표시 이름, 나이, 성별만 필수로 사용합니다.",
        "대화, 신고, 리워드 기록은 서비스 운영과 안전 대응에 사용됩니다.",
        "데이터 내보내기와 계정 삭제 요청 경로를 앱 안에 제공합니다."
      ]
    },
    {
      title: "위치",
      items: [
        "위치는 5km 이내 추천과 대략 거리 표시에만 사용합니다.",
        "상대에게 정확한 좌표나 주소를 보여주지 않습니다.",
        "위치 권한을 거부해도 프로필과 일부 화면은 계속 사용할 수 있습니다."
      ]
    }
  ];

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={isOpen}>
      <View style={styles.centerModalBackdrop}>
        <View style={styles.actionSheet}>
          <View style={styles.actionHeader}>
            <MascotMark mood="safe" size="sm" />
            <View style={styles.fill}>
              <Text style={styles.kicker}>정책 안내</Text>
              <Text style={styles.actionTitle}>약관/개인정보/위치</Text>
            </View>
          </View>

          <ScrollView style={styles.policyNoticeScroll}>
            {sections.map((section) => (
              <View key={section.title} style={styles.policyNoticeBlock}>
                <Text style={styles.panelTitle}>{section.title}</Text>
                {section.items.map((item) => (
                  <View key={item} style={styles.policyNoticeItem}>
                    <View style={styles.policyNoticeDot} />
                    <Text style={styles.panelCaption}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={styles.policyReviewBand}>
            <Ionicons color={colors.mutedInk} name="information-circle" size={18} />
            <Text style={styles.panelCaption}>출시 전 변호사/노무·개인정보 전문가 검토가 필요합니다.</Text>
          </View>

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>확인</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SafetySettingsModal({
  blockedProfiles,
  isOpen,
  onClose,
  reportHistory,
  onUnblock
}: {
  blockedProfiles: NearbyProfile[];
  isOpen: boolean;
  onClose: () => void;
  reportHistory: ReportHistoryItem[];
  onUnblock: (profileId: string) => void;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={isOpen}>
      <View style={styles.centerModalBackdrop}>
        <View style={styles.actionSheet}>
          <View style={styles.actionHeader}>
            <MascotMark mood="safe" size="sm" />
            <View style={styles.fill}>
              <Text style={styles.kicker}>안전 설정</Text>
              <Text style={styles.actionTitle}>차단 목록</Text>
            </View>
          </View>

          {blockedProfiles.length ? (
            blockedProfiles.map((profileItem) => (
              <View key={profileItem.id} style={styles.blockedProfileRow}>
                <Avatar color={profileItem.avatarColor} label={profileItem.name} size={38} />
                <View style={styles.fill}>
                  <Text style={styles.panelTitle}>{profileItem.name}</Text>
                  <Text style={styles.panelCaption}>
                    {profileItem.neighborhood} · {formatDistance(profileItem.distanceKm)}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={`${profileItem.name}님 차단 해제`}
                  accessibilityRole="button"
                  onPress={() => onUnblock(profileItem.id)}
                  style={styles.pendingActionGhost}
                >
                  <Ionicons color={colors.teal} name="return-up-back" size={18} />
                </Pressable>
              </View>
            ))
          ) : (
            <View style={styles.safetyEmptyState}>
              <Ionicons color={colors.teal} name="shield-checkmark" size={22} />
              <Text style={styles.panelTitle}>차단한 사람이 없어요</Text>
              <Text style={styles.panelCaption}>불편한 대화는 언제든 신고하거나 추천에서 숨길 수 있습니다.</Text>
            </View>
          )}

          <View style={styles.safetyDivider} />

          <SectionHeader title="신고 내역" value={`${reportHistory.length}건`} />

          {reportHistory.length ? (
            reportHistory.slice(0, 5).map((report) => (
              <View key={report.id} style={styles.blockedProfileRow}>
                <View style={styles.reportIcon}>
                  <Ionicons color={colors.danger} name="flag" size={18} />
                </View>
                <View style={styles.fill}>
                  <Text style={styles.panelTitle}>{report.targetName}</Text>
                  <Text style={styles.panelCaption}>
                    {report.reason} · {formatReportDate(report.createdAt)}
                  </Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{reportStatusLabel(report.status)}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.safetyEmptyState}>
              <Ionicons color={colors.mutedInk} name="document-text" size={22} />
              <Text style={styles.panelTitle}>접수한 신고가 없어요</Text>
              <Text style={styles.panelCaption}>신고가 접수되면 검토 상태를 이곳에서 확인할 수 있습니다.</Text>
            </View>
          )}

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>닫기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function BottomTabs({
  activeTab,
  onChangeTab,
  unreadCount
}: {
  activeTab: TabKey;
  onChangeTab: (tab: TabKey) => void;
  unreadCount: number;
}) {
  const tabs: Array<{ key: TabKey; icon: IconName; label: string }> = [
    { key: "discover", icon: "compass", label: "동네" },
    { key: "chats", icon: "chatbubbles", label: "쪽지" },
    { key: "rewards", icon: "sparkles", label: "리워드" },
    { key: "profile", icon: "person", label: "내 정보" }
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        const showBadge = tab.key === "chats" && unreadCount > 0;

        return (
          <Pressable
            key={tab.key}
            accessibilityLabel={`${tab.label} 탭 열기`}
            accessibilityRole="button"
            onPress={() => onChangeTab(tab.key)}
            style={styles.tabItem}
          >
            <View style={[styles.tabIconWrap, active ? styles.tabIconWrapActive : undefined]}>
              <Ionicons color={active ? colors.white : colors.mutedInk} name={tab.icon} size={19} />
              {showBadge ? <View style={styles.tabBadge} /> : null}
            </View>
            <Text style={[styles.tabLabel, active ? styles.tabLabelActive : undefined]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EmptyState({
  actionLabel,
  body,
  icon,
  mascotMood = "empty",
  onAction,
  title
}: {
  actionLabel: string;
  body: string;
  icon: IconName;
  mascotMood?: MascotMood;
  onAction: () => void;
  title: string;
}) {
  return (
    <View style={styles.emptyState}>
      <MascotMark mood={mascotMood} size="lg" />
      <View style={styles.emptyIcon}>
        <Ionicons color={colors.teal} name={icon} size={21} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      <Pressable accessibilityLabel={actionLabel} accessibilityRole="button" onPress={onAction} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function SectionHeader({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionValue}>{value}</Text>
    </View>
  );
}

function ChatContextPill({
  icon,
  label,
  tone = "neutral"
}: {
  icon: IconName;
  label: string;
  tone?: "neutral" | "safe";
}) {
  const safe = tone === "safe";

  return (
    <View style={[styles.chatContextPill, safe ? styles.chatContextPillSafe : undefined]}>
      <Ionicons color={safe ? colors.teal : colors.mutedInk} name={icon} size={14} />
      <Text style={[styles.chatContextText, safe ? styles.chatContextTextSafe : undefined]}>{label}</Text>
    </View>
  );
}

function Avatar({ color, label, size = 48 }: { color: string; label: string; size?: number }) {
  return (
    <View style={[styles.avatar, { backgroundColor: color, height: size, width: size }]}>
      <Text style={[styles.avatarText, { fontSize: Math.max(14, size * 0.34) }]}>{label.slice(0, 1)}</Text>
    </View>
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseStoredOnboardingProfile(value: unknown): OnboardingProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const profileItem = value as Partial<OnboardingProfile> & { age?: number | string };

  if (
    typeof profileItem.name !== "string" ||
    (typeof profileItem.age !== "string" && typeof profileItem.age !== "number") ||
    typeof profileItem.gender !== "string" ||
    !genderOptions.some((option) => option.value === profileItem.gender) ||
    typeof profileItem.locationLabel !== "string" ||
    typeof profileItem.permissionGranted !== "boolean" ||
    typeof profileItem.policyAccepted !== "boolean"
  ) {
    return null;
  }

  return {
    age: String(profileItem.age),
    gender: profileItem.gender,
    locationLabel: profileItem.locationLabel,
    name: profileItem.name,
    permissionGranted: profileItem.permissionGranted,
    policyAccepted: profileItem.policyAccepted
  };
}

function isCompleteOnboardingProfile(profileItem: OnboardingProfile) {
  const ageNumber = Number(profileItem.age);

  return Boolean(profileItem.name.trim()) && !Number.isNaN(ageNumber) && ageNumber >= 18 && profileItem.policyAccepted;
}

function parseStoredDiscoveryPreferences(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    discoveryPauseUntil?: unknown;
    isDiscoverable?: unknown;
    radiusKm?: unknown;
    selectedInterest?: unknown;
    selectedInterests?: unknown;
  };
  const selectedInterest = interestFilters.includes(item.selectedInterest as InterestFilter)
    ? (item.selectedInterest as InterestFilter)
    : "전체";
  const selectedInterests = Array.isArray(item.selectedInterests)
    ? item.selectedInterests.filter(
        (interest): interest is string =>
          typeof interest === "string" &&
          profileInterestOptions.includes(interest as (typeof profileInterestOptions)[number])
      )
    : ["카페", "산책"];

  if (typeof item.radiusKm !== "number" || typeof item.isDiscoverable !== "boolean") {
    return null;
  }

  return {
    discoveryPauseUntil: typeof item.discoveryPauseUntil === "string" ? item.discoveryPauseUntil : null,
    isDiscoverable: item.isDiscoverable,
    radiusKm: clampRadius(item.radiusKm),
    selectedInterest,
    selectedInterests: selectedInterests.length > 0 ? selectedInterests : ["카페", "산책"]
  };
}

function isStoredNearbyProfile(value: unknown): value is NearbyProfile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const profileItem = value as Partial<NearbyProfile>;

  return (
    typeof profileItem.id === "string" &&
    typeof profileItem.name === "string" &&
    typeof profileItem.age === "number" &&
    typeof profileItem.gender === "string" &&
    genderOptions.some((option) => option.value === profileItem.gender) &&
    typeof profileItem.distanceKm === "number" &&
    typeof profileItem.neighborhood === "string" &&
    typeof profileItem.intro === "string" &&
    Array.isArray(profileItem.tags) &&
    typeof profileItem.avatarColor === "string" &&
    typeof profileItem.lastActiveMinutes === "number" &&
    typeof profileItem.responseRate === "number" &&
    typeof profileItem.verified === "boolean"
  );
}

function totalUnread(threads: ChatThread[]) {
  return threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
}

function containsSensitiveContact(text: string) {
  const compact = text.replace(/\s/g, "");
  const phonePattern = /01[016789]-?\d{3,4}-?\d{4}/;
  const externalMessengerPattern = /(카톡|카카오톡|오픈채팅|라인|텔레그램|인스타|dm|아이디|id)/i;
  const exactAddressPattern = /(주소|몇동|몇호|집앞|집 앞|현관|공동현관)/;

  return phonePattern.test(compact) || externalMessengerPattern.test(text) || exactAddressPattern.test(text);
}

function calculateMatchScore(profile: NearbyProfile, selectedInterests: string[]) {
  const sharedInterestCount = profile.tags.filter((tag) => selectedInterests.includes(tag)).length;
  const interestScore = Math.min(34, sharedInterestCount * 17);
  const distanceScore = Math.max(0, 24 - profile.distanceKm * 4);
  const activityScore = Math.max(0, 18 - Math.floor(profile.lastActiveMinutes / 5));
  const responseScore = Math.min(18, Math.round(profile.responseRate / 6));
  const verifiedScore = profile.verified ? 6 : 0;

  return Math.max(45, Math.min(98, Math.round(interestScore + distanceScore + activityScore + responseScore + verifiedScore)));
}

function getRecommendationInsight(profile: NearbyProfile, selectedInterests: string[]) {
  const sharedInterests = profile.tags.filter((tag) => selectedInterests.includes(tag));

  if (sharedInterests.length > 0) {
    return `공통 관심사 ${sharedInterests.slice(0, 2).join(", ")} · ${formatResponseStyle(profile.responseRate)}`;
  }

  if (profile.distanceKm <= 1) {
    return `아주 가까운 거리 · ${formatResponseStyle(profile.responseRate)}`;
  }

  if (profile.lastActiveMinutes <= 15) {
    return `최근 활동 중 · ${formatResponseStyle(profile.responseRate)}`;
  }

  return `관심사 확장 추천 · ${formatResponseStyle(profile.responseRate)}`;
}

function getIcebreakers(target: NearbyProfile) {
  const primaryTag = target.tags[0] ?? "동네";

  return [
    `${primaryTag} 이야기 좋아하신다고 해서 반가웠어요. 요즘 동네에서 좋았던 곳 있으세요?`,
    `${target.neighborhood} 근처에서 편하게 이야기 나눌 동네 친구를 찾고 있어요.`,
    `프로필 분위기가 좋아서 쪽지드려요. 부담 없이 ${primaryTag} 이야기부터 나눠봐요.`
  ];
}

function getQuickReplies(target: NearbyProfile) {
  const tag = target.tags[0] ?? "동네";

  return [
    "좋아요. 천천히 이야기해요.",
    `${tag} 이야기 더 들어보고 싶어요.`,
    "오늘은 앱 안에서 먼저 대화해볼게요."
  ];
}

function genderLabel(gender: Gender) {
  return genderOptions.find((option) => option.value === gender)?.label ?? "비공개";
}

function isDiscoveryPaused(pauseUntil: string | null) {
  return Boolean(pauseUntil && new Date(pauseUntil).getTime() > Date.now());
}

function isThreadMuted(mutedUntil: string | null | undefined) {
  return Boolean(mutedUntil && new Date(mutedUntil).getTime() > Date.now());
}

function createTomorrowMorningPause() {
  const until = new Date();
  until.setDate(until.getDate() + 1);
  until.setHours(8, 0, 0, 0);

  return until.toISOString();
}

function formatDiscoveryPause(pauseUntil: string | null) {
  if (!pauseUntil || !isDiscoveryPaused(pauseUntil)) {
    return "꺼짐";
  }

  const until = new Date(pauseUntil);
  const hour = String(until.getHours()).padStart(2, "0");
  const minute = String(until.getMinutes()).padStart(2, "0");

  return `${until.getMonth() + 1}/${until.getDate()} ${hour}:${minute}까지`;
}

function formatLastActive(minutes: number) {
  if (minutes < 5) {
    return "방금 활동";
  }

  if (minutes < 60) {
    return `${minutes}분 전 활동`;
  }

  return `${Math.round(minutes / 60)}시간 전 활동`;
}

function formatMessageTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "전송 시간 확인 중";
  }

  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}

function formatResponseStyle(responseRate: number) {
  if (responseRate >= 90) {
    return "응답 빠른 편";
  }

  if (responseRate >= 80) {
    return "대화 이어가기 좋아요";
  }

  if (responseRate >= 65) {
    return "천천히 답하는 편";
  }

  return "답장이 느릴 수 있어요";
}

function formatServiceNotice(notice: string) {
  if (notice.includes("체험") || notice.includes("anon key") || notice.includes("데모")) {
    return "체험 모드로 둘러보는 중이에요";
  }

  if (notice.includes("근처 친구 동기화 완료")) {
    return "근처 친구를 새로 확인했어요";
  }

  if (notice.includes("아직 근처 친구가 없어요")) {
    return "아직 근처 친구가 없어요";
  }

  if (notice.includes("대화/요청함 동기화 완료")) {
    return "대화와 요청함을 새로 확인했어요";
  }

  if (notice.includes("프로필 저장 완료")) {
    return "프로필이 저장됐어요. 위치를 허용하면 추천이 더 정확해져요.";
  }

  if (notice.includes("메시지 전송 완료")) {
    return "메시지를 보냈어요";
  }

  if (notice.includes("쪽지 요청 저장 완료")) {
    return "쪽지 요청을 보냈어요";
  }

  if (notice.includes("대화방 생성 완료")) {
    return "대화방이 열렸어요";
  }

  if (notice.includes("차단 해제 완료")) {
    return "차단을 해제했어요";
  }

  if (notice.includes("리워드 기록 완료")) {
    return "리워드가 반영됐어요";
  }

  if (
    notice.includes("Supabase") &&
    (notice.includes("필요") || notice.includes("failed") || notice.includes("not configured"))
  ) {
    return "새 내용을 반영하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  }

  return notice.replace(/Supabase에/g, "서비스에").replace(/Supabase\s*/g, "서비스 ").replace(/AdMob/g, "리워드 광고");
}

function formatReportDate(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "날짜 확인 중";
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function reportStatusLabel(status: ReportHistoryItem["status"]) {
  switch (status) {
    case "reviewing":
      return "검토 중";
    case "resolved":
      return "처리됨";
    case "dismissed":
      return "종결";
    case "open":
    default:
      return "접수";
  }
}

const styles = StyleSheet.create({
  appRoot: {
    backgroundColor: colors.canvas,
    flex: 1
  },
  avatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    justifyContent: "center"
  },
  avatarText: {
    color: colors.white,
    fontWeight: "800"
  },
  backendBand: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  backendText: {
    color: colors.mutedInk,
    flex: 1,
    fontSize: type.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  blockedProfileRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  actionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md
  },
  actionRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg
  },
  actionRowDanger: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg
  },
  actionSheet: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.lg,
    width: "100%",
    ...shadow
  },
  actionText: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: "800"
  },
  actionTextDanger: {
    color: colors.white,
    fontSize: type.body,
    fontWeight: "900"
  },
  actionTitle: {
    color: colors.ink,
    fontSize: type.h2,
    fontWeight: "900"
  },
  brandLockup: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md
  },
  centerModalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(28, 29, 31, 0.32)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg
  },
  chatHeader: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  chatContextContent: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  chatContextPill: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    height: 34,
    minHeight: 34,
    paddingHorizontal: spacing.md
  },
  chatContextPillSafe: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal
  },
  chatContextRail: {
    backgroundColor: colors.paper,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    height: 54,
    minHeight: 50
  },
  chatContextText: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: "800"
  },
  chatContextTextSafe: {
    color: colors.teal
  },
  chatScreen: {
    flex: 1
  },
  chatStatusBand: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 62,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  chatSearchBox: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg
  },
  chatSearchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: type.body,
    fontWeight: "700",
    minHeight: 44,
    padding: 0
  },
  checkbox: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  checkboxActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: colors.white,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  composerInput: {
    backgroundColor: colors.canvas,
    borderRadius: radius.lg,
    color: colors.ink,
    flex: 1,
    fontSize: type.body,
    maxHeight: 96,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  composerSafetyHint: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs
  },
  composerSafetyHintWarning: {
    backgroundColor: "#FCE8E8",
    borderTopColor: "#F1B7B7"
  },
  composerSafetyText: {
    color: colors.mutedInk,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  composerSafetyTextWarning: {
    color: colors.danger
  },
  disabledButton: {
    opacity: 0.42
  },
  emptyBody: {
    color: colors.mutedInk,
    fontSize: type.body,
    fontWeight: "600",
    lineHeight: 23,
    textAlign: "center"
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.tealSoft,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: "center",
    marginTop: -18,
    width: 42
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: type.h2,
    fontWeight: "900",
    textAlign: "center"
  },
  earnButton: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.sm,
    height: 52,
    justifyContent: "center"
  },
  earnButtonText: {
    color: colors.white,
    fontSize: type.body,
    fontWeight: "800"
  },
  characterCount: {
    alignSelf: "flex-end",
    color: colors.mutedInk,
    fontSize: type.caption,
    fontWeight: "700"
  },
  fill: {
    flex: 1
  },
  filterChip: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: spacing.lg
  },
  filterChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  filterText: {
    color: colors.ink,
    fontSize: type.caption,
    fontWeight: "900"
  },
  filterTextActive: {
    color: colors.white
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  headerTitle: {
    color: colors.ink,
    fontSize: type.h1,
    fontWeight: "800"
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
    ...shadow
  },
  icebreakerChip: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  icebreakerList: {
    gap: spacing.sm
  },
  icebreakerPanel: {
    backgroundColor: colors.canvas,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.md
  },
  interestPanel: {
    backgroundColor: colors.canvas,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.md
  },
  icebreakerText: {
    color: colors.ink,
    fontSize: type.caption,
    fontWeight: "700",
    lineHeight: 19
  },
  input: {
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.ink,
    fontSize: type.body,
    minHeight: 52,
    paddingHorizontal: spacing.lg
  },
  kicker: {
    color: colors.teal,
    fontSize: type.caption,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 2
  },
  locationBand: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow
  },
  locationIcon: {
    alignItems: "center",
    backgroundColor: colors.tealSoft,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  locationPermission: {
    alignItems: "center",
    backgroundColor: colors.tealSoft,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 68,
    padding: spacing.lg
  },
  locationTitle: {
    color: colors.ink,
    fontSize: type.h2,
    fontWeight: "800"
  },
  matchMeterFill: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    height: "100%"
  },
  matchMeterTrack: {
    backgroundColor: colors.tealSoft,
    borderRadius: radius.pill,
    flex: 1,
    height: 7,
    overflow: "hidden"
  },
  matchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 2
  },
  matchScore: {
    color: colors.teal,
    fontSize: 11,
    fontWeight: "900",
    minWidth: 58,
    textAlign: "right"
  },
  hiddenMessagesNotice: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  messageBubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  messageBubbleStack: {
    gap: spacing.xs,
    maxWidth: "82%"
  },
  messageBubbleStackMine: {
    alignItems: "flex-end"
  },
  messageList: {
    flexGrow: 1,
    justifyContent: "flex-end",
    padding: spacing.lg
  },
  messageMetaText: {
    color: colors.mutedInk,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    paddingHorizontal: spacing.xs
  },
  messageMetaTextMine: {
    textAlign: "right"
  },
  messageMine: {
    backgroundColor: colors.teal
  },
  messageOther: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1
  },
  messagePreviewBox: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md
  },
  messageRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
    width: "100%"
  },
  messageRowMine: {
    justifyContent: "flex-end"
  },
  messageScroll: {
    flex: 1
  },
  messageSafetyButton: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  messageText: {
    color: colors.ink,
    fontSize: type.body,
    lineHeight: 23
  },
  messageTextMine: {
    color: colors.white
  },
  modalBackdrop: {
    backgroundColor: "rgba(28, 29, 31, 0.32)",
    flex: 1,
    justifyContent: "flex-end"
  },
  modalHandle: {
    alignSelf: "center",
    backgroundColor: colors.line,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.lg,
    width: 46
  },
  modalSheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl
  },
  modalTitle: {
    color: colors.ink,
    fontSize: type.h1,
    fontWeight: "900"
  },
  modalTitleCopy: {
    flex: 1,
    gap: spacing.xs
  },
  modalTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  neighborBody: {
    flex: 1,
    gap: spacing.xs
  },
  neighborActionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginTop: 2
  },
  neighborIntro: {
    color: colors.ink,
    fontSize: type.body,
    lineHeight: 20,
    paddingRight: spacing.xs
  },
  neighborMessageButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md
  },
  neighborMessageText: {
    color: colors.white,
    fontSize: type.caption,
    fontWeight: "900"
  },
  neighborMeta: {
    color: colors.mutedInk,
    fontSize: type.caption,
    fontWeight: "600"
  },
  neighborName: {
    color: colors.ink,
    fontSize: type.h2,
    fontWeight: "800"
  },
  neighborRow: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  neighborSignalPill: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 28,
    paddingHorizontal: spacing.sm
  },
  neighborSignalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  neighborSignalText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800"
  },
  neighborTagSummary: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  neighborTopLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  panelCaption: {
    color: colors.mutedInk,
    fontSize: type.caption,
    fontWeight: "600",
    lineHeight: 17
  },
  panelTitle: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: "800"
  },
  pendingBadge: {
    backgroundColor: colors.yellowSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  pendingBadgeText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900"
  },
  pendingActionButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  pendingActionGhost: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  pendingActions: {
    flexDirection: "row",
    gap: spacing.xs
  },
  pendingPanel: {
    backgroundColor: colors.canvas,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg
  },
  searchClearButton: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  searchEmptyState: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg
  },
  searchResultText: {
    backgroundColor: colors.canvas,
    color: colors.mutedInk,
    fontSize: type.caption,
    fontWeight: "800",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm
  },
  pendingRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  pressed: {
    opacity: 0.72
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    height: 54,
    justifyContent: "center",
    marginTop: spacing.sm
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: type.body,
    fontWeight: "800"
  },
  policyRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 62,
    padding: spacing.md
  },
  policyLinkButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.xs
  },
  policyLinkText: {
    color: colors.teal,
    fontSize: type.caption,
    fontWeight: "900"
  },
  policyNoticeBlock: {
    gap: spacing.sm,
    marginBottom: spacing.lg
  },
  policyNoticeDot: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    height: 6,
    marginTop: 7,
    width: 6
  },
  policyNoticeItem: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  policyNoticeScroll: {
    maxHeight: 360
  },
  policyReviewBand: {
    alignItems: "flex-start",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  policyText: {
    color: colors.ink,
    flex: 1,
    fontSize: type.caption,
    fontWeight: "700",
    lineHeight: 19
  },
  profileList: {
    gap: spacing.md
  },
  quickReplyBar: {
    backgroundColor: colors.white,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    height: 62,
    paddingVertical: spacing.sm
  },
  quickReplyChip: {
    backgroundColor: colors.tealSoft,
    borderRadius: radius.pill,
    height: 40,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  quickReplyContent: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md
  },
  quickReplyText: {
    color: colors.teal,
    fontSize: type.caption,
    fontWeight: "800"
  },
  profileName: {
    color: colors.ink,
    fontSize: type.h1,
    fontWeight: "900"
  },
  profileSummary: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg
  },
  radiusPanel: {
    alignItems: "center",
    backgroundColor: colors.tealSoft,
    borderRadius: radius.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.lg
  },
  recommendationBand: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  recommendationMetric: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 52
  },
  recommendReason: {
    color: colors.teal,
    fontSize: 11,
    fontWeight: "800"
  },
  metricPill: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    color: colors.white,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  radiusStepper: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.sm,
    padding: 4
  },
  radiusValue: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: "900",
    minWidth: 18,
    textAlign: "center"
  },
  rewardCaption: {
    color: colors.ink,
    fontSize: type.body,
    lineHeight: 21
  },
  rewardDot: {
    borderRadius: radius.pill,
    height: 14,
    width: 14
  },
  rewardHero: {
    alignItems: "center",
    backgroundColor: colors.yellowSoft,
    borderColor: "#F1D38A",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg
  },
  rewardIcon: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: radius.pill,
    height: 50,
    justifyContent: "center",
    width: 50
  },
  rewardList: {
    gap: spacing.md
  },
  rewardRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg
  },
  rewardTitle: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: "900"
  },
  rewardUseButton: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 2,
    height: 48,
    justifyContent: "center",
    width: 58
  },
  rewardUseText: {
    color: colors.white,
    fontSize: type.body,
    fontWeight: "900"
  },
  requestHelp: {
    color: colors.mutedInk,
    fontSize: type.body,
    fontWeight: "600",
    lineHeight: 23
  },
  requestSafetyBand: {
    alignItems: "center",
    backgroundColor: colors.tealSoft,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  requestSafetyBandWarning: {
    backgroundColor: "#FCE8E8"
  },
  requestSafetyText: {
    color: colors.ink,
    flex: 1,
    fontSize: type.caption,
    fontWeight: "800",
    lineHeight: 19
  },
  requestSafetyTextWarning: {
    color: colors.danger
  },
  requestInput: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.ink,
    fontSize: type.body,
    minHeight: 108,
    padding: spacing.lg,
    textAlignVertical: "top"
  },
  requestTitle: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md
  },
  reportIcon: {
    alignItems: "center",
    backgroundColor: "#FCE8E8",
    borderRadius: radius.pill,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  safeArea: {
    backgroundColor: colors.paper,
    flex: 1
  },
  safetyBand: {
    alignItems: "center",
    backgroundColor: colors.lilacSoft,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg
  },
  safetyEmptyState: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg
  },
  safetyDivider: {
    backgroundColor: colors.line,
    height: 1,
    marginVertical: spacing.xs
  },
  screenScroll: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.lg
  },
  sectionEyebrow: {
    color: colors.mutedInk,
    fontSize: type.caption,
    fontWeight: "800"
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: type.h2,
    fontWeight: "900"
  },
  sectionValue: {
    color: colors.teal,
    fontSize: type.caption,
    fontWeight: "900"
  },
  segmentButton: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  segmentButtonActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  segmentGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  segmentText: {
    color: colors.ink,
    fontSize: type.caption,
    fontWeight: "800"
  },
  segmentTextActive: {
    color: colors.white
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  sendButtonDisabled: {
    backgroundColor: colors.mutedInk,
    opacity: 0.5
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.tealSoft,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg
  },
  secondaryButtonText: {
    color: colors.teal,
    fontSize: type.body,
    fontWeight: "900"
  },
  settingIcon: {
    alignItems: "center",
    backgroundColor: colors.tealSoft,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  settingIconDanger: {
    backgroundColor: "#FCE8E8"
  },
  settingLabel: {
    color: colors.ink,
    flex: 1,
    fontSize: type.body,
    fontWeight: "800"
  },
  settingRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 58,
    paddingHorizontal: spacing.lg
  },
  settingValue: {
    color: colors.mutedInk,
    fontSize: type.caption,
    fontWeight: "800",
    maxWidth: "42%",
    textAlign: "right"
  },
  settingsGroup: {
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden"
  },
  smallIconButton: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  stepButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  tabBadge: {
    backgroundColor: colors.coral,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    right: 7,
    top: 7,
    width: 10
  },
  tabBar: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.sm,
    ...shadow
  },
  tabIconWrap: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 36,
    justifyContent: "center",
    position: "relative",
    width: 48
  },
  tabIconWrapActive: {
    backgroundColor: colors.ink
  },
  tabItem: {
    alignItems: "center",
    flex: 1,
    gap: 3,
    minHeight: 58,
    justifyContent: "center"
  },
  tabLabel: {
    color: colors.mutedInk,
    fontSize: 11,
    fontWeight: "800"
  },
  tabLabelActive: {
    color: colors.ink
  },
  tag: {
    backgroundColor: colors.canvas,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  tagText: {
    color: colors.mutedInk,
    fontSize: 11,
    fontWeight: "800"
  },
  tagMuted: {
    backgroundColor: colors.tealSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  tagMutedText: {
    color: colors.teal,
    fontSize: 11,
    fontWeight: "900"
  },
  threadChip: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    position: "relative"
  },
  threadChipActive: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal
  },
  threadChipText: {
    color: colors.ink,
    fontSize: type.caption,
    fontWeight: "800",
    paddingRight: spacing.xs
  },
  threadDraftBadge: {
    alignItems: "center",
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  threadDraftText: {
    color: colors.teal,
    fontSize: 10,
    fontWeight: "900"
  },
  threadRail: {
    backgroundColor: colors.canvas,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    minHeight: 70
  },
  threadRailContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  unreadDot: {
    backgroundColor: colors.coral,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 12,
    position: "absolute",
    right: 5,
    top: 4,
    width: 12
  },
  verifiedBadge: {
    alignItems: "center",
    backgroundColor: colors.tealSoft,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  verifiedText: {
    color: colors.teal,
    fontSize: 10,
    fontWeight: "900"
  }
});
