'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid,
} from 'recharts'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { countsToPercents } from '@/lib/parse'
import { conditionForFeed } from '@/lib/feed'
import { FeedBadge } from '@/components/feed-badge'
import { EmptyState } from '@/components/empty-state'
import { ChartShell } from '@/components/chart-shell'
import type { Survey, FeedType } from '@/lib/types'
import { PRIORITY_THEMES } from '@/lib/types'
import { PRIORITIES_QUESTION_ID } from '@/lib/priorities-constants'

const FEED_TYPES: FeedType[] = ['none', 'balanced', 'left', 'right']
const FEED_LABELS: Record<FeedType, string> = {
  none: 'Baseline',
  balanced: 'Balanced',
  left: 'Left-leaning',
  right: 'Right-leaning',
}

/** Distinct fills for answer-option segments (same across feeds). */
const OPTION_STACK_COLORS = [
  '#3b82f6',
  '#818cf8',
  '#f87171',
  '#22c55e',
  '#eab308',
  '#a855f7',
  '#06b6d4',
  '#f472b6',
  '#94a3b8',
]

interface RunPoint {
  runId: string
  runDate: string
  feedType: FeedType
  answerDist: Record<string, number>
  modelCount: number
}

/** Open priorities item: chart/table use classifier themes, not raw free text. */
function isOpenPrioritiesSurvey(s: Survey): boolean {
  return !s.options?.length || s.question_id === PRIORITIES_QUESTION_ID
}

export default function LongitudinalPage() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null)
  const [runs, setRuns] = useState<RunPoint[]>([])
  const [selectedFeeds, setSelectedFeeds] = useState<FeedType[]>(['none', 'balanced'])
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

      if (!completedRuns?.length) { setRuns([]); setLoading(false); return }

      const points: RunPoint[] = []

      await Promise.all(completedRuns.map(async (run: { id: string; run_date: string }) => {
        const { data: responses } = await supabase
          .from('responses')
          .select('feed_type, answer, condition, mip_category')
          .eq('run_id', run.id)
          .eq('survey_id', selectedSurvey!.id)
          .not('answer', 'is', null)

        if (!responses?.length) return

        const openItem = isOpenPrioritiesSurvey(selectedSurvey!)

        const byFeed = new Map<string, { answer: string; mip: string | null }[]>()
        for (const r of responses) {
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
              const mip = row.mip
              const key =
                mip && (PRIORITY_THEMES as readonly string[]).includes(mip)
                  ? mip
                  : 'Other'
              counts[key] = (counts[key] ?? 0) + 1
            }
          } else {
            for (const row of rows) {
              counts[row.answer] = (counts[row.answer] ?? 0) + 1
            }
          }
          points.push({
            runId: run.id,
            runDate: run.run_date,
            feedType: feedType as FeedType,
            answerDist: countsToPercents(counts),
            modelCount: rows.length,
          })
        }
      }))

      points.sort((a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime())
      setRuns(points)
      setLoading(false)
    }

    loadTimeSeries()
  }, [selectedSurvey])

  const allRunDates = [...new Set(runs.map(r => r.runDate))].sort()

  const segmentKeys = selectedSurvey
    ? isOpenPrioritiesSurvey(selectedSurvey)
      ? [...PRIORITY_THEMES]
      : selectedSurvey.options
    : []

  /** One row per run date that has data for this feed; values are % shares summing to 100 for a full stack. */
  function stackedRowsForFeed(feedType: FeedType) {
    if (!selectedSurvey) return []
    const options = segmentKeys
    const dates = allRunDates.filter(d =>
      runs.some(r => r.runDate === d && r.feedType === feedType)
    )
    return dates.map(date => {
      const point = runs.find(r => r.runDate === date && r.feedType === feedType)
      const row: Record<string, string | number> = {
        date: format(new Date(date), 'MMM d'),
        fullDate: date,
      }
      const raw = options.map(o => (point ? (point.answerDist[o] ?? 0) : 0))
      const sum = raw.reduce((a, b) => a + b, 0)
      if (sum === 0) {
        for (const opt of options) row[opt] = 0
        return row
      }
      let acc = 0
      options.forEach((opt, i) => {
        if (i < options.length - 1) {
          const v = Math.round((raw[i]! / sum) * 100)
          acc += v
          row[opt] = v
        } else {
          row[opt] = 100 - acc
        }
      })
      return row
    })
  }

  const hasChartableStack =
    !!selectedSurvey &&
    selectedFeeds.length > 0 &&
    selectedFeeds.some(ft => stackedRowsForFeed(ft).length > 0)

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
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading time series...</div>
      ) : allRunDates.length === 0 ? (
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
              {selectedSurvey && isOpenPrioritiesSurvey(selectedSurvey)
                ? 'Classified theme mix over time (100% stacked)'
                : 'Answer mix over time (100% stacked)'}
            </h2>
            <p className="text-xs text-zinc-600 mb-6">
              {selectedSurvey && isOpenPrioritiesSurvey(selectedSurvey) ? (
                <>
                  Segments are classified policy themes (not raw text). Each column is one run; shares sum to 100%.
                  Columns are flush between runs. One chart per selected news diet.
                </>
              ) : (
                <>
                  Each column is one run; segments are answer shares (sum to 100%). Columns are flush left-to-right
                  with no gap between runs. One chart per selected news diet.
                </>
              )}
            </p>
            <div className="space-y-10">
              {selectedFeeds.map(feedType => {
                const data = stackedRowsForFeed(feedType)
                if (!selectedSurvey || data.length === 0) {
                  return (
                    <div key={feedType} className="min-w-0">
                      <div className="flex items-center gap-2 mb-3">
                        <FeedBadge feedType={feedType} />
                        <span className="text-xs text-zinc-600">No responses for this diet in the loaded runs.</span>
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
                    <ChartShell h={300}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data}
                          margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
                          barCategoryGap={0}
                        >
                          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: '#71717a', fontSize: 11 }}
                            axisLine={{ stroke: '#3f3f46' }}
                            tickLine={false}
                            interval={data.length > 16 ? 'preserveStartEnd' : 0}
                          />
                          <YAxis
                            tick={{ fill: '#71717a', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={v => `${v}%`}
                            domain={[0, 100]}
                          />
                          <Tooltip
                            contentStyle={{
                              background: '#18181b',
                              border: '1px solid #3f3f46',
                              borderRadius: 6,
                              fontSize: 11,
                            }}
                            formatter={(v, name) => [`${v ?? 0}%`, String(name ?? '')]}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: 11, color: '#71717a' }}
                            formatter={value => String(value)}
                          />
                          {segmentKeys.map((opt, i) => (
                            <Bar
                              key={opt}
                              dataKey={opt}
                              name={opt}
                              stackId={feedType}
                              fill={OPTION_STACK_COLORS[i % OPTION_STACK_COLORS.length]}
                              stroke="#09090b"
                              strokeWidth={0.5}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartShell>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-zinc-600 mt-6">
              Each column aggregates all models under that news diet for that run.
            </p>
          </div>

          {/* Data table */}
          <div className="rounded border border-zinc-800 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Date</th>
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
                {runs.filter(r => selectedFeeds.includes(r.feedType)).map((r, i) => (
                  <tr key={i} className="hover:bg-zinc-900/20">
                    <td className="px-3 py-2 font-mono text-zinc-400">
                      {format(new Date(r.runDate), 'MMM d, yyyy')}
                    </td>
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
