'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { FeedBadge } from '@/components/feed-badge'
import { StatCard } from '@/components/stat-card'
import { countsToPercents } from '@/lib/parse'
import type { ModelRegistry, Survey, Response } from '@/lib/types'

export default function ModelProfilePage() {
  const params = useParams()
  const modelId = decodeURIComponent(params.modelId as string)

  const [model, setModel] = useState<ModelRegistry | null>(null)
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [responses, setResponses] = useState<Response[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const [{ data: modelData }, { data: surveyData }] = await Promise.all([
        supabase.from('model_registry').select('*').eq('id', modelId).single(),
        supabase.from('surveys').select('*').eq('active', true),
      ])

      setModel(modelData)
      setSurveys(surveyData ?? [])

      if (modelData) {
        const { data: resp } = await supabase
          .from('responses')
          .select('*, runs(run_date, status)')
          .eq('model_id', modelId)
          .not('answer', 'is', null)
          .order('created_at', { ascending: true })

        setResponses(resp ?? [])
      }

      setLoading(false)
    }
    load()
  }, [modelId])

  if (loading) return <div className="text-sm text-zinc-500">Loading...</div>

  if (!model) {
    return (
      <div className="text-sm text-zinc-500">
        Model not found. <Link href="/models" className="text-zinc-200 hover:underline">Back to models</Link>
      </div>
    )
  }

  // Compute stats
  const baselineResponses = responses.filter(r => r.condition === 'baseline')

  // Survey responses (baseline condition only for top-answer summary)
  const surveyMap = new Map(surveys.map(s => [s.id, s]))
  const questionsAnswered = surveys
    .map(survey => {
      const answers = baselineResponses
        .filter(r => r.survey_id === survey.id && r.answer)
        .map(r => r.answer!)
      if (answers.length === 0 || survey.options.length === 0) return null
      const counts: Record<string, number> = {}
      for (const a of answers) counts[a] = (counts[a] ?? 0) + 1
      return {
        survey,
        answers,
        topAnswer: Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-',
      }
    })
    .filter(Boolean) as Array<{ survey: Survey; answers: string[]; topAnswer: string }>

  // Feed sensitivity: compare baseline vs informed answers
  const feedSensitivity = (() => {
    let shifts = 0
    let total = 0
    for (const survey of surveys) {
      const baseline = baselineResponses.find(r => r.survey_id === survey.id && r.answer)
      const informed = responses.find(
        r => r.survey_id === survey.id && r.condition === 'informed' && r.answer
      )
      if (baseline && informed) {
        total++
        if (baseline.answer !== informed.answer) shifts++
      }
    }
    return total > 0 ? shifts / total : null
  })()

  // Run history: unique run dates
  const runDates = [...new Set(responses.map(r => (r as any).runs?.run_date).filter(Boolean))]
    .sort()
    .reverse()
    .slice(0, 5)

  return (
    <div>
      <div className="mb-6 text-xs text-zinc-500">
        <Link href="/models" className="hover:text-zinc-300">Models</Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-300">{model.display_name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">{model.display_name}</h1>
          <div className="text-xs text-zinc-500 font-mono">{model.id}</div>
          <div className="flex items-center gap-3 mt-2">
            {model.provider && (
              <span className="text-xs text-zinc-400">{model.provider}</span>
            )}
            {model.origin && (
              <span className="text-xs text-zinc-400">Origin: {model.origin}</span>
            )}
            {model.parameter_count && model.parameter_count !== 'unknown' && (
              <span className="text-xs text-zinc-400">{model.parameter_count}</span>
            )}
            {model.active ? (
              <span className="text-xs text-emerald-400">Active</span>
            ) : (
              <span className="text-xs text-zinc-600">Inactive</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Feed sensitivity"
          value={feedSensitivity !== null ? `${(feedSensitivity * 100).toFixed(0)}%` : '-'}
          sub="Baseline vs informed mismatch"
        />
        <StatCard label="Questions with answers" value={questionsAnswered.length} />
        <StatCard label="Responses" value={responses.length} />
      </div>

      {/* Per-question breakdown */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
          Response by Question
        </h2>
        <div className="rounded border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left px-3 py-2 text-xs text-zinc-500 font-medium">Question</th>
                <th className="text-left px-3 py-2 text-xs text-zinc-500 font-medium">Baseline Answer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {questionsAnswered.map(({ survey, topAnswer }) => (
                <tr key={survey.id} className="hover:bg-zinc-900/30">
                  <td className="px-3 py-2">
                    <Link
                      href={`/questions/${survey.question_id}`}
                      className="text-xs font-mono text-zinc-200 hover:underline"
                    >
                      {survey.question_id}
                    </Link>
                    <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{survey.question_text}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-300">{topAnswer}</td>
                </tr>
              ))}
              {questionsAnswered.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-3 py-8 text-center text-xs text-zinc-600">
                    No response data found for this model.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent reasoning samples */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
          Recent Reasoning Samples
        </h2>
        <div className="space-y-3">
          {responses
            .filter(r => r.reasoning)
            .slice(-6)
            .reverse()
            .map(r => {
              const survey = surveyMap.get(r.survey_id)
              return (
                <div key={r.id} className="rounded border border-zinc-800 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-mono text-zinc-200">
                      {survey?.question_id ?? r.survey_id.slice(0, 8)}
                    </span>
                    <FeedBadge feedType={r.feed_type} />
                    <span className="text-xs text-zinc-500 ml-auto">
                      Answer: <span className="text-zinc-300">{r.answer}</span>
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{r.reasoning}</p>
                </div>
              )
            })}
          {responses.filter(r => r.reasoning).length === 0 && (
            <div className="text-xs text-zinc-600">No reasoning samples yet.</div>
          )}
        </div>
      </section>
    </div>
  )
}
