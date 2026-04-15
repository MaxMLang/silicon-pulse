import { clsx } from 'clsx'
import type { FeedType } from '@/lib/types'

const FEED_STYLES: Record<FeedType, string> = {
  balanced: 'bg-zinc-800/80 text-zinc-200 border-zinc-600',
  left: 'bg-zinc-800/80 text-zinc-300 border-zinc-600',
  right: 'bg-zinc-800/80 text-zinc-300 border-zinc-600',
  none: 'bg-zinc-900 text-zinc-400 border-zinc-700',
}

const FEED_LABELS: Record<FeedType, string> = {
  balanced: 'Balanced',
  left: 'Left-leaning',
  right: 'Right-leaning',
  none: 'Baseline',
}

interface FeedBadgeProps {
  feedType: FeedType
  size?: 'sm' | 'md'
}

export function FeedBadge({ feedType, size = 'sm' }: FeedBadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center rounded border font-medium',
      size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1',
      FEED_STYLES[feedType]
    )}>
      {FEED_LABELS[feedType]}
    </span>
  )
}
