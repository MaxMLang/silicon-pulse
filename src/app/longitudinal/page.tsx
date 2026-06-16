'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid, ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { countsToPercents } from '@/lib/parse'
import { conditionForFeed } from '@/lib/feed'
import { FeedBadge } from '@/components/feed-badge'
import { EmptyState } from '@/components/empty-state'
import { ChartShell } from '@/components/chart-shell'
import {
  colorMap, AXIS_TICK, AXIS_LINE, GRID_STROKE, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE,
} from '@/lib/chart-theme'
import type { Survey, FeedType } from '@/lib/types'
import { PRIORITY_THEMES } from '@/lib/types'
import { normalizePriorityThemeLabel } from '@/lib/priority-theme-display'
import { PRIORITIES_QUESTION_ID } from '@/lib/priorities-constants'
import {
  getAnchorConfig,
  historicalModelIdsForLab,
} from '@/lib/anchor-models'

const FEED_TYPES: FeedType[] = ['none', 'balanced', 'left', 'right']
const FEED_LABELS: Record<FeedType, string> = {
  none: 'Baseline',
  balanced: 'Balanced',
  left: 'Left-leaning',
  right: 'Right-leaning',
}

interface RunPoint {
  runId: string
  runDate: string
  feedType: FeedType
  answerDist: Record<string, number>
  modelCount: number
  /** Set when view is per-lab flagship (see About: Flagship anchors). */
  anchorLab?: string
}

/** Open priorities item: chart/table use classifier themes, not raw free text. */
function isOpenPrioritiesSurvey(s: Survey): boolean {
  return !s.options?.length || s.question_id === PRIORITIES_QUESTION_ID
}

/** Multi-line trend: one line per answer option (or theme), share % on Y, run date on X. */
function TrendChart({
  data,
  options,
  colors,
  handoffRefs = [],
}: {
  data: Record<string, string | number>[]
  options: string[]
  colors: Record<string, string>
  handoffRefs?: { x: string; label: string }[]
}) {
  return (
    <ChartShell h={300}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="fullDate"
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickFormatter={v => format(new Date(String(v)), 'MMM d')}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `${v}%`}
            domain={[0, 100]}
            width={40}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            labelFormatter={(_l, payload) =>
              payload?.[0]?.payload?.fullDate
                ? format(new Date(String(payload[0].payload.fullDate)), 'MMM d, yyyy')
                : ''
            }
            formatter={(v, name) => [`${v ?? 0}%`, String(name ?? '')]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa', paddingTop: 8 }} />
          {handoffRefs.map((hr, hi) => (
            <ReferenceLine
              key={hi}
              x={hr.x}
              stroke="#a1a1aa"
              strokeDasharray="4 4"
              label={{ value: hr.label, fill: '#a1a1aa', fontSize: 10, position: 'insideTopRight' }}
            />
          ))}
          {options.map(opt => (
            <Line
              key={opt}
              type="monotone"
              dataKey={opt}
              name={opt}
              stroke={colors[opt]}
              strokeWidth={2}
              dot={{ r: 2.5, fill: colors[opt], strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Per-question comparison: rows = each lab's flagship, columns = runs, cell = that model's modal answer. */
function AnchorAnswerMatrix({
  anchorDefs,
  points,
  feedType,
  options,
  colors,
}: {
  anchorDefs: { lab: string; displayLabel: string }[]
  points: RunPoint[]
  feedType: FeedType
  options: string[]
  colors: Record<string, string>
}) {
  const scoped = points.filter(p => p.feedType === feedType && p.anchorLab != null)
  const dates = [...new Set(scoped.map(p => p.runDate))].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  )
  if (dates.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <FeedBadge feedType={feedType} />
        <span className="text-xs text-zinc-600">No flagship responses for this diet in the loaded runs.</span>
      </div>
    )
  }

  function modal(lab: string, date: string): { answer: string; share: number } | null {
    const pt = scoped.find(p => p.anchorLab === lab && p.runDate === date)
    if (!pt) return null
    let top = ''
    let topV = 0
    for (const o of options) {
      const v = pt.answerDist[o] ?? 0
      if (v > topV) {
        topV = v
        top = o
      }
    }
    return top ? { answer: top, share: Math.round(topV) } : null
  }

  return (
    <div className="min-w-0">
      <div className="mb-3">
        <FeedBadge feedType={feedType} />
        <span className="ml-2 text-xs text-zinc-500">{FEED_LABELS[feedType]}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-zinc-950 text-left text-zinc-500 font-medium px-2">Flagship</th>
              {dates.map(d => (
                <th key={d} className="text-zinc-500 font-medium px-1 whitespace-nowrap text-center">
                  {format(new Date(d), 'MMM d')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {anchorDefs.map(def => (
              <tr key={def.lab}>
                <th className="sticky left-0 z-10 bg-zinc-950 text-left text-zinc-300 font-medium px-2 whitespace-nowrap">
                  {def.displayLabel}
                </th>
                {dates.map(d => {
                  const c = modal(def.lab, d)
                  if (!c) {
                    return (
                      <td key={d} className="p-0">
                        <div className="min-w-[2.75rem] h-8 rounded bg-zinc-900/40 text-zinc-700 flex items-center justify-center">
                          ·
                        </div>
                      </td>
                    )
                  }
                  return (
                    <td key={d} className="p-0">
                      <div
                        className="min-w-[2.75rem] h-8 rounded flex items-center justify-center font-mono tabular-nums text-zinc-50"
                        style={{ backgroundColor: hexToRgba(colors[c.answer] ?? '#94a3b8', 0.3 + 0.65 * (c.share / 100)) }}
                        title={`${def.displayLabel} · ${format(new Date(d), 'MMM d, yyyy')}: ${c.answer} (${c.share}% of draws)`}
                      >
                        {c.share}%
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function LongitudinalPage() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null)
  const [runs, setRuns] = useState<RunPoint[]>([])
  const [selectedFeeds, setSelectedFeeds] = useState<FeedType[]>(['none', 'balanced'])
  const [viewMode, setViewMode] = useState<'pooled' | 'anchors'>('pooled')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('surveys').select('*').eq('active', true).order('question_id')
      .then(({ data }) => {
        setSurveys(data ?? [])
        if (data?.[0]) setSelectedSurvey(data[0])
      })
  }, [])

  useEffect(() => {
    if (!selectedSurvey) return
    setLoading(true)

    async function loadTimeSeries() {
      const { data: completedRuns } = await supabase
        .from('runs')
        .select('id, run_date')
        .eq('status', 'complete')
        .order('run_date', { ascending: true })

      if (!completedRuns?.length) {
        setRuns([])
        setLoading(false)
        return
      }

      const points: RunPoint[] = []
      const anchorCfg = getAnchorConfig()
      const survey = selectedSurvey!

      function pushFromResponses(
        raw: {
          feed_type: string
          answer: string | null
          condition: string
          mip_category: string | null
          model_id?: string | null
        }[],
        run: { id: string; run_date: string },
        anchorLab: string | undefined,
        modelFilter: Set<string> | null
      ) {
        const filtered = modelFilter
          ? raw.filter(r => r.model_id && modelFilter.has(r.model_id))
          : raw
        if (!filtered.length) return

        const openItem = isOpenPrioritiesSurvey(survey)
        const byFeed = new Map<string, { answer: string; mip: string | null }[]>()
        for (const r of filtered) {
          const ft = r.feed_type as FeedType
          if (r.condition !== conditionForFeed(ft)) continue
          if (!r.answer) continue
          if (!byFeed.has(r.feed_type)) byFeed.set(r.feed_type, [])
          byFeed.get(r.feed_type)!.push({
            answer: r.answer,
            mip: r.mip_category,
          })
        }

        for (const [feedType, rows] of byFeed) {
          const counts: Record<string, number> = {}
          if (openItem) {
            for (const row of rows) {
              const key = normalizePriorityThemeLabel(row.mip)
              counts[key] = (counts[key] ?? 0) + 1
            }
          } else {
            for (const row of rows) {
              counts[row.answer] = (counts[row.answer] ?? 0) + 1
            }
          }
          const pt: RunPoint = {
            runId: run.id,
            runDate: run.run_date,
            feedType: feedType as FeedType,
            answerDist: countsToPercents(counts),
            modelCount: rows.length,
          }
          if (anchorLab !== undefined) pt.anchorLab = anchorLab
          points.push(pt)
        }
      }

      await Promise.all(
        completedRuns.map(async (run: { id: string; run_date: string }) => {
          const { data: responses } = await supabase
            .from('responses')
            .select('feed_type, answer, condition, mip_category, model_id')
            .eq('run_id', run.id)
            .eq('survey_id', survey.id)
            .not('answer', 'is', null)

          if (!responses?.length) return

          if (viewMode === 'pooled') {
            pushFromResponses(responses, run, undefined, null)
          } else {
            for (const def of anchorCfg.anchors) {
              const allow = new Set(historicalModelIdsForLab(def))
              pushFromResponses(responses, run, def.lab, allow)
            }
          }
        })
      )

      points.sort((a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime())
      setRuns(points)
      setLoading(false)
    }

    loadTimeSeries()
  }, [selectedSurvey, viewMode])

  const segmentKeys = selectedSurvey
    ? isOpenPrioritiesSurvey(selectedSurvey)
      ? [...PRIORITY_THEMES]
      : selectedSurvey.options
    : []
  const optionColors = colorMap(segmentKeys as string[])

  /** One row per run date for a feed/scope: { fullDate, [option]: % share }. Used by the line chart. */
  function lineRowsForScope(feedType: FeedType, anchorLab?: string) {
    if (!selectedSurvey) return [] as Record<string, string | number>[]
    const scopeRuns = runs.filter(r => {
      if (r.feedType !== feedType) return false
      if (anchorLab !== undefined) return r.anchorLab === anchorLab
      return r.anchorLab == null
    })
    const dates = [...new Set(scopeRuns.map(r => r.runDate))].sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    )
    return dates.map(date => {
      const point = scopeRuns.find(r => r.runDate === date)
      const row: Record<string, string | number> = { fullDate: date }
      for (const opt of segmentKeys) {
        row[opt] = point ? Math.round(point.answerDist[opt] ?? 0) : 0
      }
      return row
    })
  }

  const anchorDefs = getAnchorConfig().anchors
  const hasChartableStack =
    !!selectedSurvey &&
    selectedFeeds.length > 0 &&
    (viewMode === 'pooled'
      ? selectedFeeds.some(ft => lineRowsForScope(ft).length > 0)
      : anchorDefs.some(def => selectedFeeds.some(ft => lineRowsForScope(ft, def.lab).length > 0)))

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white mb-1">Longitudinal View</h1>
        <p className="text-sm text-zinc-500">
          Track how model opinions shift across bi-weekly runs and news diets.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-start gap-6 mb-8">
        <div className="min-w-0 flex-1 max-w-3xl">
          <label className="text-xs text-zinc-500 block mb-2">Question</label>
          <select
            value={selectedSurvey?.question_id ?? ''}
            onChange={e => {
              const s = surveys.find(s => s.question_id === e.target.value)
              setSelectedSurvey(s ?? null)
            }}
            className="w-full max-w-full bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 rounded px-3 py-2 focus:outline-none focus:border-zinc-500"
            title={selectedSurvey?.question_text}
          >
            {surveys.map(s => (
              <option key={s.question_id} value={s.question_id} title={s.question_text}>
                {s.question_id} - {s.topic}
              </option>
            ))}
          </select>
          {selectedSurvey && (
            <p className="mt-2 text-sm text-zinc-300 leading-relaxed border border-zinc-800 rounded-md bg-zinc-900/50 px-3 py-2.5">
              {selectedSurvey.question_text}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs text-zinc-500 block mb-2">News diets</label>
          <div className="flex gap-2">
            {FEED_TYPES.map(ft => (
              <button
                key={ft}
                onClick={() =>
                  setSelectedFeeds(prev =>
                    prev.includes(ft) ? prev.filter(f => f !== ft) : [...prev, ft]
                  )
                }
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  selectedFeeds.includes(ft)
                    ? 'text-white border-zinc-600 bg-zinc-800'
                    : 'text-zinc-500 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {FEED_LABELS[ft]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-500 block mb-2">Aggregation</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setViewMode('pooled')}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                viewMode === 'pooled'
                  ? 'text-white border-zinc-600 bg-zinc-800'
                  : 'text-zinc-500 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              All models (pooled)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('anchors')}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                viewMode === 'anchors'
                  ? 'text-white border-zinc-600 bg-zinc-800'
                  : 'text-zinc-500 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              Flagship anchors
            </button>
          </div>
          <p className="text-[11px] text-zinc-600 mt-2 max-w-md leading-relaxed">
            <span className="text-zinc-500">
              One flagship model per major lab, chosen so time series stay comparable across runs.{' '}
              <strong className="text-zinc-400 font-medium">Vertical dividers</strong> mark{' '}
              <strong className="text-zinc-400 font-medium">handoffs</strong> when that lab&apos;s representative
              endpoint changed.{' '}
            </span>
            <Link
              href="/about#anchor-models"
              className="text-zinc-400 underline-offset-2 hover:underline hover:text-zinc-300"
            >
              How flagship anchors work
            </Link>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading time series...</div>
      ) : runs.length === 0 ? (
        <EmptyState
          title="No longitudinal data yet"
          description="Complete at least one survey run to see distributions over time. Data accumulates with each run."
        />
      ) : selectedFeeds.length === 0 ? (
        <p className="text-sm text-zinc-500">Select at least one news diet to see stacked bars.</p>
      ) : !hasChartableStack ? (
        <EmptyState
          title="No data for selected diets"
          description="Try other news diets, or wait for the next run - none of the selected diets have responses for this question yet."
        />
      ) : (
        <div className="space-y-8">
          <div className="rounded border border-zinc-800 p-6 min-w-0">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              {viewMode === 'anchors'
                ? 'How each flagship answered, by run'
                : selectedSurvey && isOpenPrioritiesSurvey(selectedSurvey)
                  ? 'Classified theme share over time'
                  : 'Answer share over time'}
            </h2>
            <p className="text-xs text-zinc-600 mb-6">
              {viewMode === 'anchors' ? (
                <>
                  Each row is one lab&apos;s flagship; each cell is its most common answer that run (color = answer,
                  shade = how many of its repeated draws agreed). One grid per selected news diet.
                </>
              ) : selectedSurvey && isOpenPrioritiesSurvey(selectedSurvey) ? (
                <>
                  Each line is a classified policy theme (not raw text); the y-axis is its share of responses for
                  that run. One chart per selected news diet.
                </>
              ) : (
                <>
                  Each line is one answer option; the y-axis is its share of the panel for that run. One chart per
                  selected news diet.
                </>
              )}
            </p>
            <div className="space-y-10">
              {viewMode === 'pooled'
                ? selectedFeeds.map(feedType => {
                    const data = lineRowsForScope(feedType)
                    if (!selectedSurvey || data.length === 0) {
                      return (
                        <div key={feedType} className="min-w-0">
                          <div className="flex items-center gap-2 mb-3">
                            <FeedBadge feedType={feedType} />
                            <span className="text-xs text-zinc-600">
                              No responses for this diet in the loaded runs.
                            </span>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={feedType} className="min-w-0">
                        <div className="mb-3">
                          <FeedBadge feedType={feedType} />
                          <span className="ml-2 text-xs text-zinc-500">{FEED_LABELS[feedType]}</span>
                        </div>
                        <TrendChart data={data} options={segmentKeys as string[]} colors={optionColors} />
                      </div>
                    )
                  })
                : selectedFeeds.map(feedType => (
                    <AnchorAnswerMatrix
                      key={feedType}
                      anchorDefs={anchorDefs}
                      points={runs}
                      feedType={feedType}
                      options={segmentKeys as string[]}
                      colors={optionColors}
                    />
                  ))}
            </div>
            {/* Shared answer-color legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-6 pt-4 border-t border-zinc-800/60">
              {(segmentKeys as string[]).map(opt => (
                <span key={opt} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: optionColors[opt] }} />
                  {opt}
                </span>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-6">
              {viewMode === 'pooled'
                ? 'Each point aggregates all models under that news diet for that run.'
                : 'Cells show the % of that flagship’s repeated draws landing on its top answer — darker means more internally consistent.'}
            </p>
          </div>

          {/* Data table */}
          <div className="rounded border border-zinc-800 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Date</th>
                  {viewMode === 'anchors' && (
                    <th className="text-left px-3 py-2 text-zinc-500 font-medium">Lab</th>
                  )}
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Feed</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">n</th>
                  {segmentKeys.map(opt => (
                    <th key={opt} className="text-right px-3 py-2 text-zinc-500 font-medium max-w-[120px]">
                      {opt}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {runs
                  .filter(r => selectedFeeds.includes(r.feedType))
                  .filter(r => (viewMode === 'pooled' ? r.anchorLab == null : r.anchorLab != null))
                  .map((r, i) => (
                  <tr key={i} className="hover:bg-zinc-900/20">
                    <td className="px-3 py-2 font-mono text-zinc-400">
                      {format(new Date(r.runDate), 'MMM d, yyyy')}
                    </td>
                    {viewMode === 'anchors' && (
                      <td className="px-3 py-2 text-zinc-400">
                        {anchorDefs.find(a => a.lab === r.anchorLab)?.displayLabel ?? r.anchorLab}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <FeedBadge feedType={r.feedType} />
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-500 font-mono">{r.modelCount}</td>
                    {segmentKeys.map(opt => (
                      <td key={opt} className="px-3 py-2 text-right font-mono text-zinc-300">
                        {r.answerDist[opt] ?? 0}%
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
  )
}
