import type { FeedType } from './types'

/** Baseline (no news) uses condition baseline; news diets use informed + that feed. */
export function conditionForFeed(feed: FeedType): 'baseline' | 'informed' {
  return feed === 'none' ? 'baseline' : 'informed'
}
