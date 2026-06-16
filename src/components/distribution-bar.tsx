import { clsx } from 'clsx'

export interface DistributionSegment {
  name: string
  count: number
  color: string
}

/**
 * Compact hand-rolled stacked horizontal bar for an answer distribution. Used for per-model conviction
 * (e.g. "4× Somewhat / 1× Not very") and inline distributions in the digest. Lighter than a full chart.
 */
export function DistributionBar({
  segments,
  className,
  height = 8,
}: {
  segments: DistributionSegment[]
  className?: string
  height?: number
}) {
  const total = segments.reduce((s, seg) => s + seg.count, 0) || 1
  return (
    <div
      className={clsx('flex w-full overflow-hidden rounded-full bg-zinc-800/60', className)}
      style={{ height }}
    >
      {segments.map((seg, i) => (
        <div
          key={`${seg.name}-${i}`}
          title={`${seg.name}: ${seg.count}`}
          style={{ width: `${(seg.count / total) * 100}%`, background: seg.color }}
        />
      ))}
    </div>
  )
}
