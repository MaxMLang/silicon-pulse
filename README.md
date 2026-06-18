# Silicon Pulse

<p align="center">
  <img src="./silicon-pulse.gif" alt="Silicon Pulse" width="520" />
</p>

<p align="center">
  <a href="https://silicon-pulse.vercel.app">
    <img src="https://img.shields.io/badge/Visit_the_live_site-silicon--pulse.vercel.app-3ECF8E?style=for-the-badge&logo=vercel&logoColor=white" alt="Visit the live site" />
  </a>
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" /></a>
  <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License: MIT" /></a>
</p>

## The idea

People keep asking what LLMs "think" about the issues of the day. The honest answer is that it depends on which model you ask, when you ask it, and what it just read. Silicon Pulse turns that into something you can actually watch.

It puts a fixed set of survey questions to a panel of LLMs on a schedule and tracks how their answers move over time. Same questions, same wording, run again and again. You get a running record instead of a one-off screenshot, so you can see where the models line up, where they split, and how the picture shifts as new models ship.

Two things make it more than a quiz:

- It runs by itself. A cron job asks the questions, classifies the open-ended answers, and writes up the run. Nobody is in the loop nudging the results.
- It tests for news influence. Flagship models get asked each question twice: once cold with no context, and once with recent headlines (left, balanced, or right) pasted in front. The gap between those two answers is the interesting part.

Everything on the site is model output. It is not a human poll, and it is not advice. It is a mirror held up to the models themselves.

## How it works, briefly

- A baseline pass asks every model each question with no extra context.
- The flagship anchors get a second pass per news feed, so you can compare a cold answer to a headline-primed one.
- Anchors are sampled a few times per question to get a distribution rather than a single answer; the wider pool answers once.
- Open-ended answers (like "most important issue") get sorted into themes by a cheap classifier.

The full write-up, including model selection and sampling, lives on the in-app [methodology page](https://silicon-pulse.vercel.app/methodology).

## What's in the repo

- A Next.js dashboard: latest run snapshot, per-question distributions, longitudinal charts, model comparison, the model registry, and the methodology page.
- Supabase (Postgres) for surveys, runs, responses, news briefs, and digests.
- OpenRouter for the model calls, with all the knobs (caps, cadence, helper models) in [`src/config/survey-config.json`](./src/config/survey-config.json).
- A news-brief builder (NewsAPI, with GDELT as a fallback) for the three feeds.
- A backfill script to seed the dashboard with past-dated runs.

This is not legal, medical, or electoral advice. See the in-app About page.

## Setup

You need Node 20+, a [Supabase](https://supabase.com) project, and an [OpenRouter](https://openrouter.ai) key.

```bash
git clone https://github.com/MaxMLang/silicon-pulse.git
cd silicon-pulse
npm install
cp .env.local.example .env.local
# fill in the keys
```

Run the SQL files in [`supabase/migrations/`](./supabase/migrations) in order (001 through 008) in the Supabase SQL editor. Migration 006 turns on row-level security (public read, writes only with the secret key). Skip it and the dashboard reads zero rows.

Keys: new Supabase projects give you a publishable key (`sb_publishable_...`) and a secret key (`sb_secret_...`). Both the new env names (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) and the old ones (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) work.

Then:

```bash
npm run update-models           # sync the OpenRouter roster + flagship anchors
npm run build-briefs            # balanced / left / right news briefs
npm run run-survey              # baseline + (anchors-only) informed conditions
npm run classify-priority-themes
npm run generate-run-digest     # optional, uses a cheap author model
npm run dev                     # http://localhost:3000
```

Or `npm run full-run` to do all of it in order.

### Backfill

Fills the dashboard with past dates. It stamps each run with its date, picks the anchor models that were live then, and pulls that day's real headlines for the news conditions. Run `update-models` first.

```bash
npm run backfill -- --dry-run                          # preview the dates, write nothing
npm run backfill                                       # default: 30 days, one run every 3 days
npm run backfill -- --days 14                          # custom window
npm run backfill -- --step 1                           # daily instead of every 3 days
npm run backfill -- --from 2026-05-17 --to 2026-06-16  # explicit window (handy for chunking)
```

## Scheduled runs (GitHub Actions)

[`.github/workflows/survey-run.yml`](./.github/workflows/survey-run.yml) runs the full pipeline (survey, classify, digest) on a cron: Mondays and Thursdays at 09:00 UTC. You can also trigger it by hand from the Actions tab with "Run workflow", which skips the gate.

The only gate on scheduled runs is bootstrap: nothing runs until the `runs` table has at least one row, so trigger it manually once (or do a backfill) first. The job runs on Node 24.

Add these repository secrets under Settings > Secrets and variables > Actions:

| Secret | Required | What it is |
|--------|----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SECRET_KEY` | yes | Supabase secret key (`sb_secret_...`) |
| `OPENROUTER_API_KEY` | yes | model calls |
| `NEWS_API_KEY` | no | NewsAPI key for briefs; falls back to GDELT if unset |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no | publishable/anon key |

## Deploy (Vercel)

Import the repo in Vercel, set `NEXT_PUBLIC_SUPABASE_URL` and the publishable/anon key (that's all the read-only site needs), and deploy. The data pipeline runs from GitHub Actions, not from Vercel.

## Layout

```
silicon-pulse/
├── src/app/                  # Next.js pages, including /methodology
├── src/components/           # UI
├── src/lib/                  # types, Supabase client, queries, config loader, anchors
├── src/config/
│   ├── anchor-models.json    # one flagship per lab, with dated cutover segments
│   └── survey-config.json    # cost / cadence / model knobs in one place
├── scripts/                  # update-models, build-briefs, run-survey, backfill, classify, digest
├── supabase/migrations/      # 001 through 008
└── scripts/full-run.sh
```

## License

MIT, see [`LICENSE`](./LICENSE). News text and third-party APIs keep their own terms.

Built by [MaxMLang](https://github.com/MaxMLang).
