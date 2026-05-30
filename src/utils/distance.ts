export function clampRadius(radiusKm: number) {
  return Math.max(1, Math.min(radiusKm, 5));
}

export function formatDistance(distanceKm: number) {
  if (distanceKm < 0.6) {
    return "500m 이내";
  }

  if (distanceKm < 1) {
    return "1km 이내";
  }

  return `약 ${Math.round(distanceKm)}km`;
}

export function sortByDistance<T extends { distanceKm: number }>(items: T[]) {
  return [...items].sort((left, right) => left.distanceKm - right.distanceKm);
}
