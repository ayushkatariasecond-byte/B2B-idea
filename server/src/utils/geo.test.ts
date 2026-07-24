import { distanceMiles, boundingBox, hasCoords, matchesLocation, DEFAULT_RADIUS_MILES } from './geo';

// Real coordinates, so the distances below are checkable against reality rather than
// against whatever this implementation happens to produce.
const AUSTIN_DOWNTOWN = { latitude: 30.2672, longitude: -97.7431 };
const AUSTIN_ROUND_ROCK = { latitude: 30.5083, longitude: -97.6789 }; // ~17mi N of downtown
const AUSTIN_SAN_MARCOS = { latitude: 29.8833, longitude: -97.9414 }; // ~29mi SW of downtown
const DENVER = { latitude: 39.7392, longitude: -104.9903 }; // ~780mi away

describe('distanceMiles', () => {
  it('is zero for the same point', () => {
    expect(distanceMiles(AUSTIN_DOWNTOWN, AUSTIN_DOWNTOWN)).toBeCloseTo(0, 5);
  });

  it('matches known real-world distances', () => {
    // Round Rock is a genuine ~17 miles from downtown Austin.
    expect(distanceMiles(AUSTIN_DOWNTOWN, AUSTIN_ROUND_ROCK)).toBeGreaterThan(15);
    expect(distanceMiles(AUSTIN_DOWNTOWN, AUSTIN_ROUND_ROCK)).toBeLessThan(19);
    // Austin to Denver is ~780 miles.
    expect(distanceMiles(AUSTIN_DOWNTOWN, DENVER)).toBeGreaterThan(750);
    expect(distanceMiles(AUSTIN_DOWNTOWN, DENVER)).toBeLessThan(820);
  });

  it('is symmetric', () => {
    expect(distanceMiles(AUSTIN_DOWNTOWN, DENVER)).toBeCloseTo(distanceMiles(DENVER, AUSTIN_DOWNTOWN), 6);
  });
});

describe('hasCoords', () => {
  it('accepts a real pair', () => {
    expect(hasCoords(AUSTIN_DOWNTOWN)).toBe(true);
  });

  it('rejects missing, partial, and null coordinates', () => {
    expect(hasCoords(null)).toBe(false);
    expect(hasCoords(undefined)).toBe(false);
    expect(hasCoords({ latitude: null, longitude: null })).toBe(false);
    expect(hasCoords({ latitude: 30.26, longitude: null })).toBe(false);
    expect(hasCoords({ latitude: null, longitude: -97.74 })).toBe(false);
  });

  it('rejects 0,0 — the "null island" sentinel a half-filled row produces', () => {
    // Treating this as a real location would make every broken row match every other one.
    expect(hasCoords({ latitude: 0, longitude: 0 })).toBe(false);
  });

  it('rejects NaN and out-of-range values', () => {
    expect(hasCoords({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(hasCoords({ latitude: 91, longitude: 0 })).toBe(false);
    expect(hasCoords({ latitude: 0, longitude: 181 })).toBe(false);
  });
});

describe('boundingBox', () => {
  it('fully contains the radius circle it is built from', () => {
    const radius = DEFAULT_RADIUS_MILES;
    const box = boundingBox(AUSTIN_DOWNTOWN, radius);

    // The box must never cut off a point that is genuinely within the radius, or the SQL
    // prefilter would drop in-range restaurants before the exact test ever saw them.
    // Walk the full circle and assert every on-circle point lands inside the box.
    for (let bearing = 0; bearing < 360; bearing += 15) {
      const rad = (bearing * Math.PI) / 180;
      const latOffset = (radius / 69) * Math.cos(rad);
      const lonOffset = (radius / (69 * Math.cos((AUSTIN_DOWNTOWN.latitude * Math.PI) / 180))) * Math.sin(rad);
      const point = {
        latitude: AUSTIN_DOWNTOWN.latitude + latOffset,
        longitude: AUSTIN_DOWNTOWN.longitude + lonOffset,
      };
      expect(point.latitude).toBeGreaterThanOrEqual(box.minLat - 1e-9);
      expect(point.latitude).toBeLessThanOrEqual(box.maxLat + 1e-9);
      expect(point.longitude).toBeGreaterThanOrEqual(box.minLon - 1e-9);
      expect(point.longitude).toBeLessThanOrEqual(box.maxLon + 1e-9);
    }
  });

  it('stays within valid lat/long bounds near the poles', () => {
    const box = boundingBox({ latitude: 89.9, longitude: 0 }, 500);
    expect(box.maxLat).toBeLessThanOrEqual(90);
    expect(box.minLat).toBeGreaterThanOrEqual(-90);
    expect(box.minLon).toBeGreaterThanOrEqual(-180);
    expect(box.maxLon).toBeLessThanOrEqual(180);
  });
});

describe('matchesLocation', () => {
  const coordViewer = { city: 'Austin', ...AUSTIN_DOWNTOWN };

  it('matches a restaurant inside the radius', () => {
    const restaurant = { city: 'Round Rock', ...AUSTIN_ROUND_ROCK };
    expect(matchesLocation(coordViewer, restaurant)).toBe(true);
  });

  it('matches across differing city labels when the coordinates are close', () => {
    // The whole point of the radius: a viewer in Austin should see a Round Rock
    // restaurant 17 miles away, which the old exact city-string match would have hidden.
    const restaurant = { city: 'Round Rock', ...AUSTIN_ROUND_ROCK };
    expect(restaurant.city).not.toBe(coordViewer.city);
    expect(matchesLocation(coordViewer, restaurant)).toBe(true);
  });

  it('rejects a restaurant outside the radius', () => {
    const restaurant = { city: 'San Marcos', ...AUSTIN_SAN_MARCOS }; // ~29mi > 20mi radius
    expect(matchesLocation(coordViewer, restaurant)).toBe(false);
  });

  it('rejects a far-away restaurant even when the city string happens to match', () => {
    // Coordinates take precedence when both sides have them, so a same-named city in
    // another state can't sneak in.
    const restaurant = { city: 'Austin', ...DENVER };
    expect(matchesLocation(coordViewer, restaurant)).toBe(false);
  });

  it('respects a custom radius', () => {
    const restaurant = { city: 'San Marcos', ...AUSTIN_SAN_MARCOS };
    expect(matchesLocation(coordViewer, restaurant, 40)).toBe(true);
    expect(matchesLocation(coordViewer, restaurant, 10)).toBe(false);
  });

  // --- permission-denied / legacy fallback path ---

  it('falls back to exact city match when the viewer has no coordinates', () => {
    const viewer = { city: 'Austin', latitude: null, longitude: null };
    expect(matchesLocation(viewer, { city: 'Austin', ...AUSTIN_DOWNTOWN })).toBe(true);
    expect(matchesLocation(viewer, { city: 'Denver', ...DENVER })).toBe(false);
  });

  it('falls back to exact city match when the restaurant has no coordinates', () => {
    const restaurant = { city: 'Austin', latitude: null, longitude: null };
    expect(matchesLocation(coordViewer, restaurant)).toBe(true);
    expect(matchesLocation({ city: 'Denver', ...DENVER }, restaurant)).toBe(false);
  });

  it('falls back when neither side has coordinates (pre-feature accounts)', () => {
    const viewer = { city: 'Austin', latitude: null, longitude: null };
    const restaurant = { city: 'Austin', latitude: null, longitude: null };
    expect(matchesLocation(viewer, restaurant)).toBe(true);
  });

  it('compares fallback cities case- and whitespace-insensitively', () => {
    const viewer = { city: '  austin ', latitude: null, longitude: null };
    const restaurant = { city: 'Austin', latitude: null, longitude: null };
    expect(matchesLocation(viewer, restaurant)).toBe(true);
  });

  it('never matches on an empty city in the fallback path', () => {
    // Otherwise every account that skipped both location and city would match every other.
    const viewer = { city: '', latitude: null, longitude: null };
    const restaurant = { city: '', latitude: null, longitude: null };
    expect(matchesLocation(viewer, restaurant)).toBe(false);
  });
});
