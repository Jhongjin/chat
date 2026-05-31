import { Platform } from "react-native";

type EarnedReward = {
  amount: number;
  type: string;
};

type RewardedAdVerificationOptions = {
  customData: string;
  userId: string;
};

export type RewardedAdResult =
  | {
      ok: true;
      reward: EarnedReward;
      source: "admob" | "development";
    }
  | {
      ok: false;
      error: string;
      source: "admob" | "development";
    };

let initialized = false;

export async function showRewardedAd(
  verificationOptions?: RewardedAdVerificationOptions
): Promise<RewardedAdResult> {
  if (Platform.OS === "web") {
    await wait(900);
    return {
      ok: true,
      reward: { amount: 1, type: "credit" },
      source: "development"
    };
  }

  try {
    const ads = await import("react-native-google-mobile-ads");
    const mobileAds = ads.default;

    if (!initialized) {
      await mobileAds().setRequestConfiguration({
        maxAdContentRating: ads.MaxAdContentRating.PG,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
        testDeviceIdentifiers: ["EMULATOR"]
      });
      await mobileAds().initialize();
      initialized = true;
    }

    const adUnitId = getRewardedAdUnitId(ads.TestIds.REWARDED);
    const rewarded = ads.RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
      serverSideVerificationOptions: verificationOptions
    });

    return await new Promise<RewardedAdResult>((resolve) => {
      let earnedReward: EarnedReward | null = null;
      let settled = false;
      const unsubscribe: Array<() => void> = [];

      const cleanup = () => {
        unsubscribe.forEach((remove) => remove());
      };

      const settle = (result: RewardedAdResult) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        cleanup();
        resolve(result);
      };

      const timeout = setTimeout(() => {
        settle({
          ok: false,
          error: "리워드 광고를 불러오는 데 시간이 오래 걸리고 있어요.",
          source: "admob"
        });
      }, 15000);

      unsubscribe.push(
        rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
          void rewarded.show().catch((error: unknown) => {
            settle({
              ok: false,
              error: error instanceof Error ? error.message : "리워드 광고를 표시하지 못했어요.",
              source: "admob"
            });
          });
        })
      );
      unsubscribe.push(
        rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, (reward) => {
          earnedReward = {
            amount: typeof reward.amount === "number" ? reward.amount : 1,
            type: reward.type || "credit"
          };
        })
      );
      unsubscribe.push(
        rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => {
          if (earnedReward) {
            settle({ ok: true, reward: earnedReward, source: "admob" });
          } else {
            settle({
              ok: false,
              error: "광고 시청이 완료되지 않아 보상을 지급하지 않았어요.",
              source: "admob"
            });
          }
        })
      );
      unsubscribe.push(
        rewarded.addAdEventListener(ads.AdEventType.ERROR, (error) => {
          settle({
            ok: false,
            error: error?.message ?? "리워드 광고를 불러오지 못했어요.",
            source: "admob"
          });
        })
      );

      rewarded.load();
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "리워드 광고 모듈을 초기화하지 못했어요.",
      source: "admob"
    };
  }
}

function getRewardedAdUnitId(testAdUnitId: string) {
  if (__DEV__) {
    return testAdUnitId;
  }

  const configured =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID
      : process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID;

  return configured || testAdUnitId;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
