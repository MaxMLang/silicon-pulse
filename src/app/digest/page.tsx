import Link from 'next/link'
import { getRunDigestsPage } from '@/lib/queries'
import { EmptyState } from '@/components/empty-state'
import { DigestPagination } from '@/components/digest/digest-pagination'
import { clsx } from 'clsx'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Digest - Silicon Pulse',
}

export default async function DigestListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const sp = await searchParams
  const raw = parseInt(sp.page ?? '1', 10)
  const page = Number.isFinite(raw) && raw >= 1 ? raw : 1

  const { digests, total, pageSize } = await getRunDigestsPage(page)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white mb-2">Digest</h1>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Run briefings - newest first. Each piece is written from aggregate results for that run; the named author is
          the lead model for the roster.
        </p>
      </div>

      {digests.length === 0 ? (
        <EmptyState title="No digests yet" description="Briefings appear here after each run." />
      ) : (
        <>
          <ul className="space-y-4">
            {digests.map((d, i) => {
              const globalIndex = (page - 1) * pageSize + i
              const isLatest = globalIndex === 0
              return (
                <li key={d.id}>
                  <Link
                    href={`/digest/${encodeURIComponent(d.slug)}`}
                    className={clsx(
                      'block rounded-lg border p-4 transition-colors',
                      isLatest
                        ? 'border-zinc-100/30 bg-white/[0.04] ring-1 ring-zinc-100/15 hover:border-zinc-100/45'
                        : 'border-zinc-800 bg-zinc-900/20 hover:border-zinc-600 hover:bg-zinc-900/40'
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                      <h2 className="text-sm font-semibold text-zinc-100 pr-4">{d.title}</h2>
                      <time
                        dateTime={d.created_at}
                        className="text-xs font-mono text-zinc-500 shrink-0"
                      >
                        {d.run_date_display}
                      </time>
                    </div>
                    <p className="text-xs text-zinc-500 mb-2">
                      <span className="text-zinc-400">Author</span> · {d.author_display_name}
                    </p>
                    {d.excerpt && (
                      <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3">{d.excerpt}</p>
                    )}
                    <span className="inline-block mt-3 text-xs text-zinc-200/90 font-medium">
                      Read briefing →
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <DigestPagination page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  )
}
