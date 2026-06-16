'use client'

import { PANEL_OPTIONS, type PanelId } from '@/lib/panels'

export function PanelFilter({
  selected,
  onToggle,
  counts,
}: {
  selected: Set<PanelId>
  onToggle: (id: PanelId) => void
  counts?: Partial<Record<PanelId, number>>
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-500">Model panel:</span>
      {PANEL_OPTIONS.map(({ id, label, help }) => {
        const on = selected.has(id)
        const count = counts?.[id]
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            title={help}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              on
                ? 'border-zinc-100/40 text-zinc-100 bg-white/5'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            {label}
            {count != null && <span className="ml-1 text-zinc-500">({count})</span>}
          </button>
        )
      })}
      {selected.size === 0 && <span className="text-xs text-zinc-600">all models</span>}
    </div>
  )
}
