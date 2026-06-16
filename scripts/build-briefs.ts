#!/usr/bin/env npx ts-node
/**
 * build-briefs.ts
 *
 * Builds EXTRACTIVE news briefs (real headlines + source + date, no LLM rewriting) for three
 * source-sets: balanced / left / right.
 *
 * Source priority:
 *   1. NewsAPI.org  — used when NEWS_API_KEY is set. Reliable, filters by domain + date range over
 *      the last ~30 days (exactly our backfill window). Free "developer" tier: 100 req/day.
 *   2. GDELT DOC 2.0 — no-key fallback. Free but rate-limits aggressively (429s).
 *
 * Modes:
 *   npm run build-briefs                         # latest (~last 36h), 1 brief/feed stamped now
 *   npm run build-briefs -- --date 2026-05-20    # that UTC day, 1 brief/feed stamped that day
 *   npm run build-briefs -- --range 2026-05-17 2026-06-16
 *        # backfill: fetch each feed in ~weekly chunks, bucket by day, write 1 brief/feed/day.
 *
 * No LLM summarizer is involved, which keeps cost + storage low and avoids layering a model's
 * interpretation on top of the model survey.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!
const NEWS_API_KEY = process.env.NEWS_API_KEY || ''

type FeedType = 'balanced' | 'left' | 'right'

// Source-sets define the three slices transparently: the difference is *which outlets*, not a
// summarizer's spin. Keep each list to ~6 domains - GDELT rejects overly long queries.
const FEED_DOMAINS: Record<FeedType, string[]> = {
  balanced: ['reuters.com', 'apnews.com', 'bbc.com', 'npr.org', 'cnn.com', 'axios.com'],
  left: ['theguardian.com', 'vox.com', 'msnbc.com', 'huffpost.com', 'slate.com', 'theatlantic.com'],
  right: ['foxnews.com', 'nationalreview.com', 'washingtonexaminer.com', 'nypost.com', 'dailywire.com', 'thefederalist.com'],
}

const FRIENDLY: Record<string, string> = {
  'reuters.com': 'Reuters', 'apnews.com': 'AP', 'bbc.com': 'BBC', 'npr.org': 'NPR', 'cnn.com': 'CNN',
  'axios.com': 'Axios', 'theguardian.com': 'The Guardian', 'vox.com': 'Vox', 'msnbc.com': 'MSNBC',
  'huffpost.com': 'HuffPost', 'slate.com': 'Slate', 'theatlantic.com': 'The Atlantic',
  'foxnews.com': 'Fox News', 'nationalreview.com': 'National Review',
  'washingtonexaminer.com': 'Washington Examiner', 'nypost.com': 'New York Post',
  'dailywire.com': 'The Daily Wire', 'thefederalist.com': 'The Federalist',
}

const FEEDS: FeedType[] = ['balanced', 'left', 'right']
const HEADLINES_PER_BRIEF = 14
const REQUEST_DELAY_MS = NEWS_API_KEY ? 1500 : 7000 // GDELT needs long spacing; NewsAPI does not.
const SOURCE = NEWS_API_KEY ? 'NewsAPI' : 'GDELT'

// ─── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function flagVal(flag: string): string | null {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] ?? null : null
}
const DATE_ARG = flagVal('--date')
const RANGE_START = flagVal('--range')
const RANGE_END = RANGE_START ? args[args.indexOf('--range') + 2] ?? null : null
function assertIso(v: string | null, label: string) {
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${label} must be yyyy-mm-dd, got ${v}`)
}
assertIso(DATE_ARG, '--date')
assertIso(RANGE_START, '--range start')
assertIso(RANGE_END, '--range end')

/** Normalized article shape across sources. */
interface Article {
  title: string
  url: string
  source: string
  date: Date | null
}

const sourceName = (d: string) => FRIENDLY[d.toLowerCase().replace(/^www\./, '')] ?? d.toLowerCase()
const fmtGdeltStamp = (dt: Date) => dt.toISOString().replace(/[-:T]/g, '').slice(0, 14) // YYYYMMDDHHMMSS

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function parseGdeltDate(s: string): Date | null {
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se))
}

async function backoffFetch(url: string, init: RequestInit, label: string): Promise<string | null> {
  const MAX = 4
  for (let attempt = 0; attempt < MAX; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) })
      if (res.status === 429) throw new Error('429 rate limited')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      const last = attempt === MAX - 1
      console.warn(`  ⚠️  ${label} attempt ${attempt + 1}/${MAX}: ${(err as Error).message}`)
      if (last) return null
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 1500)))
    }
  }
  return null
}

async function fetchNewsApi(feed: FeedType, start: Date, end: Date): Promise<Article[]> {
  const url =
    'https://newsapi.org/v2/everything?' +
    new URLSearchParams({
      domains: FEED_DOMAINS[feed].join(','),
      from: start.toISOString(),
      to: end.toISOString(),
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: '100',
    }).toString()
  const text = await backoffFetch(url, { headers: { 'X-Api-Key': NEWS_API_KEY } }, `${feed} NewsAPI`)
  if (!text) return []
  let data: { status?: string; message?: string; articles?: any[] }
  try {
    data = JSON.parse(text)
  } catch {
    console.warn(`  ⚠️  ${feed} NewsAPI non-JSON: ${text.slice(0, 100)}`)
    return []
  }
  if (data.status !== 'ok') {
    console.warn(`  ⚠️  ${feed} NewsAPI error: ${data.message ?? data.status}`)
    return []
  }
  return (data.articles ?? []).map(a => ({
    title: (a.title ?? '').trim(),
    url: a.url ?? '',
    source: a.source?.name ?? sourceName(domainFromUrl(a.url ?? '')),
    date: a.publishedAt ? new Date(a.publishedAt) : null,
  }))
}

async function fetchGdelt(feed: FeedType, start: Date, end: Date): Promise<Article[]> {
  const query = '(' + FEED_DOMAINS[feed].map(d => `domain:${d}`).join(' OR ') + ') sourcelang:eng'
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?' +
    new URLSearchParams({
      query, mode: 'ArtList', format: 'json', maxrecords: '250',
      sort: 'DateDesc', startdatetime: fmtGdeltStamp(start), enddatetime: fmtGdeltStamp(end),
    }).toString()
  const text = await backoffFetch(
    url,
    { headers: { 'User-Agent': 'Silicon Pulse research (+https://github.com/MaxMLang/silicon-pulse)' } },
    `${feed} GDELT`
  )
  if (!text || !text.trim().startsWith('{')) return []
  const data = JSON.parse(text) as { articles?: { url: string; title: string; seendate: string; domain: string }[] }
  return (data.articles ?? []).map(a => ({
    title: (a.title ?? '').trim(),
    url: a.url,
    source: sourceName(a.domain),
    date: parseGdeltDate(a.seendate),
  }))
}

const fetchArticles = NEWS_API_KEY ? fetchNewsApi : fetchGdelt

function buildPayload(articles: Article[]) {
  const seen = new Set<string>()
  const picked: Article[] = []
  for (const a of articles) {
    if (a.title.length < 12) continue
    const key = a.title.toLowerCase().slice(0, 90)
    if (seen.has(key)) continue
    seen.add(key)
    picked.push(a)
    if (picked.length >= HEADLINES_PER_BRIEF) break
  }
  if (picked.length === 0) return null
  const headlines = picked.map(a => ({
    title: a.title,
    source: a.source,
    url: a.url,
    summary: a.date ? a.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '',
  }))
  const sources = [...new Set(headlines.map(h => h.source))]
  const content = headlines
    .map((h, i) => `${i + 1}. ${h.title} — ${h.source}${h.summary ? ` (${h.summary})` : ''}`)
    .join('\n')
  return { content, headlines, sources }
}

async function insertBrief(sb: SupabaseClient, feed: FeedType, payload: NonNullable<ReturnType<typeof buildPayload>>, stamp: Date) {
  const { data, error } = await sb
    .from('news_briefs')
    .insert({ feed_type: feed, content: payload.content, headlines: payload.headlines, sources: payload.sources, created_at: stamp.toISOString() })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

function eachDay(startIso: string, endIso: string): string[] {
  const out: string[] = []
  const d = new Date(`${startIso}T00:00:00Z`)
  const end = new Date(`${endIso}T00:00:00Z`)
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

// ─── Single-day / latest mode ─────────────────────────────────────────────────
async function runSingle(sb: SupabaseClient) {
  let start: Date, end: Date, stamp: Date
  if (DATE_ARG) {
    start = new Date(`${DATE_ARG}T00:00:00Z`)
    end = new Date(`${DATE_ARG}T23:59:59Z`)
    stamp = new Date(`${DATE_ARG}T12:00:00Z`)
  } else {
    end = new Date()
    start = new Date(end.getTime() - 36 * 3600 * 1000)
    stamp = end
  }
  console.log(`Extractive briefs via ${SOURCE}${DATE_ARG ? ` for ${DATE_ARG}` : ' (latest)'}`)
  let healthy = 0
  for (const feed of FEEDS) {
    console.log(`\n📰 ${feed}...`)
    const articles = await fetchArticles(feed, start, end)
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS))
    const payload = buildPayload(articles)
    if (!payload) { console.warn(`  ❌ no ${feed} brief`); continue }
    const id = await insertBrief(sb, feed, payload, stamp)
    healthy++
    console.log(`  ✅ ${feed}: ${payload.headlines.length} headlines → ${id}`)
  }
  if (healthy < 2) console.warn('\n⚠️  Fewer than 2 briefs succeeded.')
}

// ─── Range mode (backfill): few queries, bucket by day ────────────────────────
async function runRange(sb: SupabaseClient, startIso: string, endIso: string) {
  console.log(`Extractive briefs via ${SOURCE} for range ${startIso} → ${endIso} (weekly fetch, bucketed by day)`)

  // Clear any existing briefs in the window so re-runs are idempotent.
  await sb.from('news_briefs').delete().gte('created_at', `${startIso}T00:00:00Z`).lte('created_at', `${endIso}T23:59:59Z`)

  const days = eachDay(startIso, endIso)

  // NewsAPI sorts newest-first and caps at 100 results, so a weekly chunk clusters on the latest day
  // or two. Fetch per-day for dense daily coverage (its request budget allows it). GDELT keeps weekly
  // chunks to limit calls against its harsh rate limit.
  const CHUNK_DAYS = NEWS_API_KEY ? 1 : 7

  async function fetchFeed(feed: FeedType): Promise<Map<string, Article[]>> {
    const byDay = new Map<string, Article[]>()
    let chunkStart = new Date(`${startIso}T00:00:00Z`)
    const rangeEnd = new Date(`${endIso}T23:59:59Z`)
    while (chunkStart.getTime() <= rangeEnd.getTime()) {
      const chunkEnd = new Date(Math.min(chunkStart.getTime() + CHUNK_DAYS * 86400_000 - 1000, rangeEnd.getTime()))
      const articles = await fetchArticles(feed, chunkStart, chunkEnd)
      console.log(`    ${chunkStart.toISOString().slice(0, 10)}…${chunkEnd.toISOString().slice(0, 10)}: ${articles.length} articles`)
      for (const a of articles) {
        if (!a.date) continue
        const key = a.date.toISOString().slice(0, 10)
        if (!byDay.has(key)) byDay.set(key, [])
        byDay.get(key)!.push(a)
      }
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS))
      chunkStart = new Date(chunkEnd.getTime() + 1000)
    }
    return byDay
  }

  const collected = new Map<FeedType, Map<string, Article[]>>()
  for (const feed of FEEDS) {
    console.log(`\n📰 ${feed}: fetching weekly chunks...`)
    collected.set(feed, await fetchFeed(feed))
  }

  // Second pass: a feed that came back completely empty was likely throttled, not genuinely empty.
  const empties = FEEDS.filter(f => (collected.get(f)?.size ?? 0) === 0)
  if (empties.length) {
    console.log(`\n⏳ Retrying empty feeds after cooldown: ${empties.join(', ')}`)
    await new Promise(r => setTimeout(r, 30000))
    for (const feed of empties) {
      console.log(`\n📰 ${feed} (retry): fetching weekly chunks...`)
      collected.set(feed, await fetchFeed(feed))
    }
  }

  let totalBriefs = 0
  for (const feed of FEEDS) {
    const byDay = collected.get(feed)!
    for (const day of days) {
      const payload = buildPayload(byDay.get(day) ?? [])
      if (!payload) continue
      await insertBrief(sb, feed, payload, new Date(`${day}T12:00:00Z`))
      totalBriefs++
    }
    const covered = days.filter(d => byDay.has(d)).length
    console.log(`  ✅ ${feed}: ${covered}/${days.length} days had headlines`)
  }

  console.log(`\nStored ${totalBriefs} briefs across the range.`)
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  if (!NEWS_API_KEY) {
    console.log('ℹ️  NEWS_API_KEY not set — falling back to GDELT (free but rate-limited). Add a NewsAPI.org key for reliable history.')
  }
  if (RANGE_START) {
    if (!RANGE_END) throw new Error('--range needs START and END (yyyy-mm-dd yyyy-mm-dd)')
    await runRange(sb, RANGE_START, RANGE_END)
  } else {
    await runSingle(sb)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
