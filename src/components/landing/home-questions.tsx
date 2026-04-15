'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { ChartShell } from '@/components/chart-shell'
import { conditionForFeed } from '@/lib/feed'
import { countsToPercents } from '@/lib/parse'
import type { Survey, Response, FeedType } from '@/lib/types'
import { PRIORITY_THEMES } from '@/lib/types'
import { PRIORITIES_QUESTION_ID } from '@/lib/priorities-constants'

function isOpenSurvey(s: Survey): boolean {
  return !s.options?.length
}

export function HomeQuestions({
  surveys,
  responses,
  feed,
}: {
  surveys: Survey[]
  responses: Response[]
  feed: FeedType
}) {
  const visibleSurveys = surveys.filter(s => s.question_id !== PRIORITIES_QUESTION_ID)

  return (
    <div className="space-y-6">
      {visibleSurveys.map(survey => (
        <QuestionCard
          key={survey.id}
          survey={survey}
          responses={responses}
          feed={feed}
        />
      ))}
    </div>
  )
}

function QuestionCard({
  survey,
  responses,
  feed,
}: {
  survey: Survey
  responses: Response[]
  feed: FeedType
}) {
  const rows = useMemo(
    () =>
      responses.filter(
        r => r.survey_id === survey.id && r.feed_type === feed && !r.error
      ),
    [responses, survey.id, feed]
  )

  const open = isOpenSurvey(survey)

  const chartData = useMemo(() => {
    if (open) {
      const hasCat = rows.some(r => r.mip_category)
      if (hasCat) {
        const counts: Record<string, number> = {}
        for (const r of rows) {
          const c = r.mip_category ?? 'Other'
          counts[c] = (counts[c] ?? 0) + 1
        }
        const total = rows.length || 1
        return PRIORITY_THEMES.filter(cat => (counts[cat] ?? 0) > 0).map(cat => ({
          name: cat.replace('/', '/\u200b'),
          pct: Math.round(((counts[cat] ?? 0) / total) * 100),
        }))
      }
      return []
    }
    const counts: Record<string, number> = {}
    for (const r of rows) {
      if (!r.answer) continue
      counts[r.answer] = (counts[r.answer] ?? 0) + 1
    }
    const pct = countsToPercents(counts)
    return survey.options.map(opt => ({
      name: opt,
      pct: pct[opt] ?? 0,
    }))
  }, [open, rows, survey.options])

  const detailRows = useMemo(() => {
    const byModel = new Map<
      string,
      { id: string; name: string; answer: string | null; reasoning: string | null; theme: string | null }
    >()
    for (const r of rows) {
      if (!byModel.has(r.model_id)) {
        byModel.set(r.model_id, {
          id: r.model_id,
          name: r.model_name,
          answer: r.answer,
          reasoning: r.reasoning,
          theme: r.mip_category,
        })
      }
    }
    return [...byModel.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/20 overflow-hidden group/q">
      <summary className="px-4 py-3 cursor-pointer list-none flex items-start gap-2 border-b border-zinc-800/80 hover:bg-zinc-900/40 [&::-webkit-details-marker]:hidden">
        <span className="text-zinc-600 mt-0.5 shrink-0 group-open/q:rotate-90 transition-transform">▸</span>
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-semibold text-zinc-200">{survey.question_id}</span>
            <span className="text-xs text-zinc-500 truncate">{survey.topic}</span>
          </div>
          <p className="text-sm text-zinc-200 leading-snug">{survey.question_text}</p>
        </div>
      </summary>

      <div className="p-4">
        {rows.length === 0 ? (
          <p className="text-xs text-zinc-600">No answers for this feed in the latest run.</p>
        ) : open && chartData.length === 0 ? (
          <p className="text-xs text-zinc-500 mb-3">
            Free-text answers are collected; theme charts appear once answers are classified. See Priorities above for
            the word cloud.
          </p>
        ) : chartData.length > 0 ? (
          <ChartShell h={200} className="mb-4 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                  interval={0}
                  angle={chartData.length > 5 ? -25 : 0}
                  textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                  height={chartData.length > 5 ? 70 : 30}
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
                    fontSize: 12,
                  }}
                  formatter={v => [`${v != null && v !== '' ? v : 0}%`, 'Share']}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
                <Bar dataKey="pct" name="Share" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartShell>
        ) : null}

        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-zinc-200 list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
            <span className="text-zinc-600 group-open:rotate-90 transition-transform">▸</span>
            Model breakdown ({detailRows.length} models)
          </summary>
          <div className="mt-3 rounded border border-zinc-800 overflow-x-auto max-h-[min(70vh,520px)] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/80 sticky top-0">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Model</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">
                    {open ? 'Answer / theme' : 'Answer'}
                  </th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Reasoning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {detailRows.map(row => (
                  <tr key={row.id} className="hover:bg-zinc-900/40">
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap max-w-[140px] truncate">
                      {row.name}
                    </td>
                    <td className="px-3 py-2 text-zinc-200 max-w-[220px]">
                      {open ? (
                        <span className="line-clamp-4">
                          {row.theme && (
                            <span className="text-emerald-400/90 block text-[11px] mb-0.5">{row.theme}</span>
                          )}
                          {row.answer && <span className="text-zinc-300">{row.answer}</span>}
                          {!row.theme && !row.answer && '-'}
                        </span>
                      ) : (
                        <span>{row.answer ?? '-'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-400 max-w-xl min-w-[200px] leading-relaxed break-words whitespace-pre-wrap align-top">
                      {row.reasoning ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </details>
  )
}
