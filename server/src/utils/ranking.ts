/**
 * Ranking helpers for the "For You" feed.
 *
 * The base `computeCreativityScore` (see ./score.ts) is a static-ish quality signal:
 * it looks at caption quality and raw engagement totals, but it has no notion of
 * *time*. Left alone, that means an old post that racked up 500 likes over three
 * months will permanently outrank everything newer, and the feed stops feeling
 * "live." Everything in this file exists to layer time-awareness, personalization,
 * and result diversity on top of that base score, without touching score.ts itself
 * (which is also used for the trending badge and Discover, where a non-time-decayed
 * signal is the correct behavior).
 */

/** Age (hours) beyond which the recency/velocity boosts are effectively zero. Not enforced as a hard cutoff — just documents intent. */
const RECENCY_HALF_LIFE_HOURS = 36;

/**
 * Exponential decay reward for freshness. A brand-new post gets +30; by ~36h it has
 * decayed to ~11, and by a few days it's essentially 0. Exponential (rather than linear)
 * decay means the feed doesn't have a hard cliff at some arbitrary age — freshness fades
 * smoothly, which is what "fast-moving feed" actually feels like to a user.
 */
export function recencyBoost(ageHours: number): number {
  const clamped = Math.max(0, ageHours); // clamp in case createdAt is ever in the future (clock skew, test fixtures, etc.)
  return 30 * Math.exp(-clamped / RECENCY_HALF_LIFE_HOURS);
}

/**
 * Rewards posts that are accumulating engagement FAST, not just posts with a lot of
 * engagement in absolute terms. A post with 100 likes over 30 days is not "trending" —
 * a post with 20 likes in its first hour is. We reuse score.ts's own like/comment/share
 * weighting (1/2/3) so the two signals stay conceptually consistent, then divide by
 * age-in-hours (+2 as a floor so a 5-minute-old post doesn't produce a divide-by-near-zero
 * spike) to get a per-hour rate. Capped at +20 so raw velocity alone can never dominate
 * the base creativity score.
 */
export function velocityBoost(likeCount: number, commentCount: number, shareCount: number, ageHours: number): number {
  const weightedEngagement = likeCount * 1 + commentCount * 2 + shareCount * 3;
  const clamped = Math.max(0, ageHours);
  const velocity = weightedEngagement / (clamped + 2);
  return Math.min(20, velocity * 3);
}

/**
 * Deterministic string hash (djb2 variant). We need jitter that's stable for a given
 * (viewer, post, hour) triple but varies across those dimensions — Math.random() would
 * make the feed reorder on every single request (bad UX, impossible to test), while a
 * fixed jitter shared by all viewers would just be another static score term. Hashing
 * the tuple gives us "random-looking but reproducible" behavior with no dependencies.
 */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // >>> 0 forces an unsigned 32-bit result so the modulo below is never negative.
  return hash >>> 0;
}

/**
 * Small deterministic jitter in [-4, 4], used purely for exploration: without it, the
 * feed would be perfectly deterministic and the same handful of top posts would always
 * bubble up for everyone, starving newer/lower-scored-but-decent posts of any visibility.
 * Seeded by viewer + post + hour bucket so:
 *   - the same viewer sees a stable order within an hour (no flicker on refresh),
 *   - the order rotates hour to hour (posts get repeated exploration chances),
 *   - different viewers get different jitter (no single global "exploration ordering").
 */
export function explorationJitter(viewerId: string | undefined, postId: string, hourBucket: number): number {
  const seed = `${viewerId ?? 'anon'}:${postId}:${hourBucket}`;
  const hashed = hashString(seed);
  // Map hash to an integer in [-4, 4] (9 possible values).
  return (hashed % 9) - 4;
}

/** Convenience for callers: the current hour bucket, used as the jitter seed's time component. */
export function currentHourBucket(now: number = Date.now()): number {
  return Math.floor(now / 3_600_000);
}

/**
 * Greedy diversity re-rank: given posts already sorted by finalScore desc (tiebreak
 * createdAt desc), ensure no single business occupies more than `maxPerBusiness` slots
 * within any single `pageSize`-sized window of the *output*. Without this, a prolific/
 * high-scoring business can flood an entire page of the feed, which feels spammy even
 * when every individual post legitimately scored well. Posts that would exceed the cap
 * in the window they'd naturally land in are deferred to the next window (not dropped),
 * so they still surface — just spread across pages instead of piled onto one.
 *
 * This is windowed (re-applies the per-business cap to every consecutive `pageSize`
 * chunk of the output, not just the first one) rather than a single split into
 * "page 1 vs. the rest," because the in-memory pagination in the feed route re-slices
 * this same diversified array for page 2, page 3, etc. — if we only fixed up the first
 * window, a business's overflow would just re-cluster on page 2 instead.
 *
 * Never discards a post — every input post appears exactly once in the output — so
 * pagination over the full (diversified) result set still returns every candidate
 * eventually.
 */
export function diversify<T extends { businessId: string }>(posts: T[], maxPerBusiness: number, pageSize: number): T[] {
  if (maxPerBusiness <= 0 || pageSize <= 0) return posts; // degenerate config: no-op rather than looping forever

  const remaining = [...posts];
  const result: T[] = [];

  while (remaining.length > 0) {
    const countsInWindow = new Map<string, number>();
    let placedInWindow = 0;
    let cursor = 0;

    // Scan left-to-right, taking the highest-scoring eligible post for this window and
    // skipping over (deferring) any post whose business already hit the cap in this
    // window. Deferred posts stay in `remaining` for the next window's pass.
    while (cursor < remaining.length && placedInWindow < pageSize) {
      const post = remaining[cursor];
      const countSoFar = countsInWindow.get(post.businessId) ?? 0;
      if (countSoFar < maxPerBusiness) {
        result.push(post);
        countsInWindow.set(post.businessId, countSoFar + 1);
        placedInWindow++;
        remaining.splice(cursor, 1); // remove — do not advance cursor, next item slides into place
      } else {
        cursor++; // leave it in `remaining`, try the next candidate
      }
    }
    // Every business's first post in a window always has countSoFar === 0 < maxPerBusiness
    // (since maxPerBusiness > 0 is guaranteed above), so placedInWindow always advances by
    // at least 1 whenever remaining is non-empty — no risk of an infinite outer loop.
  }

  return result;
}
