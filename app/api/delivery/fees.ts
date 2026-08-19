export type Coordinates = { latitude: number; longitude: number };

export function readCoordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== "object") return null;
  const { latitude, longitude } = value as Record<string, unknown>;
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

const radians = (degrees: number) => degrees * Math.PI / 180;

export function calculateDistanceMeters(from: Coordinates, to: Coordinates) {
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateDeliveryFeePaise(distanceMeters: number, baseFeePaise = 1000, per100MetersPaise = 100) {
  const extraBlocks = Math.max(0, Math.ceil((distanceMeters - 1500) / 100));
  return Math.max(0, baseFeePaise) + extraBlocks * Math.max(0, per100MetersPaise);
}
