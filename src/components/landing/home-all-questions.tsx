'use client'

import { useState } from 'react'
import { HomePriorities } from '@/components/landing/home-priorities'
import { HomeQuestions } from '@/components/landing/home-questions'
import { NEWS_DIET_OPTIONS } from '@/components/landing/news-diet-options'
import type { Survey, Response, FeedType } from '@/lib/types'

export function HomeAllQuestions({
  runId,
  surveys,
  responses,
}: {
  runId: string
  surveys: Survey[]
  responses: Response[]
}) {
  const [feed, setFeed] = useState<FeedType>('none')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">News diet for charts:</span>
        {NEWS_DIET_OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFeed(id)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              feed === id
                ? 'border-zinc-100/40 text-zinc-100 bg-white/5'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <HomePriorities runId={runId} feed={feed} />
      <HomeQuestions surveys={surveys} responses={responses} feed={feed} />
    </div>
  )
}
