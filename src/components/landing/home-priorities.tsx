'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { FeedBadge } from '@/components/feed-badge'
import { EmptyState } from '@/components/empty-state'
import { ChartShell } from '@/components/chart-shell'
import { AnswerWordCloud } from '@/components/priorities/word-cloud'
import { conditionForFeed } from '@/lib/feed'
import { ALL_FEED_TYPES, labelForNewsDiet } from '@/components/landing/news-diet-options'
import type { FeedType } from '@/lib/types'
import { PRIORITY_THEMES } from '@/lib/types'
import { normalizePriorityThemeLabel } from '@/lib/priority-theme-display'
import { PRIORITIES_QUESTION_ID } from '@/lib/priorities-constants'

const CATEGORY_COLORS: Record<string, string> = {
  Economy: '#3b82f6',
  'Government/Leadership': '#8b5cf6',
  Immigration: '#f59e0b',
  Healthcare: '#10b981',
  'Crime/Violence': '#ef4444',
  Education: '#06b6d4',
  'Environment/Climate': '#22c55e',
  'National Security': '#f97316',
  'Race Relations': '#ec4899',
  'Poverty/Inequality': '#a78bfa',
  Other: '#71717a',
  'Declined to answer or unclear': '#52525b',
}

interface ThemeDistribution {
  category: string
  count: number
  pct: number
}

interface ModelRow {
  modelId: string
  modelName: string
  category: string | null
  raw: string | null
}

type Row = {
  model_id: string
  model_name: string
  feed_type: FeedType
  condition: string
  mip_category: string | null
  answer: string | null
}

function buildDistributions(responses: Row[]): Map<FeedType, ThemeDistribution[]> {
  const newDists = new Map<FeedType, ThemeDistribution[]>()

  for (const feedType of ALL_FEED_TYPES) {
    const need = conditionForFeed(feedType)
    const feedResponses = responses.filter(r => r.feed_type === feedType && r.condition === need)
    const total = feedResponses.length
    if (total === 0) continue

    const counts: Record<string, number> = {}
    for (const r of feedResponses) {
      const cat = normalizePriorityThemeLabel(r.mip_category)
      counts[cat] = (counts[cat] ?? 0) + 1
    }

    const dist: ThemeDistribution[] = PRIORITY_THEMES.map(cat => ({
      category: cat,
      count: counts[cat] ?? 0,
      pct: Math.round(((counts[cat] ?? 0) / total) * 100),
    })).sort((a, b) => b.pct - a.pct)

    newDists.set(feedType, dist)
  }

  return newDists
}

export function HomePriorities({ runId, feed }: { runId: string; feed: FeedType }) {
  const [allResponses, setAllResponses] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      const { data: survey } = await supabase
        .from('surveys')
        .select('id')
        .eq('question_id', PRIORITIES_QUESTION_ID)
        .eq('active', true)
        .maybeSingle()

      if (!survey || cancelled) {
        setAllResponses([])
        setLoading(false)
        return
      }

      const { data: responses } = await supabase
        .from('responses')
        .select('model_id, model_name, feed_type, mip_category, answer, condition')
        .eq('run_id', runId)
        .eq('survey_id', survey.id)

      if (!cancelled) {
        setAllResponses((responses as Row[]) ?? [])
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [runId])

  const distributions = useMemo(() => buildDistributions(allResponses), [allResponses])

  const currentDist = distributions.get(feed) ?? []

  const { modelRows, rawTexts } = useMemo(() => {
    const needSel = conditionForFeed(feed)
    const byModel = new Map<string, ModelRow>()
    for (const r of allResponses) {
      if (r.feed_type !== feed || r.condition !== needSel) continue
      if (!byModel.has(r.model_id)) {
        byModel.set(r.model_id, {
          modelId: r.model_id,
          modelName: r.model_name,
          category: normalizePriorityThemeLabel(r.mip_category),
          raw: r.answer,
        })
      }
    }
    const texts = allResponses
      .filter(
        r =>
          r.feed_type === feed &&
          r.condition === needSel &&
          r.answer &&
          r.answer.trim()
      )
      .map(r => r.answer as string)
    return {
      modelRows: [...byModel.values()].sort((a, b) => a.modelName.localeCompare(b.modelName)),
      rawTexts: texts,
    }
  }, [allResponses, feed])

  const feedComparisonData = useMemo(() => {
    return PRIORITY_THEMES.map(cat => {
      const row: Record<string, unknown> = { catFull: cat }
      for (const ft of ALL_FEED_TYPES) {
        const dist = distributions.get(ft)
        row[ft] = dist?.find(d => d.category === cat)?.pct ?? 0
      }
      return row
    }).filter(row => {
      const total = ALL_FEED_TYPES.reduce((s, ft) => s + (row[ft] as number), 0)
      return total > 0
    })
  }, [distributions])

  const dietLabel = labelForNewsDiet(feed)

  return (
    <details id="priorities" className="scroll-mt-20 group/p rounded-lg border border-zinc-800 bg-zinc-900/20 overflow-hidden">
      <summary className="px-4 py-3 cursor-pointer list-none flex items-start gap-2 hover:bg-zinc-900/40 [&::-webkit-details-marker]:hidden">
        <span className="text-zinc-600 mt-0.5 shrink-0 transition-transform group-open/p:rotate-90">▸</span>
        <div className="min-w-0 text-left">
          <h2 className="text-sm font-medium text-zinc-100">Priorities - most important national issue</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Same news diet as the questions below (selector above). Themes, word cloud, and per-model text for that
            slice.
          </p>
        </div>
      </summary>

      <div className="px-4 pb-4 pt-2 border-t border-zinc-800/80 space-y-4">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading priorities…</div>
        ) : currentDist.length === 0 && rawTexts.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="No priorities data for this run yet."
          />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
              <div className="rounded border border-zinc-800 p-4 min-w-0">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Classified themes
                </h3>
                <p className="text-xs text-zinc-600 mb-3">{dietLabel} · share of labeled answers</p>
                {currentDist.some(d => d.pct > 0) ? (
                  <ChartShell h={260}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={currentDist} layout="vertical" margin={{ left: 140, right: 24 }}>
                        <XAxis
                          type="number"
                          tick={{ fill: '#71717a', fontSize: 11 }}
                          axisLine={{ stroke: '#3f3f46' }}
                          tickLine={false}
                          tickFormatter={v => `${v}%`}
                          domain={[0, 'auto']}
                        />
                        <YAxis
                          type="category"
                          dataKey="category"
                          tick={{ fill: '#a1a1aa', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          width={135}
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#18181b',
                            border: '1px solid #3f3f46',
                            borderRadius: 6,
                            fontSize: 11,
                          }}
                          formatter={v => `${v}%`}
                        />
                        <Bar dataKey="pct" name="Models" radius={[0, 2, 2, 0]} barSize={12}>
                          {currentDist.map(entry => (
                            <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] ?? '#71717a'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartShell>
                ) : (
                  <p className="text-xs text-zinc-600 py-10 text-center">
                    Theme labels are not available for this feed yet - try another diet above.
                  </p>
                )}
              </div>

              <div className="rounded border border-zinc-800 p-4 min-w-0 flex flex-col">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Raw answers</h3>
                <p className="text-xs text-zinc-600 mb-3">Word sizes by frequency</p>
                <div className="flex-1 rounded border border-zinc-800/80 bg-zinc-950/40 min-h-[260px] min-w-0">
                  <AnswerWordCloud texts={rawTexts} />
                </div>
              </div>
            </div>

            {modelRows.length > 0 && (
              <div className="rounded border border-zinc-800 overflow-hidden">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3 border-b border-zinc-800 bg-zinc-900/40">
                  Model · classified · raw ({dietLabel})
                </div>
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-950/80 sticky top-0">
                        <th className="text-left px-3 py-2 text-zinc-500 font-medium">Model</th>
                        <th className="text-left px-3 py-2 text-zinc-500 font-medium w-[28%]">Classified</th>
                        <th className="text-left px-3 py-2 text-zinc-500 font-medium">Raw answer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {modelRows.map(row => (
                        <tr key={row.modelId} className="hover:bg-zinc-900/30 align-top">
                          <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{row.modelName}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: CATEGORY_COLORS[row.category ?? ''] ?? '#71717a',
                                }}
                              />
                              <span
                                className={
                                  row.category === 'Declined to answer or unclear'
                                    ? 'text-zinc-500'
                                    : 'text-emerald-400/95'
                                }
                              >
                                {row.category}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-zinc-400 leading-relaxed">{row.raw ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {feedComparisonData.length > 0 && distributions.size > 1 && (
              <div className="rounded border border-zinc-800 p-4">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                  How diets shift themes
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 pr-4 text-zinc-500 font-medium w-40">Theme</th>
                        {ALL_FEED_TYPES.map(ft => (
                          <th key={ft} className="text-right px-3 py-2 text-zinc-500 font-medium">
                            <FeedBadge feedType={ft} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {feedComparisonData.map(row => (
                        <tr key={String(row.catFull)} className="hover:bg-zinc-900/20">
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: CATEGORY_COLORS[String(row.catFull)] ?? '#71717a',
                                }}
                              />
                              <span className="text-zinc-300">{String(row.catFull)}</span>
                            </div>
                          </td>
                          {ALL_FEED_TYPES.map(ft => (
                            <td key={ft} className="px-3 py-2 text-right font-mono text-zinc-300">
                              {row[ft] as number}%
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  )
}
