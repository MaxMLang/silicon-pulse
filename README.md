# Silicon Pulse

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)

Silicon Pulse asks the same set of survey questions to a bunch of LLMs on a schedule and tracks how their answers move over time. Every question is asked with no news (baseline), and the flagship models also get asked again with recent news headlines (left / balanced / right) added in front. Everything on the site is model output, not a human poll.

I built it to see how much the models agree, how news context shifts their answers, and how that changes as the model lineup updates.

## What's in here

- Next.js dashboard: latest run snapshot, per-question answer distributions, longitudinal charts, model comparison, the model registry, and a methodology page.
- Supabase (Postgres) for surveys, runs, responses, news briefs, and digests.
- OpenRouter for the model calls. The roster is 5 flagship anchors, a usage-ranked pool, and some open-weights models. Anchors are sampled a few times per question so you get a distribution instead of a single answer; the other models answer once. The news conditions only run on the anchors. All the knobs (caps, cadence, cheap helper models) are in [`src/config/survey-config.json`](./src/config/survey-config.json).
- A news-brief builder (NewsAPI, with GDELT as a fallback) for the three feeds.
- A backfill script to fill the dashboard with past-dated runs.
- A theme classifier for the open-ended "priorities" question, and an optional run digest written by a cheap model.

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
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase secret/service key (an `sb_secret_...` value is fine here) |
| `OPENROUTER_API_KEY` | yes | model calls |
| `NEWS_API_KEY` | no | NewsAPI key for briefs; falls back to GDELT if unset |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | publishable/anon key |

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
