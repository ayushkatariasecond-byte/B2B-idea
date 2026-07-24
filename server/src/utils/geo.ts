/**
 * Distance helpers for Nibbler's location matching.
 *
 * Nibbler's feed is location-scoped: a viewer should only see restaurants that are
 * actually near enough to go eat at. Originally that was an exact city-string match;
 * it's now a real distance radius when both sides have coordinates, falling back to the
 * city string when either side doesn't (see `matchesLocation` below).
 *
 * No PostGIS: this app runs on a stock managed Postgres, and adding a spatial extension
 * for one radius check would be disproportionate. Instead the query layer prefilters with
 * a plain indexable lat/long bounding box (`boundingBox`) and this module does the exact
 * circle test (`distanceMiles`) on that much smaller candidate set.
 */

/** Default match radius. 20mi comfortably covers a metro area (the unit Nibbler thinks in)
 *  without spilling into a genuinely different city's restaurant scene. */
export const DEFAULT_RADIUS_MILES = 20;

const EARTH_RADIUS_MILES = 3958.8;

export interface Coords {
  latitude: number;
  longitude: number;
}

/** True only for a real, in-range coordinate pair. Guards against null/undefined (no
 *  permission granted), NaN, and the 0,0 "null island" sentinel that a buggy client or a
 *  half-filled row can produce — treating 0,0 as a real location would silently match
 *  every other broken row on the platform. */
export function hasCoords(value: { latitude?: number | null; longitude?: number | null } | null | undefined): value is Coords {
  if (!value) return false;
  const { latitude: lat, longitude: lon } = value;
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in miles (haversine). */
export function distanceMiles(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Lat/long bounds of the square that fully contains the radius circle around `center`.
 *
 * Used as a cheap, indexable SQL prefilter. It is deliberately *wider* than the real
 * circle (a square's corners reach further than its inscribed circle), so it can return
 * candidates that are actually out of range — `distanceMiles` then rejects those. The
 * direction of that error is what matters: the box never excludes anything the circle
 * would have included, so no in-range restaurant is lost by the prefilter.
 */
export function boundingBox(center: Coords, radiusMiles: number) {
  const latDelta = radiusMiles / 69; // ~69 miles per degree of latitude, everywhere

  // Degrees of longitude shrink toward the poles, so the span has to be divided by
  // cos(latitude). Clamped because that term approaches 0 at the poles and would blow the
  // span up to infinity; at |lat| that extreme the whole globe is within range anyway.
  const cosLat = Math.cos(toRad(center.latitude));
  const lonDelta = Math.abs(cosLat) < 0.01 ? 180 : radiusMiles / (69 * cosLat);

  return {
    minLat: Math.max(-90, center.latitude - latDelta),
    maxLat: Math.min(90, center.latitude + latDelta),
    minLon: Math.max(-180, center.longitude - Math.abs(lonDelta)),
    maxLon: Math.min(180, center.longitude + Math.abs(lonDelta)),
  };
}

export interface Locatable {
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * The single source of truth for "should this viewer see this restaurant".
 *
 * Coordinates win when BOTH sides have them — that's the real, intended behaviour.
 * Otherwise it falls back to the original exact city-string match, which keeps three
 * groups working: users who declined the location permission, accounts created before
 * this feature existed, and the seeded demo data. Falling back to "match nothing" would
 * have silently emptied those users' feeds; falling back to "match everything" would have
 * broken the city lock. The city string is compared case/whitespace-insensitively.
 */
export function matchesLocation(viewer: Locatable, restaurant: Locatable, radiusMiles = DEFAULT_RADIUS_MILES): boolean {
  if (hasCoords(viewer) && hasCoords(restaurant)) {
    return distanceMiles(viewer, restaurant) <= radiusMiles;
  }
  const viewerCity = (viewer.city ?? '').trim().toLowerCase();
  const restaurantCity = (restaurant.city ?? '').trim().toLowerCase();
  if (!viewerCity || !restaurantCity) return false;
  return viewerCity === restaurantCity;
}
