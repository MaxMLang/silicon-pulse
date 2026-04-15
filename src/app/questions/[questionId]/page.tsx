'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { FeedBadge } from '@/components/feed-badge'
import { ChartShell } from '@/components/chart-shell'
import { countsToPercents } from '@/lib/parse'
import { conditionForFeed } from '@/lib/feed'
import type { Survey, Response, FeedType } from '@/lib/types'
import { PRIORITY_THEMES } from '@/lib/types'
import { PRIORITIES_QUESTION_ID } from '@/lib/priorities-constants'

const FEED_TYPES: FeedType[] = ['none', 'balanced', 'left', 'right']

export default function QuestionDetailPage() {
  const params = useParams()
  const questionId = params.questionId as string

  const [survey, setSurvey] = useState<Survey | null>(null)
  const [responses, setResponses] = useState<Response[]>([])
  const [selectedFeed, setSelectedFeed] = useState<FeedType>('none')
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const { data: surveyData } = await supabase
        .from('surveys')
        .select('*')
        .eq('question_id', questionId)
        .single()

      if (!surveyData) { setLoading(false); return }
      setSurvey(surveyData)

      // Get latest run
      const { data: latestRun } = await supabase
        .from('runs')
        .select('id')
        .eq('status', 'complete')
        .order('run_date', { ascending: false })
        .limit(1)
        .single()

      if (!latestRun) { setLoading(false); return }

      const { data: resp } = await supabase
        .from('responses')
        .select('*')
        .eq('run_id', latestRun.id)
        .eq('survey_id', surveyData.id)
        .not('answer', 'is', null)

      setResponses(resp ?? [])
      setLoading(false)
    }
    load()
  }, [questionId])

  if (loading) {
    return <div className="text-sm text-zinc-500">Loading...</div>
  }

  if (!survey) {
    return (
      <div className="text-sm text-zinc-500">
        Question not found. <Link href="/" className="text-zinc-200 hover:underline">Back home</Link>
      </div>
    )
  }

  const isOpen = !survey.options?.length || survey.question_id === PRIORITIES_QUESTION_ID

  const cond = conditionForFeed(selectedFeed)
  const filteredResponses = responses.filter(
    r => r.feed_type === selectedFeed && r.condition === cond
  )

  // Group by model
  const byModel = new Map<string, { name: string; answers: string[]; theme?: string | null }>()
  for (const r of filteredResponses) {
    if (!byModel.has(r.model_id)) {
      byModel.set(r.model_id, { name: r.model_name, answers: [], theme: r.mip_category })
    }
    if (r.answer) byModel.get(r.model_id)!.answers.push(r.answer)
    if (r.mip_category) byModel.get(r.model_id)!.theme = r.mip_category
  }

  const allAnswerCounts: Record<string, number> = {}
  for (const { answers } of byModel.values()) {
    for (const a of answers) allAnswerCounts[a] = (allAnswerCounts[a] ?? 0) + 1
  }
  const allAnswerDist = countsToPercents(allAnswerCounts)

  const themeCounts: Record<string, number> = {}
  if (isOpen) {
    for (const r of filteredResponses) {
      const c = r.mip_category ?? 'Other'
      themeCounts[c] = (themeCounts[c] ?? 0) + 1
    }
  }
  const themeTotal = Object.values(themeCounts).reduce((a, b) => a + b, 0) || 1
  const themeDist = PRIORITY_THEMES.filter(cat => (themeCounts[cat] ?? 0) > 0).map(cat => ({
    name: cat,
    Models: Math.round(((themeCounts[cat] ?? 0) / themeTotal) * 100),
  }))

  const modelList = Array.from(byModel.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    answers: data.answers,
    theme: data.theme,
    topAnswer: data.answers[0] ?? null,
  }))

  modelList.sort((a, b) => a.name.localeCompare(b.name))

  const chartData = isOpen
    ? themeDist
    : survey.options.map(opt => ({
        name: opt,
        Models: allAnswerDist[opt] ?? 0,
      }))

  const selectedModelData = selectedModel ? byModel.get(selectedModel) : null
  const selectedModelReasoning = selectedModel
    ? filteredResponses.filter(r => r.model_id === selectedModel && r.reasoning)
    : []

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6 text-xs text-zinc-500">
        <Link href="/" className="hover:text-zinc-300">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-200">{questionId}</span>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm font-mono font-bold text-zinc-200">{survey.question_id}</span>
          <span className="text-xs text-zinc-500 uppercase">{survey.topic}</span>
        </div>
        <h1 className="text-lg font-semibold text-white leading-relaxed">{survey.question_text}</h1>
      </div>

      {/* Feed type selector */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs text-zinc-500">News diet:</span>
        {FEED_TYPES.map(ft => (
          <button
            key={ft}
            onClick={() => setSelectedFeed(ft)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              selectedFeed === ft
                ? 'border-zinc-100/40 text-zinc-100 bg-white/5'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            {ft === 'none' ? 'Baseline' : ft}
          </button>
        ))}
      </div>

      <div className="rounded border border-zinc-800 p-4 mb-8">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          {isOpen ? 'Theme mix (classified)' : 'Aggregate response distribution'}
        </h2>
        <p className="text-xs text-zinc-600 mb-3">
          n={filteredResponses.length} model responses (this feed).
          {isOpen && themeDist.length === 0 && (
            <span className="block mt-1 text-zinc-500">Theme breakdown will appear once answers are classified.</span>
          )}
        </p>
        {chartData.length > 0 ? (
          <ChartShell h={isOpen ? 260 : 220}>
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={4}>
              <XAxis
                dataKey="name"
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
                interval={0}
                angle={chartData.length > 4 ? -20 : 0}
                textAnchor={chartData.length > 4 ? 'end' : 'middle'}
                height={chartData.length > 4 ? 70 : 30}
              />
              <YAxis
                tick={{ fill: '#71717a', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }}
                formatter={v => `${v}%`}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
              <Bar dataKey="Models" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            </BarChart>
            </ResponsiveContainer>
          </ChartShell>
        ) : (
          <p className="text-xs text-zinc-600">Nothing to chart for this feed yet.</p>
        )}
        {survey.usage_disclaimer && (
          <p className="text-zinc-600 text-xs mt-4 pt-3 border-t border-zinc-800">{survey.usage_disclaimer}</p>
        )}
      </div>

      {/* Model table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Per-Model Responses
          </h2>
          <div className="text-xs text-zinc-600">Sorted by model name</div>
        </div>

        <div className="rounded border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left px-3 py-2 text-xs text-zinc-500 font-medium">Model</th>
                <th className="text-left px-3 py-2 text-xs text-zinc-500 font-medium">Answer</th>
                <th className="text-right px-3 py-2 text-xs text-zinc-500 font-medium">Reasoning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {modelList.map(m => (
                <tr
                  key={m.id}
                  className={`hover:bg-zinc-900/30 transition-colors cursor-pointer ${
                    selectedModel === m.id ? 'bg-zinc-900/50' : ''
                  }`}
                  onClick={() => setSelectedModel(selectedModel === m.id ? null : m.id)}
                >
                  <td className="px-3 py-2">
                    <div className="text-xs font-medium text-white">{m.name}</div>
                  </td>
                  <td className="px-3 py-2">
                    {isOpen ? (
                      <div className="text-xs text-zinc-300">
                        {m.theme && <div className="text-emerald-400/90 mb-0.5">{m.theme}</div>}
                        <div className="text-zinc-300">{m.topAnswer ?? '-'}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-300">{m.topAnswer ?? '-'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-zinc-600">
                    {filteredResponses.find(r => r.model_id === m.id && r.reasoning) ? '↓ click' : '-'}
                  </td>
                </tr>
              ))}
              {modelList.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-xs text-zinc-600">
                    No responses for this condition yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Reasoning inspector */}
        {selectedModel && selectedModelReasoning.length > 0 && (
          <div className="mt-4 rounded border border-zinc-100/15 bg-zinc-100/5 p-4">
            <div className="text-xs font-semibold text-zinc-200 mb-2">
              {selectedModelData?.name} - Reasoning
            </div>
            {selectedModelReasoning.slice(0, 1).map(r => (
              <div key={r.id}>
                <div className="text-xs text-zinc-400 mb-1">
                  Answer: <span className="text-white font-medium">{r.answer}</span>
                  {r.feed_type !== 'none' && <span className="ml-2"><FeedBadge feedType={r.feed_type} /></span>}
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">{r.reasoning}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
