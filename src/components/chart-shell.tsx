import type { ReactNode } from 'react'
import { clsx } from 'clsx'

/** Recharts measures the parent; flex/grid children need min-w-0 or width collapses to 0. */
export function ChartShell({
  h,
  className,
  children,
}: {
  h: number
  className?: string
  children: ReactNode
}) {
  return (
    <div className={clsx('w-full min-w-0 shrink-0', className)} style={{ height: h }}>
      {children}
    </div>
  )
}
