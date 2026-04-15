'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { FeedBadge } from '@/components/feed-badge'
import { StatCard } from '@/components/stat-card'
import type { NewsBrief, FeedType, RunModelParticipation } from '@/lib/types'

const DIGEST_FEEDS: FeedType[] = ['balanced', 'left', 'right']

function HeadlineBlock({
  title,
  source,
  summary,
  url,
}: {
  title: string
  source?: string
  summary?: string
  url?: string
}) {
  const titleEl = url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-zinc-200 font-medium hover:text-white hover:underline"
    >
      {title}
    </a>
  ) : (
    <span className="text-zinc-200 font-medium">{title}</span>
  )

  return (
    <div className="border-l-2 border-zinc-700 pl-2 py-1">
      <div>{titleEl}</div>
      {source ? (
        <div className="text-[10px] text-zinc-500 mt-0.5">© {source}</div>
      ) : null}
      {summary ? <div className="text-zinc-500 mt-1 leading-relaxed">{summary}</div> : null}
    </div>
  )
}

export function RunOverviewTabs({
  runDate,
  modelCount,
  briefs,
  participation,
}: {
  runDate: string
  modelCount: number
  briefs: NewsBrief[]
  participation: RunModelParticipation[]
}) {
  const [tab, setTab] = useState<'run' | 'digests' | 'models'>('run')
  const [digestFeed, setDigestFeed] = useState<FeedType>('balanced')

  const briefForSlice = briefs.find(b => b.feed_type === digestFeed)

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'run', label: 'Run' },
    { id: 'digests', label: 'News digests' },
    { id: 'models', label: 'Models' },
  ]

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 overflow-hidden">
      <div className="flex flex-wrap border-b border-zinc-800">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? 'bg-zinc-900 text-zinc-100 border-b-2 border-zinc-100/50 -mb-px'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 min-h-[120px]">
        {tab === 'run' && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500">
              Who participated is on the{' '}
              <button
                type="button"
                onClick={() => setTab('models')}
                className="text-zinc-200/90 hover:underline"
              >
                Models
              </button>{' '}
              tab. More on methods:{' '}
              <Link href="/about#models-registry" className="text-zinc-200/90 hover:underline">
                About
              </Link>
              .
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
              <StatCard label="Run date" value={runDate} accent />
              <StatCard label="Models surveyed" value={modelCount.toLocaleString()} />
            </div>
          </div>
        )}

        {tab === 'digests' && (
          <div className="space-y-4">
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Headlines include outlet attribution. Summaries are abbreviated. Full text is what was shown with
              informed conditions - use per fair use and each outlet&apos;s terms.{' '}
              <a href="/about#news-digests" className="text-zinc-200/90 hover:underline">
                About
              </a>
            </p>
            <div>
              <span className="text-xs text-zinc-500 block mb-2">Slice</span>
              <div className="flex flex-wrap gap-2">
                {DIGEST_FEEDS.map(ft => (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setDigestFeed(ft)}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                      digestFeed === ft
                        ? 'border-zinc-100/40 text-zinc-100 bg-white/5'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {ft}
                  </button>
                ))}
              </div>
            </div>

            {!briefForSlice ? (
              <p className="text-xs text-zinc-600">No brief for this slice in this run.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <FeedBadge feedType={briefForSlice.feed_type} size="md" />
                  <span>{format(new Date(briefForSlice.created_at), 'MMM d, yyyy')}</span>
                </div>

                {Array.isArray(briefForSlice.headlines) && briefForSlice.headlines.length > 0 ? (
                  <div className="rounded border border-zinc-800 p-3 space-y-3 max-h-[220px] overflow-y-auto">
                    {briefForSlice.headlines.map((h, i) => (
                      <HeadlineBlock
                        key={i}
                        title={h.title}
                        source={h.source}
                        summary={h.summary}
                        url={h.url}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600">No headlines on this brief.</p>
                )}

                {Array.isArray(briefForSlice.sources) && briefForSlice.sources.length > 0 && (
                  <p className="text-[10px] text-zinc-600">
                    Outlets: {briefForSlice.sources.join(' · ')}
                  </p>
                )}

                <div>
                  <div className="text-xs text-zinc-500 mb-2">Brief text</div>
                  <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto rounded border border-zinc-800/80 p-3 bg-zinc-950/60">
                    {briefForSlice.content}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'models' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              <Link href="/models" className="text-zinc-200/90 hover:underline">
                Browse registry →
              </Link>
            </p>
            <div className="rounded border border-zinc-800 overflow-x-auto max-h-[min(50vh,320px)] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 sticky top-0">
                    <th className="text-left px-3 py-2 text-zinc-500 font-medium">Model</th>
                    <th className="text-left px-3 py-2 text-zinc-500 font-medium">Provider</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {participation.map(p => (
                    <tr
                      key={p.model_id}
                      className={`hover:bg-zinc-900/30 ${p.anchor_lab ? 'bg-zinc-900/25' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/models/${encodeURIComponent(p.model_id)}`}
                            className="text-zinc-200 hover:text-white font-medium"
                          >
                            {p.model_name}
                          </Link>
                          {p.anchor_lab ? (
                            <span
                              title={`Flagship anchor (${p.anchor_lab})`}
                              className="inline-flex items-center rounded border border-zinc-600/80 bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400"
                            >
                              Anchor
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-zinc-500">{p.provider}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {participation.length === 0 && (
              <p className="text-xs text-zinc-600">No responses for this run yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
