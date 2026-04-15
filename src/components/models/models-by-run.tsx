'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import type { ModelRegistry, Run } from '@/lib/types'

const ORIGIN_FLAGS: Record<string, string> = {
  US: '🇺🇸',
  China: '🇨🇳',
  France: '🇫🇷',
  Canada: '🇨🇦',
  Israel: '🇮🇱',
  UAE: '🇦🇪',
  UK: '🇬🇧',
}

export function ModelsByRun({ models, runs }: { models: ModelRegistry[]; runs: Run[] }) {
  const [runId, setRunId] = useState<string | null>(runs[0]?.id ?? null)

  const inRun = useMemo(() => {
    const run = runs.find(r => r.id === runId)
    if (!run?.model_list?.length) return null
    const set = new Set(run.model_list)
    return models.filter(m => set.has(m.id))
  }, [runs, runId, models])

  const byProvider = useMemo(() => {
    const list = inRun ?? models
    const map = new Map<string, ModelRegistry[]>()
    for (const m of list) {
      if (!map.has(m.provider)) map.set(m.provider, [])
      map.get(m.provider)!.push(m)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [inRun, models])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Models</h1>
          <p className="text-sm text-zinc-500">Registry. Filter by run for participation.</p>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Run</label>
          <select
            value={runId ?? ''}
            onChange={e => setRunId(e.target.value || null)}
            className="bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 rounded px-3 py-2 min-w-[220px] focus:outline-none focus:border-zinc-500"
          >
            <option value="">Full registry ({models.length})</option>
            {runs.map(r => (
              <option key={r.id} value={r.id}>
                {format(new Date(r.run_date), 'MMM d, yyyy HH:mm')} - {r.model_list?.length ?? 0} models
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-6">
        {byProvider.map(([provider, providerModels]) => (
          <div key={provider}>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              {provider}
              <span className="text-zinc-600 font-normal normal-case ml-2">({providerModels.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {providerModels.map(model => (
                <Link
                  key={model.id}
                  href={`/models/${encodeURIComponent(model.id)}`}
                  className={`block rounded border p-3 hover:bg-zinc-900/60 transition-all ${
                    model.active
                      ? 'border-zinc-800 bg-zinc-900/20'
                      : 'border-zinc-800/40 bg-zinc-900/10 opacity-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-white leading-tight">{model.display_name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {model.origin && (
                        <span title={model.origin}>{ORIGIN_FLAGS[model.origin] ?? '🌐'}</span>
                      )}
                      {model.active ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Active" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" title="Inactive" />
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-600 font-mono truncate mb-1">{model.id}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {model.parameter_count && model.parameter_count !== 'unknown' && (
                      <span className="text-xs text-zinc-500">{model.parameter_count}</span>
                    )}
                    {model.context_length && (
                      <span className="text-xs text-zinc-500">
                        {(model.context_length / 1000).toFixed(0)}K ctx
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {models.length === 0 && (
          <p className="text-sm text-zinc-500 py-12 text-center">No models in the registry yet.</p>
        )}
      </div>
    </div>
  )
}
