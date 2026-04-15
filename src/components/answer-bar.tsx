/**
 * Horizontal stacked bar showing answer distribution vs. human ground truth.
 */

interface AnswerBarProps {
  options: string[]
  modelDist: Record<string, number>
  humanDist: Record<string, number>
  showHuman?: boolean
}

const COLORS = [
  '#fafafa',
  '#a1a1aa',
  '#71717a',
  '#52525b',
  '#3f3f46',
  '#27272a',
]

export function AnswerBar({ options, modelDist, humanDist, showHuman = true }: AnswerBarProps) {
  const total = Object.values(modelDist).reduce((s, v) => s + v, 0)

  if (total === 0) {
    return (
      <div className="text-xs text-zinc-600 italic">No responses</div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* Model distribution */}
      <div className="flex h-5 w-full overflow-hidden rounded gap-px">
        {options.map((opt, i) => {
          const pct = modelDist[opt] ?? 0
          if (pct === 0) return null
          return (
            <div
              key={opt}
              style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
              className="h-full flex items-center justify-center overflow-hidden"
              title={`${opt}: ${pct}%`}
            />
          )
        })}
      </div>

      {/* Human ground truth */}
      {showHuman && Object.keys(humanDist).length > 0 && (
        <div className="flex h-3 w-full overflow-hidden rounded gap-px opacity-40">
          {options.map((opt, i) => {
            const pct = humanDist[opt] ?? 0
            if (pct === 0) return null
            return (
              <div
                key={opt}
                style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                className="h-full"
                title={`Human ${opt}: ${pct}%`}
              />
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {options.map((opt, i) => (
          <div key={opt} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-sm shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-xs text-zinc-400">{opt}</span>
            <span className="text-xs text-zinc-500 font-mono">
              {modelDist[opt] ?? 0}%
              {showHuman && humanDist[opt] !== undefined && (
                <span className="text-zinc-600"> / {humanDist[opt]}%</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
