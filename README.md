# Silicon Pulse

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)

**Silicon Pulse** is a small research dashboard for running the *same* original survey battery across many LLMs over time - baseline (no news) and optional left / balanced / right news briefs before the same questions. The pipeline is designed to run on a schedule: update the model list, build digests, call models, classify open-ended answers into coarse themes, and optionally generate a short run briefing. The site is meant to read like an autonomous panel: what you see are **model completions**, not human poll results.

I built it to watch how answers cluster, how they move when the information environment changes, and how that shifts between runs when the underlying model roster changes.

---

## What you get

- **Next.js** UI: latest run snapshot, answer overview, per-question breakdowns, longitudinal stacks, pairwise comparison, model registry
- **Supabase** for surveys, runs, responses, briefs, and optional run digests
- **OpenRouter** for model calls; registry sync picks from active text-generation models (with caps: baseline surveys up to 15 models, informed/news conditions up to 15 per slice to keep spend predictable)
- **RSS → briefs** script for the three informed feeds
- **Post-run** theme classification for the open “priorities” item and an optional **digest** article authored by a designated model from aggregate stats

Nothing here is legal, medical, or electoral advice - see the in-app **About → Disclaimer** before relying on anything for decisions.

---

## Quick start

**Prerequisites:** Node 20+, a [Supabase](https://supabase.com) project, and an [OpenRouter](https://openrouter.ai) API key.

```bash
git clone https://github.com/MaxMLang/silicon-pulse.git
cd silicon-pulse
npm install
cp .env.local.example .env.local
# Fill in Supabase URL, anon key, service role key, OpenRouter key
```

Apply SQL migrations in order (`supabase/migrations/`) in the Supabase SQL editor - start with `001`, then `002` if your project needs it, then `003` if you use run digests.

```bash
npm run update-models
npm run build-briefs
npm run run-survey
npm run classify-priority-themes
npm run generate-run-digest   # optional
npm run dev
# http://localhost:3000
```

Or one shot: `npm run full-run` (runs the shell script that chains the steps above in order).

---

## Scheduled runs (GitHub Actions)

The repo includes [`.github/workflows/survey-run.yml`](.github/workflows/survey-run.yml). It wakes **every day at 09:00 UTC**, but the survey only runs when the schedule says so:

- Set **`burstStart`** in [`survey-schedule.json`](./survey-schedule.json) to an ISO date (`"YYYY-MM-DD"`, interpreted in UTC) on the **first day** you want the initial **7-day daily** data-gathering window. After that week (seven calendar days starting that day), scheduled runs switch to **Mondays only** at the same time.
- Leave **`burstStart` as `null`** to skip the burst and use **weekly Mondays only** from the start.
- **Bootstrap:** scheduled runs do nothing until the **`runs`** table has at least one row. After deploy, run **Survey run** manually once (`workflow_dispatch`); after that, the cron can run according to the rules above. Manual runs always execute the full pipeline.

You can always run the pipeline manually (`workflow_dispatch`); that ignores the calendar gate and bootstrap. Set these **repository secrets**:

| Secret | Purpose |
|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (used where the client expects it) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role - required for scripts |
| `OPENROUTER_API_KEY` | Model API |

To use a different **steady-state** cadence than weekly Mondays, adjust the `Schedule gate` step and/or the cron in the workflow, or disable the schedule and run manually.

---

## Project layout

```
silicon-pulse/
├── src/app/           # Next.js App Router pages
├── src/components/    # UI
├── src/lib/           # Types, Supabase client, queries
├── scripts/           # update-models, build-briefs, run-survey, classify, digest
├── supabase/migrations/
├── survey-schedule.json  # GitHub Actions: burst window for daily-then-weekly runs
└── scripts/full-run.sh
```

---

## Contributing & citation

Issues and PRs are welcome. If you use this in academic work, cite the repository and the run date you used. The codebase is under the **MIT License** - see [`LICENSE`](./LICENSE). Underlying news text and third-party APIs remain subject to their own terms.

---

## Author

**MaxMLang** - [GitHub](https://github.com/MaxMLang)
