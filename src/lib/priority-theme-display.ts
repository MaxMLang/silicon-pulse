import { PRIORITY_THEMES, type PriorityThemeCategory } from './types'

/** Map null, unknown labels, or legacy buckets into the canonical theme list for charts. */
export function normalizePriorityThemeLabel(
  mip: string | null | undefined
): PriorityThemeCategory {
  const t = mip?.trim()
  if (t && (PRIORITY_THEMES as readonly string[]).includes(t)) {
    return t as PriorityThemeCategory
  }
  return 'Declined to answer or unclear'
}
