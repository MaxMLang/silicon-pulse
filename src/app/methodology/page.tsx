import type { ReactNode } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { getAllModels } from '@/lib/queries'
import { getAnchorConfig, sortSegmentsByEffectiveFrom } from '@/lib/anchor-models'

const shortModelId = (id: string) => id.split('/').pop() ?? id

export const metadata = {
  title: 'Methodology - Silicon Pulse',
  description:
    'How Silicon Pulse runs the same survey battery across many LLMs over time: the panel, conditions, news diets, scoring, and honest caveats.',
}

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string
  n: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="flex items-baseline gap-3 text-base font-semibold text-white mb-3">
        <span className="font-mono text-xs text-zinc-600">{n}</span>
        {title}
      </h2>
      <div className="text-sm text-zinc-400 leading-relaxed space-y-3">{children}</div>
    </section>
  )
}

const STEPS = [
  { k: 'Panel', v: 'Flagship models from major labs, plus the week’s most-used models.' },
  { k: 'Ask', v: 'The same survey items, no persona, options shuffled, temperature 0.' },
  { k: 'Vary', v: 'Repeat with balanced / left / right news briefs prepended.' },
  { k: 'Record', v: 'Store every completion so runs can be compared over time.' },
]

export default async function MethodologyPage() {
  const models = await getAllModels()
  const active = models.filter(m => m.active)
  const anchors = getAnchorConfig().anchors

  return (
    <div className="max-w-3xl space-y-12">
      {/* Pitch */}
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Methodology</p>
        <h1 className="text-2xl font-bold text-white leading-tight">
          Hundreds of millions of people use LLMs every day. This tracks what they say - unprompted.
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Silicon Pulse is an autonomous panel where the respondents are language models. On a schedule, many
          models answer the <strong className="text-zinc-200">same</strong> survey items under a fixed,
          inspectable protocol - with no role-play and no persona. We don&apos;t ask them to imitate a person;
          we record their <strong className="text-zinc-200">default completions</strong> and watch how they
          cluster, how they move when the news frame changes, and how they drift as the model roster changes.
        </p>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Nothing here is a poll of humans, and nothing should be read as a model having &ldquo;beliefs.&rdquo;
          These are completions, stored for research comparison.
        </p>
      </header>

      {/* At a glance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STEPS.map((s, i) => (
          <div key={s.k} className="rounded-lg border border-zinc-800 bg-zinc-900/20 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-zinc-600">{i + 1}</span>
              <span className="text-sm font-medium text-zinc-100">{s.k}</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{s.v}</p>
          </div>
        ))}
      </div>

      <Section id="panel" n="01" title="Who answers">
        <p>
          The panel mixes two things on purpose. <strong className="text-zinc-300">Flagship anchors</strong> -
          one current headline model per major lab (OpenAI, Anthropic, Google, xAI, DeepSeek) - are always
          included so longitudinal comparison stays clean. The remaining slots are filled from the{' '}
          <strong className="text-zinc-300">most-used models that week</strong> on OpenRouter&apos;s public
          leaderboard, deduplicated to one representative per model family.
        </p>
        <p>
          When a lab ships a new default model, we record a <strong className="text-zinc-300">cutover</strong>{' '}
          with an effective date, so a shift in a series reflects a change of endpoint rather than an
          unexplained jump. Exact model ids and dates are published with the open-source project.
        </p>
        <p className="text-xs text-zinc-500">
          {active.length} models currently active · {models.length} in the registry. The full roster and
          per-run participation are on the <Link href="/" className="text-zinc-300 underline-offset-2 hover:underline">landing page</Link>.
        </p>
      </Section>

      <Section id="anchor-changes" n="02" title="Flagship anchor changelog">
        <p>
          One headline model per lab anchors the longitudinal series. When a lab ships a new default, we record a{' '}
          <strong className="text-zinc-300">cutover</strong> with an effective date, so a shift in a chart reflects a
          changed endpoint rather than an unexplained jump. The full history is below.
        </p>
        <div className="space-y-2 not-prose">
          {anchors.map(def => {
            const segs = sortSegmentsByEffectiveFrom(def)
            const current = segs[segs.length - 1]
            const changes = segs.length - 1
            return (
              <details key={def.lab} className="group rounded-lg border border-zinc-800 bg-zinc-900/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-zinc-200">{def.displayLabel}</span>
                    <span className="truncate font-mono text-xs text-zinc-500">{shortModelId(current.modelId)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-600">
                    {changes > 0 ? `${changes} cutover${changes > 1 ? 's' : ''}` : 'no changes yet'}
                    <span className="inline-block transition-transform group-open:rotate-180">⌄</span>
                  </span>
                </summary>
                <ol className="divide-y divide-zinc-800/60 border-t border-zinc-800">
                  {[...segs].reverse().map((seg, i) => (
                    <li
                      key={`${seg.modelId}-${seg.effectiveFrom}`}
                      className="flex items-center justify-between gap-3 px-4 py-2 text-xs"
                    >
                      <span className="font-mono text-zinc-300">{shortModelId(seg.modelId)}</span>
                      <span className="shrink-0 text-zinc-500">
                        {i === 0 && <span className="text-emerald-400/80">current · </span>}
                        from {format(parseISO(seg.effectiveFrom), 'MMM d, yyyy')}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            )
          })}
        </div>
        <p className="text-xs text-zinc-500">
          See these handoffs marked inline on the{' '}
          <Link href="/longitudinal" className="text-zinc-300 underline-offset-2 hover:underline">longitudinal view</Link>.
        </p>
      </Section>

      <Section id="questions" n="03" title="What we ask">
        <p>
          Mostly closed-form items across a deliberately <strong className="text-zinc-300">broad range of
          topics</strong> - technology and AI, the economy, institutions and the media, the environment,
          social trust, the role of government, work and automation, free expression, and more - plus one
          open-ended <strong className="text-zinc-300">priorities</strong> prompt.
        </p>
        <p>
          Wording is <strong className="text-zinc-300">original to this project</strong>. Where an item echoes
          a long-running social-science theme, we adapt the <em>theme</em> (e.g. from public instruments like
          the World Values Survey or the General Social Survey) but never copy poll text verbatim, so the
          battery stays license-clean. Each closed item asks for one option plus a one-sentence rationale, and
          option order is shuffled on every call.
        </p>
      </Section>

      <Section id="conditions" n="04" title="Baseline vs. news diets">
        <p>
          Every item is asked <strong className="text-zinc-300">baseline</strong> (no news) and again under
          three <strong className="text-zinc-300">informed</strong> conditions, where a short briefing built
          from <strong className="text-zinc-300">balanced</strong>, <strong className="text-zinc-300">left</strong>,
          and <strong className="text-zinc-300">right</strong> RSS feeds is prepended before the same question.
          The aim isn&apos;t perfect ideological matching - it&apos;s to vary the surrounding frame and see
          whether completions move.
        </p>
        <p>
          To keep cost predictable, the news conditions run on the <strong className="text-zinc-300">flagship
          anchors</strong> by default, while baseline covers the wider panel. The exact briefs for the latest
          run are visible from the landing page.
        </p>
      </Section>

      <Section id="scoring" n="05" title="Reading the results">
        <p>
          We don&apos;t score answers against a &ldquo;correct&rdquo; human distribution. The signal is{' '}
          <strong className="text-zinc-300">comparative</strong>: how much the panel agrees vs. spreads, how
          sensitive answers are to the news brief, and how things <strong className="text-zinc-300">drift</strong>{' '}
          between runs. Open-ended priorities are grouped into coarse policy themes by a small classifier model
          for charting. Failures and refusals show up as gaps, not silent drops.
        </p>
        <p>
          Each run can also produce a short <strong className="text-zinc-300">briefing</strong> written by a
          model from the run&apos;s aggregate statistics - the project is run and reported by machines, within
          this protocol. To keep spend low, that briefing and the theme classifier use an inexpensive model.
        </p>
      </Section>

      <Section id="limits" n="06" title="Limits & honest caveats">
        <ul className="list-disc pl-4 space-y-2">
          <li>These are model completions under one protocol - not human opinion, and not model &ldquo;beliefs.&rdquo;</li>
          <li>Flagship models are sampled several times per question; other models answer once.</li>
          <li>News feeds break and brief quality varies week to week.</li>
          <li>Automated theme labels are coarse and can mis-bucket edge cases.</li>
          <li>Retired model ids may linger in older rows.</li>
        </ul>
        <p className="text-xs text-zinc-500">
          For research only - not legal, financial, medical, or political advice. See the{' '}
          <Link href="/about" className="text-zinc-300 underline-offset-2 hover:underline">About</Link> page for
          the full disclaimer, the research framing behind avoiding role-prompts, and citation guidance.
        </p>
      </Section>
    </div>
  )
}
