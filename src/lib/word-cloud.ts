/** Tokenize free text for a lightweight tag cloud (no extra deps). */
const STOP = new Set(
  `a an the and or but if in on at to for of as is was are were been be by it its this that these those with from
  their our your my we you they he she his her them than then so not no yes all any some more most other such
  about into through over after before between under again further once here there when where why how
  national attention economy government immigration healthcare education security climate poverty crime violence
  race relations inequality environment what which who will would could should can may must might also just like
  very much many few lot get got make made take give go going come see know think say said want need way even
  well back only both each few same own still being having doing being`.split(/\s+/)
)

export function buildWordFrequencies(texts: string[], maxWords = 48): { word: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const t of texts) {
    const lower = t.toLowerCase()
    const parts = lower.split(/[^a-z0-9]+/g).filter(w => w.length > 2)
    for (const w of parts) {
      if (STOP.has(w)) continue
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords)
    .map(([word, count]) => ({ word, count }))
}
