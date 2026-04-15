import type { FeedType } from '@/lib/types'

/** Single source of truth - same labels as everywhere else under “All questions”. */
export const NEWS_DIET_OPTIONS: { id: FeedType; label: string }[] = [
  { id: 'none', label: 'Baseline' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
]

export function labelForNewsDiet(id: FeedType): string {
  return NEWS_DIET_OPTIONS.find(o => o.id === id)?.label ?? id
}

export const ALL_FEED_TYPES: FeedType[] = ['none', 'balanced', 'left', 'right']
