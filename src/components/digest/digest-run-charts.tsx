'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DistributionBar } from '@/components/distribution-bar'
import { colorMap } from '@/lib/chart-theme'
import { optionShares, panelAgreement } from '@/lib/distribution'
import { PRIORITIES_QUESTION_ID } from '@/lib/priorities-constants'
import { normalizePriorityThemeLabel } from '@/lib/priority-theme-display'
import { PRIORITY_THEMES, type Survey, type Response } from '@/lib/types'

interface QuestionResult {
  questionId: string
  questionText: string
  topic: string
  segments: { name: string; count: number; color: string }[]
  topLabel: string
  topPct: number
  agreementPct: number
  total: number
}

/** Renders the key baseline distributions for a run, inline in the digest article. */
export function DigestRunCharts({ runId }: { runId: string }) {
  const [results, setResults] = useState<QuestionResult[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: surveys }, { data: responses }] = await Promise.all([
        supabase.from('surveys').select('*').eq('active', true),
        supabase.from('responses').select('*').eq('run_id', runId).eq('feed_type', 'none'),
      ])
      if (cancelled || !surveys) return
      const rows = (responses ?? []) as Response[]
      const out: QuestionResult[] = []

      for (const s of (surveys as Survey[]).sort((a, b) => a.question_id.localeCompare(b.question_id))) {
        const sRows = rows.filter(r => r.survey_id === s.id && !r.error)
        if (s.options?.length) {
          const colors = colorMap(s.options)
          const { shares, total } = optionShares(sRows, s.options, colors)
          if (total === 0) continue
          const top = [...shares].sort((a, b) => b.count - a.count)[0]
          out.push({
            questionId: s.question_id,
            questionText: s.question_text,
            topic: s.topic,
            segments: shares.filter(x => x.count > 0),
            topLabel: top?.name ?? '-',
            topPct: top?.pct ?? 0,
            agreementPct: Math.round(panelAgreement(shares, total) * 100),
            total,
          })
        } else if (s.question_id === PRIORITIES_QUESTION_ID) {
          const colors = colorMap(PRIORITY_THEMES)
          const counts: Record<string, number> = {}
          let total = 0
          for (const r of sRows) {
            const c = normalizePriorityThemeLabel(r.mip_category)
            counts[c] = (counts[c] ?? 0) + 1
            total++
          }
          if (total === 0) continue
          const segments = PRIORITY_THEMES.filter(t => (counts[t] ?? 0) > 0).map(t => ({
            name: t,
            count: counts[t] ?? 0,
            color: colors[t] ?? '#94a3b8',
          }))
          const top = [...segments].sort((a, b) => b.count - a.count)[0]
          out.push({
            questionId: s.question_id,
            questionText: 'Top political priority',
            topic: 'priorities',
            segments,
            topLabel: top?.name ?? '-',
            topPct: top ? Math.round((top.count / total) * 100) : 0,
            agreementPct: top ? Math.round((top.count / total) * 100) : 0,
            total,
          })
        }
      }
      if (!cancelled) setResults(out)
    })()
    return () => {
      cancelled = true
    }
  }, [runId])

  if (results === null) {
    return <div className="text-xs text-zinc-600">Loading charts…</div>
  }
  if (results.length === 0) return null

  return (
    <div className="space-y-4">
      {results.map(r => (
        <div key={r.questionId} className="rounded-lg border border-zinc-800 bg-zinc-900/20 p-3">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <div className="min-w-0">
              <span className="text-[11px] font-mono text-zinc-500 mr-2">{r.questionId}</span>
              <span className="text-xs text-zinc-300">{r.questionText}</span>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-zinc-500 shrink-0">{r.total} draws</span>
          </div>
          <DistributionBar segments={r.segments} height={12} className="mb-2" />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {r.segments
              .slice()
              .sort((a, b) => b.count - a.count)
              .slice(0, 4)
              .map(seg => (
                <span key={seg.name} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span className="h-2 w-2 rounded-sm" style={{ background: seg.color }} />
                  {seg.name}
                  <span className="font-mono tabular-nums text-zinc-500">
                    {Math.round((seg.count / r.total) * 100)}%
                  </span>
                </span>
              ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-zinc-600">
        Baseline (no-news) shares across all model draws for this run.{' '}
        <Link href="/" className="text-zinc-300 hover:underline">
          Open the full dashboard →
        </Link>
      </p>
    </div>
  )
}
