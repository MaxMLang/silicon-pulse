import Link from 'next/link'
import { clsx } from 'clsx'

export function DigestPagination({
  page,
  totalPages,
}: {
  page: number
  totalPages: number
}) {
  if (totalPages <= 1) return null

  const pages: (number | 'gap')[] = (() => {
    if (totalPages <= 11) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const s = new Set<number>()
    s.add(1)
    s.add(totalPages)
    for (let d = -2; d <= 2; d++) {
      const p = page + d
      if (p >= 1 && p <= totalPages) s.add(p)
    }
    const arr = [...s].sort((a, b) => a - b)
    const out: (number | 'gap')[] = []
    for (let i = 0; i < arr.length; i++) {
      if (i > 0 && arr[i]! - arr[i - 1]! > 1) out.push('gap')
      out.push(arr[i]!)
    }
    return out
  })()

  const link = (p: number, active: boolean) => (
    <Link
      key={p}
      href={p === 1 ? '/digest' : `/digest?page=${p}`}
      className={clsx(
        'min-w-[2.25rem] px-2 py-1.5 text-xs font-medium rounded border text-center transition-colors',
        active
          ? 'border-zinc-100/35 bg-white/5 text-zinc-100'
          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
      )}
    >
      {p}
    </Link>
  )

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 mt-8" aria-label="Digest pages">
      {page > 1 ? (
        <Link
          href={page === 2 ? '/digest' : `/digest?page=${page - 1}`}
          className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-200 border border-zinc-800 rounded"
        >
          Prev
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-xs text-zinc-700 border border-zinc-900 rounded cursor-not-allowed">
          Prev
        </span>
      )}
      {pages.map((p, i) =>
        p === 'gap' ? (
          <span key={`g-${i}`} className="px-1 text-zinc-600">
            …
          </span>
        ) : (
          link(p, p === page)
        )
      )}
      {page < totalPages ? (
        <Link
          href={`/digest?page=${page + 1}`}
          className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-200 border border-zinc-800 rounded"
        >
          Next
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-xs text-zinc-700 border border-zinc-900 rounded cursor-not-allowed">
          Next
        </span>
      )}
    </nav>
  )
}
