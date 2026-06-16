'use client'

import { useEffect, useMemo, useState } from 'react'
import { HomePriorities } from '@/components/landing/home-priorities'
import { HomeQuestions } from '@/components/landing/home-questions'
import { PanelFilter } from '@/components/landing/panel-filter'
import { NEWS_DIET_OPTIONS } from '@/components/landing/news-diet-options'
import { supabase } from '@/lib/supabase'
import { allowedModelIds, buildPanelMap, type PanelId, type PanelMeta } from '@/lib/panels'
import type { Survey, Response, FeedType } from '@/lib/types'

export function HomeAllQuestions({
  runId,
  surveys,
  responses,
}: {
  runId: string
  surveys: Survey[]
  responses: Response[]
}) {
  const [feed, setFeed] = useState<FeedType>('none')
  const [panels, setPanels] = useState<Set<PanelId>>(new Set())
  const [panelMap, setPanelMap] = useState<Map<string, PanelMeta>>(new Map())

  useEffect(() => {
    let cancelled = false
    supabase
      .from('model_registry')
      .select('id, anchor_lab, usage_rank, open_weights')
      .then(({ data }) => {
        if (!cancelled && data) setPanelMap(buildPanelMap(data))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const togglePanel = (id: PanelId) =>
    setPanels(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const allowed = useMemo(() => allowedModelIds(panelMap, panels), [panelMap, panels])

  const filteredResponses = useMemo(
    () => (allowed ? responses.filter(r => allowed.has(r.model_id)) : responses),
    [responses, allowed]
  )

  // Counts of models in the current run per panel (for the filter labels).
  const counts = useMemo(() => {
    const runModelIds = new Set(responses.map(r => r.model_id))
    let anchors = 0,
      open = 0,
      usage = 0
    for (const id of runModelIds) {
      const meta = panelMap.get(id)
      if (!meta) continue
      if (meta.anchor) anchors++
      if (meta.open) open++
      if (meta.usage) usage++
    }
    return { anchors, open, usage }
  }, [responses, panelMap])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">News diet for charts:</span>
          {NEWS_DIET_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFeed(id)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                feed === id
                  ? 'border-zinc-100/40 text-zinc-100 bg-white/5'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <PanelFilter selected={panels} onToggle={togglePanel} counts={counts} />
      </div>

      <HomePriorities runId={runId} feed={feed} allowedModelIds={allowed} />
      <HomeQuestions surveys={surveys} responses={filteredResponses} feed={feed} />
    </div>
  )
}
