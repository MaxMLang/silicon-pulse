#!/usr/bin/env npx ts-node
/**
 * build-briefs.ts
 *
 * Pulls RSS feeds for each feed type, filters content, summarizes headlines
 * using a cheap model, and stores the brief in the news_briefs table.
 *
 * Run: npx ts-node scripts/build-briefs.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Summarizer model - cheap and fast
const SUMMARIZER_MODEL = 'anthropic/claude-haiku-4-5'

// ─── RSS Feed Config ──────────────────────────────────────────────────────────

interface RSSFeed {
  name: string
  url: string
  type: 'balanced' | 'left' | 'right'
  /** Hint for diversity bucketing (not exclusive) */
  topic: 'politics' | 'tech' | 'world' | 'general'
}

const RSS_FEEDS: RSSFeed[] = [
  // Balanced - mix of wires, politics, tech, world
  { name: 'Reuters (Google)', url: 'https://news.google.com/rss/search?q=source:reuters.com&hl=en-US&gl=US&ceid=US:en', type: 'balanced', topic: 'world' },
  { name: 'AP News (Google)', url: 'https://news.google.com/rss/search?q=source:apnews.com&hl=en-US&gl=US&ceid=US:en', type: 'balanced', topic: 'world' },
  { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', type: 'balanced', topic: 'world' },
  { name: 'BBC Politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', type: 'balanced', topic: 'politics' },
  { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', type: 'balanced', topic: 'tech' },
  { name: 'NPR Top', url: 'https://feeds.npr.org/1001/rss.xml', type: 'balanced', topic: 'general' },
  { name: 'NPR Politics', url: 'https://feeds.npr.org/1014/rss.xml', type: 'balanced', topic: 'politics' },
  { name: 'CNN Top', url: 'http://rss.cnn.com/rss/cnn_topstories.rss', type: 'balanced', topic: 'general' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'balanced', topic: 'tech' },
  // Left-leaning
  { name: 'The Guardian US', url: 'https://www.theguardian.com/us-news/rss', type: 'left', topic: 'politics' },
  { name: 'Vox', url: 'https://www.vox.com/rss/index.xml', type: 'left', topic: 'general' },
  // Right-leaning
  { name: 'Fox Politics', url: 'https://moxie.foxnews.com/google-publisher/politics.xml', type: 'right', topic: 'politics' },
  { name: 'National Review', url: 'https://www.nationalreview.com/feed/', type: 'right', topic: 'politics' },
]

// Categories to filter out (entertainment/sports/lifestyle)
const SKIP_CATEGORIES = [
  'sports', 'entertainment', 'celebrity', 'fashion', 'lifestyle',
  'food', 'travel', 'weather', 'horoscope', 'crossword',
]

// ─── RSS Parsing ──────────────────────────────────────────────────────────────

interface RSSItem {
  title: string
  description: string
  source: string
  pubDate: string | null
  link: string | null
  categories: string[]
  feedTopic: RSSFeed['topic']
}

async function fetchRSSFeed(feed: RSSFeed): Promise<RSSItem[]> {
  try {
    const response = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      console.warn(`  ⚠️  ${feed.name}: HTTP ${response.status}`)
      return []
    }

    const text = await response.text()
    return parseRSSXML(text, feed.name, feed.topic)
  } catch (err) {
    console.warn(`  ⚠️  ${feed.name}: ${(err as Error).message}`)
    return []
  }
}

function parseRSSXML(xml: string, sourceName: string, feedTopic: RSSFeed['topic']): RSSItem[] {
  const items: RSSItem[] = []

  // Extract <item> blocks
  const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)

  for (const match of itemMatches) {
    const block = match[1]

    const title = extractTag(block, 'title') ?? ''
    const description = extractTag(block, 'description') ?? ''
    const pubDate = extractTag(block, 'pubDate')
    const link = extractTag(block, 'link') ?? extractTag(block, 'guid')

    // Extract categories
    const catMatches = [...block.matchAll(/<category[^>]*>(.*?)<\/category>/gi)]
    const categories = catMatches.map(m => m[1].trim().toLowerCase())

    if (title.length > 10) {
      items.push({
        title: stripHtml(title),
        description: stripHtml(description).slice(0, 500),
        source: sourceName,
        pubDate,
        link: link?.trim() ?? null,
        categories,
        feedTopic,
      })
    }
  }

  return items
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'))
    ?? xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1].trim() : null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isRelevant(item: RSSItem): boolean {
  const text = `${item.title} ${item.categories.join(' ')}`.toLowerCase()
  return !SKIP_CATEGORIES.some(skip => text.includes(skip))
}

function itemRecencyMs(item: RSSItem): number {
  if (!item.pubDate) return 0
  const d = new Date(item.pubDate).getTime()
  return Number.isNaN(d) ? 0 : d
}

const BUCKET_KEYWORDS: Record<'politics' | 'tech' | 'world' | 'breaking', string[]> = {
  politics: [
    'congress', 'senate', 'election', 'president', 'white house', 'supreme court', 'governor',
    'democrat', 'republican', 'politic', 'vote', 'campaign', 'capitol', 'federal', 'lawmaker',
    'ballot', 'gop', 'dnc', 'rnc', 'impeach', 'cabinet',
  ],
  tech: [
    'openai', 'chatgpt', 'anthropic', 'google', 'apple', 'microsoft', 'meta', 'amazon', 'tesla',
    'software', 'chip', 'semiconductor', 'cyber', 'iphone', 'android', 'startup', 'cryptocurrency',
    'bitcoin', 'nvidia', 'ai ', ' ai,', ' ai.', 'artificial intelligence', 'llm', 'model release',
  ],
  world: [
    'ukraine', 'russia', 'china', 'nato', 'middle east', 'europe', 'asia', 'africa', 'gaza',
    'israel', 'iran', 'syria', 'putin', 'zelensky', 'embassy', 'summit', 'sanctions', 'un ',
  ],
  breaking: [
    'breaking', 'killed', 'dies', 'dead', 'shooting', 'crash', 'explosion', 'charged', 'indicted',
    'verdict', 'sentenced', 'hostage', 'attack', 'arrest', 'convicted', 'outbreak',
  ],
}

function inferBucket(item: RSSItem): 'politics' | 'tech' | 'world' | 'breaking' | 'general' {
  const t = ` ${item.title} ${item.description} ${item.categories.join(' ')} `.toLowerCase()
  if (BUCKET_KEYWORDS.breaking.some(k => t.includes(k))) return 'breaking'
  if (item.feedTopic === 'tech' && BUCKET_KEYWORDS.tech.some(k => t.includes(k.trim()))) return 'tech'
  if (BUCKET_KEYWORDS.politics.some(k => t.includes(k))) return 'politics'
  if (BUCKET_KEYWORDS.tech.some(k => t.includes(k.trim()))) return 'tech'
  if (BUCKET_KEYWORDS.world.some(k => t.includes(k))) return 'world'
  if (item.feedTopic === 'politics') return 'politics'
  if (item.feedTopic === 'tech') return 'tech'
  if (item.feedTopic === 'world') return 'world'
  return 'general'
}

/** Prefer a mix of politics, tech, world, breaking, and general - not only the newest headlines. */
function selectDiverseHeadlines(items: RSSItem[], limit: number): RSSItem[] {
  const key = (it: RSSItem) => `${it.link ?? ''}::${it.title.slice(0, 120)}`
  const seen = new Set<string>()
  const uniq: RSSItem[] = []
  for (const it of items) {
    const k = key(it)
    if (seen.has(k)) continue
    seen.add(k)
    uniq.push(it)
  }
  uniq.sort((a, b) => itemRecencyMs(b) - itemRecencyMs(a))

  const pools: Record<'politics' | 'tech' | 'world' | 'breaking' | 'general', RSSItem[]> = {
    politics: [],
    tech: [],
    world: [],
    breaking: [],
    general: [],
  }
  for (const it of uniq) {
    pools[inferBucket(it)].push(it)
  }

  const targets: Record<keyof typeof pools, number> = {
    breaking: 2,
    politics: 3,
    world: 3,
    tech: 3,
    general: 3,
  }

  const out: RSSItem[] = []
  const used = new Set<string>()

  function takeFrom(bucket: keyof typeof pools, max: number) {
    let n = 0
    for (const it of pools[bucket]) {
      if (out.length >= limit || n >= max) return
      const k = key(it)
      if (used.has(k)) continue
      used.add(k)
      out.push(it)
      n++
    }
  }

  const priority: (keyof typeof pools)[] = ['breaking', 'politics', 'world', 'tech', 'general']
  // Pass 1: meet minimum targets per bucket (recency already sorted within pools)
  for (const b of priority) {
    takeFrom(b, targets[b])
  }
  // Pass 2: round-robin one more from each bucket while room remains
  for (let round = 0; round < 3 && out.length < limit; round++) {
    for (const b of priority) {
      takeFrom(b, 1)
      if (out.length >= limit) break
    }
  }
  // Pass 3: fill by global recency
  for (const it of uniq) {
    if (out.length >= limit) break
    const k = key(it)
    if (used.has(k)) continue
    used.add(k)
    out.push(it)
  }

  return out.slice(0, limit)
}

// ─── Brief Generation ─────────────────────────────────────────────────────────

async function summarizeHeadlines(headlines: string[]): Promise<string> {
  const headlineList = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')

  const prompt = `You are a news editor creating a concise briefing from recent headlines.
The set spans politics, technology, world news, and breaking stories - preserve that breadth; do not collapse everything into a single theme.

For each headline below, write 2-3 sentences summarizing what happened, why it matters, and any relevant context. Be factual and neutral.

Headlines:
${headlineList}

Format your response as numbered summaries matching the headline numbers. Keep the total output under 900 words.`

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://silicon-pulse.vercel.app',
    },
    body: JSON.stringify({
      model: SUMMARIZER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 2400,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Summarizer error: ${response.status} ${err}`)
  }

  const data = await response.json() as {
    choices: { message: { content: string } }[]
  }
  return data.choices[0]?.message?.content ?? ''
}

async function buildBriefForFeedType(feedType: 'balanced' | 'left' | 'right'): Promise<{
  content: string
  headlines: { title: string; source: string; summary: string }[]
  sources: string[]
}> {
  const feeds = RSS_FEEDS.filter(f => f.type === feedType)
  console.log(`\n📰 Building ${feedType} brief from ${feeds.length} feeds...`)

  // Fetch all feeds in parallel
  const allItems = (await Promise.all(feeds.map(fetchRSSFeed))).flat()

  // Filter relevant items
  const relevant = allItems.filter(isRelevant)
  console.log(`  Found ${allItems.length} items, ${relevant.length} relevant`)

  if (relevant.length === 0) {
    throw new Error(`No relevant items found for ${feedType} feed`)
  }

  const sorted = selectDiverseHeadlines(relevant, 14)

  const headlines = sorted.map(item => item.title)
  const sources = [...new Set(sorted.map(item => item.source))]

  console.log(`  Summarizing ${headlines.length} headlines (topic-mixed)...`)
  const summary = await summarizeHeadlines(headlines)

  const headlineObjects = sorted.map((item, i) => {
    // Extract this item's summary paragraph
    const lines = summary.split(/\n+/)
    const match = lines.find(l => l.startsWith(`${i + 1}.`) || l.includes(`${i + 1}.`))
    const nextMatch = lines.find((l, j) => j > lines.indexOf(match ?? '') && (l.match(/^\d+\./) ?? false))
    const summaryStart = lines.indexOf(match ?? '')
    const summaryEnd = nextMatch ? lines.indexOf(nextMatch) : summaryStart + 3
    const itemSummary = lines.slice(summaryStart, summaryEnd).join(' ').replace(/^\d+\.\s*/, '').trim()

    return {
      title: item.title,
      source: item.source,
      summary: itemSummary || summary.slice(0, 200),
    }
  })

  return {
    content: summary,
    headlines: headlineObjects,
    sources,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const feedTypes: Array<'balanced' | 'left' | 'right'> = ['balanced', 'left', 'right']
  const briefIds: Record<string, string> = {}
  let healthyFeeds = 0

  for (const feedType of feedTypes) {
    try {
      const brief = await buildBriefForFeedType(feedType)
      healthyFeeds++

      const { data, error } = await supabase
        .from('news_briefs')
        .insert({
          feed_type: feedType,
          content: brief.content,
          headlines: brief.headlines,
          sources: brief.sources,
        })
        .select('id')
        .single()

      if (error) throw error

      briefIds[feedType] = data.id
      console.log(`  ✅ Stored ${feedType} brief: ${data.id}`)
    } catch (err) {
      console.error(`  ❌ Failed to build ${feedType} brief:`, err)
    }
  }

  if (healthyFeeds < 2) {
    console.warn('\n⚠️  WARNING: Fewer than 2 feeds succeeded. Consider using cached briefs.')
  }

  console.log('\n📋 Brief IDs:', briefIds)
  console.log('\nTo use in a run, pass these brief IDs to the orchestrator.')

  // Output for use by orchestrator
  console.log('\nBRIEF_IDS_JSON=' + JSON.stringify(briefIds))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
