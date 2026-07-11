/** Subset of steam_cache/{steamAppId} used by swipe UI components.
 * Full model: work/active/Tumolec.md w vaulcie Obsidian. */
export type SwipeGame = {
  steamAppId: number;
  title: string;
  /** Steam CDN header image URL. Undefined -> render placeholder cover. */
  coverImageUrl?: string;
  tags: string[];
  reviewScorePercent: number;
  reviewSummary: string;
};
