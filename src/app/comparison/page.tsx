'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { Survey, ModelRegistry, FeedType, Response, Run } from '@/lib/types'
import { conditionForFeed } from '@/lib/feed'
import { normalizePriorityThemeLabel } from '@/lib/priority-theme-display'

const FEED_TYPES: FeedType[] = ['none', 'balanced', 'left', 'right']
const FEED_LABELS: Record<FeedType, string> = {
  none: 'Baseline',
  balanced: 'Balanced',
  left: 'Left',
  right: 'Right',
}

/** Value used to compare two responses on the same question (closed = exact option; open = theme or normalized raw). */
function agreementKey(survey: Survey, r: Response): string | null {
  if (survey.options?.length) {
    const a = r.answer?.trim()
    return a ?? null
  }
  if (r.mip_category?.trim()) return `cat:${normalizePriorityThemeLabel(r.mip_category)}`
  const raw = r.answer?.trim().toLowerCase()
  return raw ? `raw:${raw}` : null
}

function heatColor(pct: number | null): CSSProperties {
  if (pct === null) {
    return { backgroundColor: '#18181b', color: '#52525b' }
  }
  const t = pct / 100
  const light = 18 + t * 42
  return {
    backgroundColor: `hsl(0, 0%, ${light}%)`,
    color: light > 46 ? '#0a0a0a' : '#fafafa',
  }
}

export default function ComparisonPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [models, setModels] = useState<ModelRegistry[]>([])
  const [matrix, setMatrix] = useState<number[][]>([])
  const [modelOrder, setModelOrder] = useState<ModelRegistry[]>([])
  const [selectedFeed, setSelectedFeed] = useState<FeedType>('none')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function boot() {
      const [{ data: surveyData }, { data: modelData }, { data: runData }] = await Promise.all([
        supabase.from('surveys').select('*').eq('active', true).order('question_id'),
        supabase.from('model_registry').select('*').eq('active', true).order('display_name'),
        supabase.from('runs').select('*').eq('status', 'complete').order('run_date', { ascending: false }).limit(40),
      ])
      setSurveys(surveyData ?? [])
      setModels(modelData ?? [])
      const list = runData ?? []
      setRuns(list)
      if (list[0]) setRunId(list[0].id)
    }
    boot()
  }, [])

  useEffect(() => {
    if (!runId || !surveys.length || !models.length) return
    setLoading(true)

    async function build() {
      const { data: responses } = await supabase
        .from('responses')
        .select('model_id, survey_id, answer, mip_category, feed_type')
        .eq('run_id', runId!)
        .eq('feed_type', selectedFeed)
        .eq('condition', conditionForFeed(selectedFeed))

      const list = (responses ?? []) as Response[]

      const byModelSurvey = new Map<string, Map<string, Response>>()
      for (const r of list) {
        if (!byModelSurvey.has(r.model_id)) byModelSurvey.set(r.model_id, new Map())
        const prev = byModelSurvey.get(r.model_id)!.get(r.survey_id)
        if (!prev) byModelSurvey.get(r.model_id)!.set(r.survey_id, r)
      }

      const participating = models.filter(m => byModelSurvey.has(m.id))
      const order = [...participating].sort((a, b) => a.display_name.localeCompare(b.display_name))
      setModelOrder(order)

      const n = order.length
      const grid: number[][] = Array.from({ length: n }, () => Array(n).fill(NaN))

      for (let i = 0; i < n; i++) {
        grid[i][i] = 100
        for (let j = i + 1; j < n; j++) {
          const mi = order[i].id
          const mj = order[j].id
          let comparable = 0
          let agree = 0
          for (const survey of surveys) {
            const ri = byModelSurvey.get(mi)?.get(survey.id)
            const rj = byModelSurvey.get(mj)?.get(survey.id)
            if (!ri || !rj) continue
            const ai = agreementKey(survey, ri)
            const aj = agreementKey(survey, rj)
            if (ai === null || aj === null) continue
            comparable++
            if (ai === aj) agree++
          }
          const pct = comparable > 0 ? Math.round((agree / comparable) * 100) : NaN
          grid[i][j] = pct
          grid[j][i] = pct
        }
      }

      setMatrix(grid)
      setLoading(false)
    }

    build()
  }, [runId, surveys, models, selectedFeed])

  const selectedRun = runs.find(r => r.id === runId)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white mb-1">Model agreement</h1>
        <p className="text-sm text-zinc-500 max-w-2xl">
          Baseline feed = no-news tasks; balanced / left / right = informed tasks with that brief. Each cell is the
          share of questions where two models matched (closed = same option; open = theme or raw). Diagonal is 100%.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Run</label>
          <select
            value={runId ?? ''}
            onChange={e => setRunId(e.target.value || null)}
            className="bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 rounded px-3 py-2 min-w-[200px] focus:outline-none focus:border-zinc-500"
          >
            {runs.length === 0 ? (
              <option value="">No completed runs</option>
            ) : (
              runs.map(r => (
                <option key={r.id} value={r.id}>
                  {format(new Date(r.run_date), 'MMM d, yyyy HH:mm')}
                </option>
              ))
            )}
          </select>
        </div>
        <div>
          <span className="text-xs text-zinc-500 block mb-1">Feed</span>
          <div className="flex flex-wrap gap-2">
            {FEED_TYPES.map(ft => (
              <button
                key={ft}
                type="button"
                onClick={() => setSelectedFeed(ft)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  selectedFeed === ft
                    ? 'border-zinc-100/40 text-zinc-100 bg-white/5'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                {FEED_LABELS[ft]}
              </button>
            ))}
          </div>
        </div>
        {selectedRun && (
          <span className="text-xs text-zinc-600 ml-auto">
            {modelOrder.length} models with responses · {surveys.length} questions
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Building agreement matrix…</div>
      ) : modelOrder.length === 0 ? (
        <div className="text-sm text-zinc-500 rounded border border-zinc-800 p-6">
          No model responses for this run and feed. Run a survey or pick another slice.
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <table className="text-[10px] border-separate border-spacing-px">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-zinc-950 p-1 w-32 text-left text-zinc-500 font-medium align-bottom">
                  {' '}
                </th>
                {modelOrder.map(m => (
                  <th
                    key={m.id}
                    className="p-1 text-zinc-400 font-medium text-center max-w-[5rem] align-bottom leading-tight"
                    title={m.display_name}
                  >
                    <span className="line-clamp-3">{m.display_name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modelOrder.map((rowModel, i) => (
                <tr key={rowModel.id}>
                  <th className="sticky left-0 z-10 bg-zinc-950 p-1 text-left text-zinc-400 font-medium text-[10px] max-w-[9rem] truncate align-middle">
                    {rowModel.display_name}
                  </th>
                  {modelOrder.map((_, j) => {
                    const v = matrix[i]?.[j]
                    const pct = Number.isFinite(v) ? v : null
                    const label = pct === null ? '-' : `${pct}%`
                    return (
                      <td key={j} className="p-0 align-middle">
                        <div
                          className="min-w-[3rem] min-h-[2rem] rounded px-0.5 py-1 flex items-center justify-center font-mono tabular-nums"
                          style={heatColor(pct)}
                          title={`${rowModel.display_name} vs ${modelOrder[j].display_name}: ${label}`}
                        >
                          {label}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
