import { Suspense } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  getLatestRun,
  getAllRuns,
  getDriftAlerts,
  getActiveSurveys,
  getResponsesForRun,
  getNewsBriefsForRun,
  getRunModelParticipation,
  sortSurveysForHome,
} from '@/lib/queries'
import { buildBaselineAnswersOverview } from '@/lib/consensus'
import { FeedBadge } from '@/components/feed-badge'
import { EmptyState } from '@/components/empty-state'
import { HomeAllQuestions } from '@/components/landing/home-all-questions'
import { AnswersOverview } from '@/components/landing/answers-overview'
import { RunOverviewTabs } from '@/components/landing/run-overview-tabs'

export const dynamic = 'force-dynamic'

async function OverviewContent() {
  const latestRun = await getLatestRun()

  if (!latestRun) {
    return (
      <EmptyState title="No data yet" description="Check back after the next run." />
    )
  }

  const allRuns = await getAllRuns()
  const completedRuns = allRuns.filter(r => r.status === 'complete')
  const prevRun = completedRuns[1] ?? null

  const [surveysRaw, responses, driftAlerts, briefs, participation] = await Promise.all([
    getActiveSurveys(),
    getResponsesForRun(latestRun.id),
    prevRun ? getDriftAlerts(latestRun.id, prevRun.id) : Promise.resolve([]),
    getNewsBriefsForRun(latestRun),
    getRunModelParticipation(latestRun.id),
  ])

  const surveys = sortSurveysForHome(surveysRaw)

  const runDate = format(new Date(latestRun.run_date), 'MMM d, yyyy')
  const modelCount = Array.isArray(latestRun.model_list) ? latestRun.model_list.length : 0
  const anchorCount = participation.filter(p => p.anchor_lab != null).length

  const answerRows = buildBaselineAnswersOverview(surveys, responses)

  const kpis = [
    { label: 'Latest run', value: runDate },
    { label: 'Models', value: modelCount, sub: `${anchorCount} flagship anchors` },
    { label: 'Questions', value: surveys.length },
    { label: 'Responses', value: responses.length.toLocaleString() },
  ]

  return (
    <div className="space-y-8">
      <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
        Hundreds of millions of people use LLMs every day - this tracks what they say, unprompted. Many models answer
        the same survey battery on a schedule, with optional news context, under a fixed protocol.{' '}
        <Link href="/methodology" className="text-zinc-100 hover:text-white underline-offset-2 hover:underline">
          How it works
        </Link>
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{k.label}</div>
            <div className="text-lg font-bold font-mono tabular-nums text-white leading-tight">{k.value}</div>
            {k.sub && <div className="text-[11px] text-zinc-500 mt-0.5">{k.sub}</div>}
          </div>
        ))}
      </div>

      <RunOverviewTabs
        runDate={runDate}
        modelCount={modelCount}
        briefs={briefs}
        participation={participation}
      />

      <AnswersOverview rows={answerRows} />

      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          All questions
        </h2>
        <HomeAllQuestions runId={latestRun.id} surveys={surveys} responses={responses} />
      </section>

      <details className="rounded border border-zinc-800 bg-zinc-900/20 p-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-300">
          Drift vs previous run
        </summary>
        <div className="mt-4">
          {driftAlerts.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {prevRun ? 'No baseline shifts detected.' : 'Needs two completed runs.'}
            </p>
          ) : (
            <div className="space-y-2">
              {driftAlerts.slice(0, 8).map((alert, i) => (
                <div key={i} className="rounded border border-zinc-800 bg-zinc-900/30 p-3 text-xs">
                  <div className="flex justify-between gap-2 mb-1">
                    <span className="font-medium text-white">{alert.model_name}</span>
                    <FeedBadge feedType={alert.feed_type} />
                  </div>
                  <div className="text-zinc-500 mb-1 line-clamp-1">
                    {alert.question_id}: {alert.question_text.slice(0, 64)}…
                  </div>
                  <div className="text-zinc-400">
                    <span className="line-through text-zinc-600">{alert.prev_answer}</span>
                    <span className="mx-1">→</span>
                    <span className="text-zinc-200">{alert.curr_answer}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  )
}

export default function HomePage() {
  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
            Autonomous survey panel
          </span>
        </div>
        <h1 className="pulse-text text-3xl font-bold tracking-tight mb-2">Silicon Pulse</h1>
        <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
          What LLMs say when nobody&apos;s steering - a survey panel run and reported by machines.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-zinc-500">Loading…</div>}>
        <OverviewContent />
      </Suspense>
    </div>
  )
}
