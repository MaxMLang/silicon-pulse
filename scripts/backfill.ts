#!/usr/bin/env npx ts-node
/**
 * backfill.ts
 *
 * Fills the last N days of Silicon Pulse. For each day it stamps the run date and resolves the flagship
 * anchor roster as of that date (see src/config/anchor-models.json). Baseline (the wider, cheap panel)
 * runs every day. The flagship NEWS (informed) diets run every `informedStepDays`, using real historical
 * headlines pulled for that exact day (build-briefs --date).
 *
 *   npm run backfill -- --dry-run     # preview the schedule, write nothing
 *   npm run backfill                  # default window from survey-config.json
 *   npm run backfill -- --days 14 --informed-step 7
 */

import { spawnSync } from 'child_process'
import { surveyConfig } from '../src/lib/survey-config'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const NO_CLASSIFY = args.includes('--no-classify')

function intArg(flag: string, fallback: number): number {
  const i = args.indexOf(flag)
  if (i < 0) return fallback
  const v = parseInt(args[i + 1], 10)
  return Number.isFinite(v) ? v : fallback
}
function strArg(flag: string): string | null {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] ?? null : null
}

const DAYS = intArg('--days', surveyConfig.backfill.days)
const STEP = Math.max(1, intArg('--step', surveyConfig.backfill.stepDays))
const INFORMED_STEP = Math.max(1, intArg('--informed-step', surveyConfig.backfill.informedStepDays))
// Explicit window for "divide et impera" chunking: --from yyyy-mm-dd --to yyyy-mm-dd (inclusive).
const FROM = strArg('--from')
const TO = strArg('--to')
for (const [flag, v] of [['--from', FROM], ['--to', TO]] as const) {
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${flag} must be yyyy-mm-dd, got ${v}`)
}

interface DayPlan {
  date: string
  informed: boolean
}

/** UTC dates oldest→newest; mark every INFORMED_STEP-th day (counting from oldest) as an informed day. */
function buildPlan(days: number, step: number, informedStep: number): DayPlan[] {
  const out: DayPlan[] = []
  let idx = 0
  if (FROM && TO) {
    const start = new Date(`${FROM}T00:00:00Z`)
    const end = new Date(`${TO}T00:00:00Z`)
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + step)) {
      out.push({ date: d.toISOString().slice(0, 10), informed: idx % informedStep === 0 })
      idx++
    }
    return out
  }
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  for (let offset = days - 1; offset >= 0; offset -= step) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - offset)
    out.push({ date: d.toISOString().slice(0, 10), informed: idx % informedStep === 0 })
    idx++
  }
  return out
}

function run(cmd: string, cmdArgs: string[]): boolean {
  const res = spawnSync('npx', [cmd, ...cmdArgs], { stdio: 'inherit', env: process.env })
  return res.status === 0
}

const TSNODE = ['ts-node', '--project', 'scripts/tsconfig.json']

async function main() {
  const plan = buildPlan(DAYS, STEP, INFORMED_STEP)
  const informedDays = plan.filter(p => p.informed).length

  console.log('Silicon Pulse backfill')
  console.log(`  Window: ${plan[0].date} → ${plan[plan.length - 1].date}`)
  console.log(`  ${plan.length} baseline runs (step ${STEP}d); ${informedDays} with news diets (every ${INFORMED_STEP}th run)`)
  console.log(`  News = real historical headlines per informed day (NewsAPI/GDELT); anchors resolved per-date.\n`)

  if (DRY_RUN) {
    for (const p of plan) console.log(`  ${p.date}  ${p.informed ? 'baseline + news (anchors)' : 'baseline'}`)
    console.log('\nDry run: writing nothing. Re-run without --dry-run to execute.')
    // Still exercise one run-survey dry-run to validate roster/config.
    run(TSNODE[0], [...TSNODE.slice(1), 'scripts/run-survey.ts', '--run-date', plan[plan.length - 1].date, '--baseline-only', '--dry-run'])
    return
  }

  // Briefs are only needed on informed days (baseline days never read news), so build per informed
  // day. With a NewsAPI key that is just ~3 requests/day — far under the 100/day free budget — and it
  // gives dense, day-accurate headlines. run-survey then reads that day's brief for the informed pass.
  let ok = 0
  let failed = 0
  for (const p of plan) {
    console.log(`\n──────── ${p.date}${p.informed ? ' (+news)' : ''} ────────`)

    if (p.informed) {
      const briefsOk = run(TSNODE[0], [...TSNODE.slice(1), 'scripts/build-briefs.ts', '--date', p.date])
      if (!briefsOk) console.warn(`⚠️  Briefs failed for ${p.date}; this day falls back to baseline-only.`)
    }

    const surveyArgs = ['scripts/run-survey.ts', '--run-date', p.date]
    if (!p.informed) surveyArgs.push('--baseline-only')
    const success = run(TSNODE[0], [...TSNODE.slice(1), ...surveyArgs])
    if (success) ok++
    else {
      failed++
      console.warn(`⚠️  Survey run failed for ${p.date} (continuing).`)
    }
  }

  console.log(`\nBackfill runs: ok ${ok}, failed ${failed}`)

  if (!NO_CLASSIFY && ok > 0) {
    console.log('\nClassifying open-priorities themes across all unclassified responses...')
    if (!run(TSNODE[0], [...TSNODE.slice(1), 'scripts/classify-priority-themes.ts'])) {
      console.warn('⚠️  Theme classification step failed.')
    }
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
