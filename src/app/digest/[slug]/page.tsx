import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getRunDigestBySlug } from '@/lib/queries'
import { DigestRunCharts } from '@/components/digest/digest-run-charts'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const digest = await getRunDigestBySlug(decodeURIComponent(slug))
  if (!digest) return { title: 'Digest - Silicon Pulse' }
  return {
    title: `${digest.title} - Silicon Pulse`,
    description: digest.excerpt ?? undefined,
  }
}

export default async function DigestArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const digest = await getRunDigestBySlug(decodeURIComponent(slug))
  if (!digest) notFound()

  const paragraphs = digest.body.split(/\n\n+/).map(p => p.trim()).filter(Boolean)

  return (
    <article className="max-w-2xl">
      <p className="text-xs text-zinc-500 mb-6">
        <Link href="/digest" className="text-zinc-200/90 hover:underline">
          ← All digests
        </Link>
      </p>

      <header className="mb-8 pb-6 border-b border-zinc-800">
        <h1 className="text-xl font-bold text-white mb-3">{digest.title}</h1>
        <dl className="grid gap-2 text-sm text-zinc-400">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <dt className="text-zinc-600">Run date</dt>
            <dd className="font-mono text-zinc-300">{digest.run_date_display}</dd>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <dt className="text-zinc-600">Author</dt>
            <dd className="text-zinc-200">{digest.author_display_name}</dd>
          </div>
        </dl>
      </header>

      <div className="text-sm text-zinc-300 leading-relaxed space-y-4">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {p}
          </p>
        ))}
      </div>

      <section className="mt-10 pt-6 border-t border-zinc-800">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Key results</h2>
        <DigestRunCharts runId={digest.run_id} />
      </section>
    </article>
  )
}
