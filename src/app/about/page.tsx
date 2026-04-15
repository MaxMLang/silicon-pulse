import type { ReactNode } from 'react'
import { getAllModels } from '@/lib/queries'

export const metadata = {
  title: 'About - Silicon Pulse',
}

function Accordion({
  id,
  title,
  children,
  defaultOpen = false,
}: {
  id: string
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details
      id={id}
      className="rounded-lg border border-zinc-800 bg-zinc-900/20 group"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 text-sm font-medium text-zinc-100 hover:bg-zinc-900/50 rounded-lg [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-zinc-600 text-xs shrink-0 group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <div className="px-4 pb-4 pt-0 text-sm text-zinc-400 leading-relaxed border-t border-zinc-800/80 space-y-3">
        {children}
      </div>
    </details>
  )
}

export default async function AboutPage() {
  const models = await getAllModels()
  const active = models.filter(m => m.active)

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white mb-3">About</h1>
        <div className="text-sm text-zinc-400 leading-relaxed space-y-4">
          <p>
            <strong className="text-zinc-200">Silicon Pulse</strong> is an autonomous survey loop: many LLMs answer
            the same original items on a schedule, with optional news context. Run summaries and the public digest
            copy can be produced by models from aggregate stats - so the project is{' '}
            <strong className="text-zinc-200">run and reported by machines</strong>, within a fixed protocol you can
            inspect here. Nothing on this site is a poll of humans, and nothing should be read as models having
            “beliefs” in a folk-psychology sense; we store <strong className="text-zinc-200">completions</strong> for
            research comparison.
          </p>
          <p>
            Each <strong className="text-zinc-300">run</strong> pulls from the live model registry, attaches optional{' '}
            <strong className="text-zinc-300">news digests</strong> for informed conditions, and records answers for
            longitudinal views. The accordions below spell out motivation, how models and briefs are built, measurement,
            limits, and how to cite or reuse the work.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <Accordion id="why" title="Why Silicon Pulse" defaultOpen>
          <p>
            We want to observe what models produce under a <strong className="text-zinc-300">neutral study protocol</strong>{' '}
            (research participation, no persona): what they return as their default response to the same items over time.
            Millions of people use these systems every day as general assistants; tracking how that{' '}
            <strong className="text-zinc-300">baseline behavior</strong> moves, with and without news context, is a
            different question from impersonating a human panel or fabricating synthetic survey populations.{' '}
            <strong className="text-zinc-300">Silicon Pulse is built for that baseline-tracking question</strong>, not for
            role-play or demographic mimicry.
          </p>
          <p>
            The UI and summaries are there to make completions comparable across runs and diets; nothing here should be
            read as models having beliefs in a folk-psychology sense. See{' '}
            <a href="#no-role-prompts" className="text-zinc-200 underline-offset-2 hover:underline">
              Why we don&apos;t use role-based prompts
            </a>{' '}
            for research context on synthetic survey data and limits of human-mimicry designs.
          </p>
        </Accordion>

        <Accordion id="measure" title="What we measure">
          <p>
            Think of it as a panel where the panelists are API endpoints. Each run asks the same items: mostly
            closed-form survey-style questions, plus one <strong className="text-zinc-300">open priorities</strong>{' '}
            prompt (what national issue deserves the most attention right now). We store answers under four
            information diets: <strong className="text-zinc-300">baseline</strong> (no brief), and three informed
            slices - balanced, left-leaning, and right-leaning digests - so we can see whether completions move
            when the surrounding frame changes.
          </p>
          <p>
            Outputs are not interpreted as inner beliefs; they are completions under a protocol. The comparative
            signal is what matters: agreement vs spread, sensitivity to the brief, drift between runs when the
            model roster changes.
          </p>
        </Accordion>

        <Accordion id="runs" title="Runs & conditions">
          <p>
            A run is one batch: models are drawn from the registry, optional digests are attached, then each
            question is asked under each condition. <strong className="text-zinc-300">Baseline</strong> uses no news
            text and includes up to <strong className="text-zinc-300">15</strong> models.{' '}
            <strong className="text-zinc-300">Informed</strong> conditions (balanced / left / right digests) use the
            same question text with up to <strong className="text-zinc-300">15</strong> models per slice to keep the
            news-assisted portion bounded. Temperature is 0.
          </p>
          <p className="text-xs text-zinc-500">
            Failures and refusals appear as gaps in the data rather than silent drops.
          </p>
        </Accordion>

        <Accordion id="models-registry" title="Models & the registry">
          <p>
            The roster updates over time from the provider API; usable text-generation models are stored in{' '}
            <code className="text-zinc-300 text-xs">model_registry</code>. Model ids are stable strings so you can
            compare runs even when offerings change.
          </p>
          <p>
            <strong className="text-zinc-300">How models are selected.</strong> The panel is drawn from{' '}
            <strong className="text-zinc-300">OpenRouter</strong>: we take the{' '}
            <strong className="text-zinc-300">top 15</strong> eligible models on their public leaderboard (models are
            listed <strong className="text-zinc-300">by weekly usage</strong> on OpenRouter). On each sync we fetch that
            list, then filter to <strong className="text-zinc-300">text-generation</strong> chat endpoints only: we drop
            embeddings and rerankers, image or audio generators, non-instruct &quot;base&quot; checkpoints, free-tier
            endpoints, and models without enough context length or a positive per-token price. We then{' '}
            <strong className="text-zinc-300">deduplicate by model family</strong> (one representative per lineage, in
            OpenRouter&apos;s usage order) so we keep fifteen <strong className="text-zinc-300">different families</strong>{' '}
            rather than fifteen variants of the same stack. Those 15 become the active roster until the next sync. A survey
            run uses up to 15 models for <strong className="text-zinc-300">baseline</strong> and up to 15 for each{' '}
            <strong className="text-zinc-300">informed</strong> slice (same pool), so caps stay predictable.
          </p>
          <p>
            We record provider, origin where available, and rough capability metadata. Participation in a run is
            whoever returned usable responses under that run - there is no hand-picked panel beyond roster health.
            Separately, <strong className="text-zinc-300">flagship anchors</strong> (OpenAI, Anthropic, Google, xAI,
            DeepSeek) are listed in <code className="text-zinc-300 text-xs">src/config/anchor-models.json</code>: they
            are always merged into each run first (deduped against the leaderboard), then the weekly top-15 usage pool
            fills remaining slots up to the cap. Update that file when a lab ships a new flagship id; longitudinal charts
            can show handoffs between segments.
          </p>
          <p className="text-xs text-zinc-500">
            {active.length} active / {models.length} total in registry. The full roster, per-run participation, and
            links into model detail are on the <strong className="text-zinc-400 font-medium">landing page</strong>:
            use the Run snapshot card and open the <strong className="text-zinc-400 font-medium">Models</strong> tab
            (including “Browse all models” from there).
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {active.slice(0, 28).map(m => (
              <span key={m.id} className="text-[11px] px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-400">
                {m.display_name}
              </span>
            ))}
            {active.length > 28 && (
              <span className="text-[11px] text-zinc-600">+{active.length - 28} more…</span>
            )}
          </div>
        </Accordion>

        <Accordion id="prompts" title="Prompts & theme labels">
          <p>
            Closed items ask for one option plus a short rationale in a fixed format; option order is shuffled per
            call. The open priorities item is free text; answers are later grouped into coarse policy themes for
            charts.
          </p>
        </Accordion>

        <Accordion id="no-role-prompts" title="Why we don’t use role-based prompts">
          <p>
            We do <strong className="text-zinc-300">not</strong> ask models to play a demographic role (“answer as a
            45-year-old from…”) or to imitate a human respondent. That design choice is deliberate.
          </p>
          <p>
            Research that uses LLMs to fabricate <strong className="text-zinc-300">synthetic survey-style data</strong>,
            or to stand in for human samples with carefully engineered prompts, has shown{' '}
            <strong className="text-zinc-300">serious limits</strong>: systematic bias, weak alignment with real
            populations, and poor reliability as a drop-in for human polling. In work on German voter behavior,{' '}
            <strong className="text-zinc-300">Leah von der Heyde</strong>, <strong className="text-zinc-300">Anna-Carolina Haensch</strong>, and colleagues document these problems for LLM-generated synthetic datasets and related uses of language models to estimate opinion (e.g.{' '}
            <a
              href="https://arxiv.org/abs/2407.08563"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-200 underline-offset-2 hover:underline"
            >
              von der Heyde, Haensch &amp; Wenz, 2024
            </a>
            ; see also their analysis of bias in LLM-based synthetic survey data, e.g.{' '}
            <a
              href="https://osf.io/preprints/socarxiv/97r8s_v1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-200 underline-offset-2 hover:underline"
            >
              Assessing bias in LLM-generated synthetic datasets
            </a>
            ).
          </p>
          <p>
            That line of inquiry - whether and how LLMs can <strong className="text-zinc-300">mimic humans</strong> for
            survey research - is <strong className="text-zinc-300">important</strong>. This project is motivated
            differently: see <a href="#why" className="text-zinc-200 underline-offset-2 hover:underline">Why Silicon Pulse</a>{' '}
            for the neutral-protocol framing and what we are trying to measure instead.
          </p>
        </Accordion>

        <Accordion id="news-digests" title="News digests & feeds">
          <p>
            Three RSS-backed digests per run - <strong className="text-zinc-300">balanced</strong>,{' '}
            <strong className="text-zinc-300">left</strong>, and <strong className="text-zinc-300">right</strong> - are
            summarized into a readable block we inject before the same questions used in baseline. The goal is not
            perfect ideological matching; it is to <strong className="text-zinc-300">vary the surrounding news frame</strong>{' '}
            and observe whether completions shift.
          </p>
          <p>
            <strong className="text-zinc-300">How the brief is curated.</strong> Each slice pulls from a fixed set of{' '}
            <strong className="text-zinc-300">public RSS feeds</strong> (for example: balanced mixes wires and general
            outlets such as Reuters, AP, BBC, NPR, CNN, and The Verge; left-leaning includes sources such as The
            Guardian US and Vox; right-leaning includes sources such as Fox Politics and National Review). We drop items
            that look like sports, entertainment, or lifestyle when category cues match. Headlines are{' '}
            <strong className="text-zinc-300">deduplicated</strong>, ranked by recency, then assigned to rough buckets
            (breaking, politics, tech, world, general) so we can select a <strong className="text-zinc-300">mixed basket</strong>{' '}
            of stories instead of collapsing on a single topic. A small{' '}
            <strong className="text-zinc-300">LLM summarizer</strong> turns the chosen headlines into neutral, numbered
            paragraph briefings; that text is what
            models see as the news context. Headlines are stored with outlet names for attribution; summaries may be
            shortened. Use them in line with fair use and each publisher&apos;s terms.
          </p>
          <p className="text-xs text-zinc-500">
            The same digest text we prepend in production is on the{' '}
            <strong className="text-zinc-400 font-medium">landing page</strong>: open the Run snapshot card and
            choose the <strong className="text-zinc-400 font-medium">News digests</strong> tab to read briefs for
            the latest run.
          </p>
        </Accordion>

        <Accordion id="limits" title="Limits & caveats">
          <ul className="list-disc pl-4 space-y-2 text-zinc-400">
            <li>Timeouts, refusals, and formatting failures show up as missing answers.</li>
            <li>RSS feeds break; brief quality varies week to week.</li>
            <li>Model ids may be retired; historical rows can reference endpoints that no longer exist.</li>
            <li>Even at temperature 0, providers are not always bitwise-deterministic.</li>
          </ul>
        </Accordion>

        <Accordion id="disclaimer" title="Disclaimer & non-reliance">
          <p>
            This project is provided for <strong className="text-zinc-300">research and transparency</strong> only.
            It does not provide legal, financial, medical, or political advice. Do not use outputs here as a substitute
            for professional judgment, regulatory filings, or decisions affecting safety or rights.
          </p>
          <p>
            Survey wording is <strong className="text-zinc-300">original to this project</strong> and is not claimed
            to match any third-party poll verbatim. News excerpts and headlines are aggregated from public RSS sources
            and attributed where possible; reuse must respect copyright, fair use, and each publisher&apos;s terms.
          </p>
          <p>
            Model outputs can be wrong, biased, inconsistent, or outdated. Automated classification of open-ended
            answers uses coarse labels and may mis-bucket edge cases. The maintainer does not warrant fitness for any
            particular purpose. <strong className="text-zinc-300">Use at your own risk.</strong>
          </p>
        </Accordion>

        <Accordion id="contributions" title="Contributions, attribution & license">
          <p>
            Contributions are welcome via issues and pull requests on GitHub. Please keep changes focused and match
            existing code style. For substantial features, opening an issue first avoids duplicate work.
          </p>
          <p>
            If you use Silicon Pulse data or ideas in academic or public work, please cite the repository and the run
            date you relied on. A minimal attribution line is fine, e.g. &quot;Data from Silicon Pulse (Lang / MaxMLang,
            {new Date().getFullYear()})&quot; with a link to this repo.
          </p>
          <p>
            Respect the licenses of underlying APIs and models (e.g. provider terms for OpenRouter and each model).
            The application code in this repository is shared on the terms of the LICENSE file in the repo root - check
            that file for the exact license text.
          </p>
          <p className="text-xs text-zinc-500">
            Open source works best when forks and derivatives credit upstream work and clearly describe what changed.
          </p>
        </Accordion>
      </div>
    </div>
  )
}
