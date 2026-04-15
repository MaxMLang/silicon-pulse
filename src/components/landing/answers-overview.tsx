import type { AnswerOverviewRow } from '@/lib/consensus'
import { PRIORITIES_QUESTION_ID } from '@/lib/priorities-constants'

function topicLabel(row: AnswerOverviewRow): string {
  if (row.question_id === PRIORITIES_QUESTION_ID) return 'Political priorities'
  return row.topic
}

export function AnswersOverview({ rows }: { rows: AnswerOverviewRow[] }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/25 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800/80">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Answer overview (baseline, no news brief)
        </h2>
        <p className="text-xs text-zinc-600 mt-1">
          Plurality answer or top classified theme per item; the political-priority row shows the top theme across
          models; % is share among models with a valid response.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/80">
              <th className="text-left px-3 py-2 text-zinc-500 font-medium whitespace-nowrap">ID</th>
              <th className="text-left px-3 py-2 text-zinc-500 font-medium">Topic</th>
              <th className="text-left px-3 py-2 text-zinc-500 font-medium min-w-[180px]">Top answer / theme</th>
              <th className="text-right px-3 py-2 text-zinc-500 font-medium">Share</th>
              <th className="text-right px-3 py-2 text-zinc-500 font-medium">n</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {rows.map(row => (
              <tr key={row.question_id} className="hover:bg-zinc-900/30 align-top">
                <td className="px-3 py-2 font-mono text-zinc-200/95 whitespace-nowrap">{row.question_id}</td>
                <td className="px-3 py-2 text-zinc-500 max-w-[120px]">{topicLabel(row)}</td>
                <td className="px-3 py-2 text-zinc-200 leading-snug">{row.label}</td>
                <td className="px-3 py-2 text-right font-mono text-zinc-400">
                  {row.pct !== null ? `${row.pct}%` : '-'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-500">{row.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
