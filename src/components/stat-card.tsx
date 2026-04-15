import { clsx } from 'clsx'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}

export function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div className={clsx(
      'rounded border p-4',
      accent ? 'border-zinc-100/25 bg-zinc-100/5' : 'border-zinc-800 bg-zinc-900'
    )}>
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={clsx(
        'text-2xl font-bold font-mono tabular-nums',
        accent ? 'text-zinc-200' : 'text-white'
      )}>
        {value}
      </div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  )
}
