import * as Location from "expo-location";

export type NeighborhoodLocation = {
  accuracyM?: number;
  latitude: number;
  longitude: number;
  label: string;
  permissionGranted: boolean;
};

export async function requestNeighborhoodLocation(): Promise<NeighborhoodLocation> {
  const fallback = {
    latitude: 0,
    longitude: 0,
    label: "위치 선택 전",
    permissionGranted: false
  };

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      return fallback;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });

    const [place] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    });

    const district = place?.district ?? place?.city ?? place?.region ?? "현재 위치 근처";

    return {
      accuracyM: position.coords.accuracy ?? undefined,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      label: district,
      permissionGranted: true
    };
  } catch {
    return fallback;
  }
}
