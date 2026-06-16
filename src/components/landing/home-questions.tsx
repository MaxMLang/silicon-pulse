'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChartShell } from '@/components/chart-shell'
import { DistributionBar } from '@/components/distribution-bar'
import {
  optionShares,
  panelAgreement,
  modelConvictions,
  type OptionShare,
} from '@/lib/distribution'
import { colorMap, AXIS_TICK, AXIS_TICK_SM, AXIS_LINE, TOOLTIP_STYLE } from '@/lib/chart-theme'
import type { Survey, Response, FeedType } from '@/lib/types'
import { PRIORITY_THEMES } from '@/lib/types'
import { normalizePriorityThemeLabel } from '@/lib/priority-theme-display'
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
    <div className="space-y-4">
      {visibleSurveys.map(survey => (
        <QuestionCard key={survey.id} survey={survey} responses={responses} feed={feed} />
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
    () => responses.filter(r => r.survey_id === survey.id && r.feed_type === feed && !r.error),
    [responses, survey.id, feed]
  )

  const open = isOpenSurvey(survey)

  // Stable color per option/theme so the same answer keeps its color across the chart + breakdown.
  const colors = useMemo(
    () => colorMap(open ? PRIORITY_THEMES : survey.options),
    [open, survey.options]
  )

  const { chartData, total, agreement } = useMemo(() => {
    if (open) {
      const counts: Record<string, number> = {}
      let t = 0
      for (const r of rows) {
        const c = normalizePriorityThemeLabel(r.mip_category)
        counts[c] = (counts[c] ?? 0) + 1
        t++
      }
      const denom = t || 1
      const data: OptionShare[] = PRIORITY_THEMES.filter(cat => (counts[cat] ?? 0) > 0).map(cat => ({
        name: cat,
        count: counts[cat] ?? 0,
        pct: Math.round(((counts[cat] ?? 0) / denom) * 100),
        color: colors[cat] ?? '#94a3b8',
      }))
      return { chartData: data, total: t, agreement: panelAgreement(data, t) }
    }
    const { shares, total: t } = optionShares(rows, survey.options, colors)
    return { chartData: shares, total: t, agreement: panelAgreement(shares, t) }
  }, [open, rows, survey.options, colors])

  // Per-model conviction (uses repeated anchor draws). Reasoning is captured from the first draw that has it.
  const detailRows = useMemo(() => {
    if (open) {
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
            theme: normalizePriorityThemeLabel(r.mip_category),
          })
        }
      }
      return [...byModel.values()].sort((a, b) => a.name.localeCompare(b.name))
    }
    const convictions = modelConvictions(rows, survey.options, colors)
    const reasoningByModel = new Map<string, string>()
    for (const r of rows) {
      if (r.reasoning && !reasoningByModel.has(r.model_id)) reasoningByModel.set(r.model_id, r.reasoning)
    }
    return convictions.map(c => ({ ...c, reasoning: reasoningByModel.get(c.modelId) ?? null }))
  }, [open, rows, survey.options, colors])

  const modelCount = detailRows.length
  const agreementPct = Math.round(agreement * 100)

  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/20 overflow-hidden group/q">
      <summary className="px-4 py-3 cursor-pointer list-none flex items-start gap-2 border-b border-zinc-800/80 hover:bg-zinc-900/40 [&::-webkit-details-marker]:hidden">
        <span className="text-zinc-600 mt-0.5 shrink-0 group-open/q:rotate-90 transition-transform">▸</span>
        <div className="min-w-0 text-left flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-semibold text-zinc-200">{survey.question_id}</span>
            <span className="text-xs text-zinc-500 truncate">{survey.topic}</span>
          </div>
          <p className="text-sm text-zinc-200 leading-snug">{survey.question_text}</p>
        </div>
        {total > 0 && (
          <div className="hidden sm:flex flex-col items-end shrink-0 text-right">
            <span className="text-sm font-mono tabular-nums text-zinc-100">{agreementPct}%</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">agreement</span>
          </div>
        )}
      </summary>

      <div className="p-4">
        {rows.length === 0 ? (
          <p className="text-xs text-zinc-600">No answers for this feed in the latest run.</p>
        ) : chartData.length === 0 ? (
          <p className="text-xs text-zinc-500">No chart data for this feed.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-zinc-500">
              <span>
                <span className="font-mono tabular-nums text-zinc-300">{agreementPct}%</span> panel agreement
              </span>
              <span>
                <span className="font-mono tabular-nums text-zinc-300">{modelCount}</span> models
              </span>
              <span>
                <span className="font-mono tabular-nums text-zinc-300">{total}</span> draws
              </span>
            </div>

            <ChartShell h={200} className="mb-4 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="20%">
                  <XAxis
                    dataKey="name"
                    tick={AXIS_TICK_SM}
                    axisLine={AXIS_LINE}
                    tickLine={false}
                    interval={0}
                    angle={chartData.length > 4 ? -20 : 0}
                    textAnchor={chartData.length > 4 ? 'end' : 'middle'}
                    height={chartData.length > 4 ? 64 : 28}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}%`}
                    domain={[0, 100]}
                    width={36}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(_v, _n, p) => {
                      const d = p?.payload as OptionShare
                      return [`${d.pct}%  (${d.count})`, d.name]
                    }}
                  />
                  <Bar dataKey="pct" radius={[3, 3, 0, 0]} maxBarSize={72}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </>
        )}

        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-zinc-200 list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
            <span className="text-zinc-600 group-open:rotate-90 transition-transform">▸</span>
            Model breakdown ({modelCount} models)
          </summary>
          <div className="mt-3 rounded border border-zinc-800 overflow-x-auto max-h-[min(70vh,520px)] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/80 sticky top-0">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Model</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">
                    {open ? 'Answer / theme' : 'Answer (distribution)'}
                  </th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Reasoning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {open
                  ? (detailRows as OpenDetailRow[]).map(row => (
                      <tr key={row.id} className="hover:bg-zinc-900/40">
                        <td className="px-3 py-2 text-zinc-300 whitespace-nowrap max-w-[140px] truncate">
                          {row.name}
                        </td>
                        <td className="px-3 py-2 text-zinc-200 max-w-[220px]">
                          <span className="line-clamp-4">
                            <span
                              className={`block text-[11px] mb-0.5 ${
                                row.theme === 'Declined to answer or unclear'
                                  ? 'text-zinc-500'
                                  : 'text-emerald-400/90'
                              }`}
                            >
                              {row.theme}
                            </span>
                            {row.answer ? <span className="text-zinc-300">{row.answer}</span> : '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-400 max-w-xl min-w-[200px] leading-relaxed break-words whitespace-pre-wrap align-top">
                          {row.reasoning ?? '-'}
                        </td>
                      </tr>
                    ))
                  : (detailRows as ClosedDetailRow[]).map(row => (
                      <tr key={row.modelId} className="hover:bg-zinc-900/40 align-top">
                        <td className="px-3 py-2 text-zinc-300 whitespace-nowrap max-w-[140px] truncate">
                          {row.modelName}
                        </td>
                        <td className="px-3 py-2 text-zinc-200 max-w-[240px] min-w-[180px]">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-zinc-200 truncate">{row.topAnswer ?? '-'}</span>
                            {row.draws > 1 && (
                              <span className="font-mono tabular-nums text-[10px] text-zinc-500 shrink-0">
                                {Math.round(row.agreement * 100)}%
                              </span>
                            )}
                          </div>
                          {row.draws > 1 && (
                            <>
                              <DistributionBar segments={row.distribution} className="mb-1" />
                              <div className="text-[10px] text-zinc-500">
                                {row.distribution.map(d => `${d.count}× ${d.name}`).join(' · ')}
                              </div>
                            </>
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

type OpenDetailRow = {
  id: string
  name: string
  answer: string | null
  reasoning: string | null
  theme: string | null
}

type ClosedDetailRow = {
  modelId: string
  modelName: string
  topAnswer: string | null
  draws: number
  agreement: number
  distribution: { name: string; count: number; color: string }[]
  reasoning: string | null
}
