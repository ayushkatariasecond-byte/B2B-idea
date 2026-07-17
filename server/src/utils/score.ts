export interface ScoreInputs {
  caption: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
}

/**
 * Creativity score is computed live from post content + engagement so it moves
 * as a post actually performs, rather than being a fixed value set at creation.
 */
export function computeCreativityScore({ caption, likeCount, commentCount, shareCount }: ScoreInputs): number {
  let score = 40;

  const trimmed = caption.trim();
  if (trimmed.length >= 40) score += 10;
  if (/[!?]/.test(trimmed)) score += 5;
  if (trimmed.length >= 100) score += 5;

  const engagementWeight = likeCount * 1 + commentCount * 2 + shareCount * 3;
  const engagementBoost = Math.min(40, Math.floor(Math.log2(engagementWeight + 1) * 6));
  score += engagementBoost;

  return Math.max(0, Math.min(100, score));
}

export const TRENDING_THRESHOLD = 85;
