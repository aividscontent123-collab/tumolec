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
  shortDescription: string;
  developers: string[];
  releaseDate: { comingSoon: boolean; date: string } | null;
  screenshots: string[];
  trailerHlsUrl: string | null;
  trailerThumbnail: string | null;
  totalReviews: number;
};
