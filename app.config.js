const androidAdMobAppId =
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || "ca-app-pub-3940256099942544~3347511713";
const iosAdMobAppId =
  process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || "ca-app-pub-3940256099942544~1458002511";

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: androidAdMobAppId,
        iosAppId: iosAdMobAppId,
        userTrackingUsageDescription:
          "사용자의 선택에 따라 더 관련성 높은 광고와 보상형 광고를 제공하기 위해 기기 광고 식별자를 사용할 수 있습니다."
      }
    ]
  ],
  extra: {
    ...config.extra,
    admob: {
      androidAppId: androidAdMobAppId,
      iosAppId: iosAdMobAppId
    }
  }
});
