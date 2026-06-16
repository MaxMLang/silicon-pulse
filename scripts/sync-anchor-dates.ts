#!/usr/bin/env npx ts-node
/**
 * sync-anchor-dates.ts
 *
 * Keeps src/config/anchor-models.json honest: for every anchor segment, set `effectiveFrom` to the
 * model's real release date as reported by OpenRouter's `created` field. It does NOT invent or remove
 * segments - which models count as a lab's "flagship" stays a curatorial choice. It only corrects the
 * dates of the model ids you already listed.
 *
 *   npm run sync-anchor-dates -- --dry-run   # show changes, write nothing
 *   npm run sync-anchor-dates                # write anchor-models.json
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as dotenv from 'dotenv'
import type { AnchorModelsFile } from '../src/lib/anchor-models.types'
dotenv.config({ path: '.env.local' })

const KEY = process.env.OPENROUTER_API_KEY!
const DRY_RUN = process.argv.slice(2).includes('--dry-run')
const CONFIG_PATH = join(process.cwd(), 'src/config/anchor-models.json')

async function main() {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status} ${res.statusText}`)
  const { data } = (await res.json()) as { data: { id: string; created?: number }[] }
  const createdById = new Map(data.map(m => [m.id, m.created]))

  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as AnchorModelsFile
  let changed = 0
  let missing = 0

  for (const def of config.anchors) {
    for (const seg of def.segments) {
      const created = createdById.get(seg.modelId)
      if (!created) {
        console.warn(`⚠️  ${def.lab}: ${seg.modelId} not on OpenRouter - keeping existing date ${seg.effectiveFrom.slice(0, 10)}`)
        missing++
        continue
      }
      const iso = new Date(created * 1000).toISOString().slice(0, 10) + 'T00:00:00.000Z'
      if (iso !== seg.effectiveFrom) {
        console.log(`${def.lab}: ${seg.modelId}  ${seg.effectiveFrom.slice(0, 10)} → ${iso.slice(0, 10)}`)
        seg.effectiveFrom = iso
        changed++
      } else {
        console.log(`${def.lab}: ${seg.modelId}  ${iso.slice(0, 10)} (unchanged)`)
      }
    }
  }

  console.log(`\n${changed} date(s) to update, ${missing} model(s) not found.`)

  if (DRY_RUN) {
    console.log('Dry run - no file written.')
    return
  }
  if (changed > 0) {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
    console.log(`✅ Wrote ${CONFIG_PATH}`)
  } else {
    console.log('Nothing to write.')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
