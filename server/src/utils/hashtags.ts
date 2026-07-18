/** Extracts unique lowercase hashtags (without the #) from a caption, e.g. "#B2B" and "#b2b" both become "b2b". */
export function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#(\w{2,50})/g) ?? [];
  const tags = matches.map((m) => m.slice(1).toLowerCase());
  return Array.from(new Set(tags));
}
