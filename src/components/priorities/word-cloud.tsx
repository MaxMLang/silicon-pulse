'use client'

import { useMemo } from 'react'
import { buildWordFrequencies } from '@/lib/word-cloud'

export function AnswerWordCloud({ texts }: { texts: string[] }) {
  const items = useMemo(() => buildWordFrequencies(texts, 56), [texts])

  if (items.length === 0) {
    return (
      <p className="text-xs text-zinc-600 py-8 text-center">
        No tokenizable text yet - raw answers appear after a survey run.
      </p>
    )
  }

  const max = items[0]?.count ?? 1
  const min = items[items.length - 1]?.count ?? 1
  const span = Math.max(max - min, 1)

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 content-start min-h-[200px] p-2">
      {items.map(({ word, count }) => {
        const t = (count - min) / span
        const fontSize = 11 + Math.round(t * 16)
        const opacity = 0.45 + t * 0.55
        return (
          <span
            key={word}
            title={`${count}×`}
            className="text-zinc-200 leading-tight select-none"
            style={{ fontSize, opacity }}
          >
            {word}
          </span>
        )
      })}
    </div>
  )
}
