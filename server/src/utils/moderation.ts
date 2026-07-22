/** Distinct reporters a post/comment needs before it's auto-hidden pending admin review. */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;

/**
 * Starting-point denylist for obvious spam/scam patterns in captions and comments.
 * Case-insensitive substring match. Add to this list as real abuse patterns show up —
 * this is deliberately not trying to be a comprehensive profanity filter.
 */
const BLOCKED_PATTERNS = [
  'buy followers',
  'buy likes',
  'free followers',
  'wire transfer',
  'click here to claim',
  'guaranteed profit',
  'work from home dm me',
];

export function containsBlockedContent(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED_PATTERNS.some((pattern) => lower.includes(pattern));
}
