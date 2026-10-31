import type { CategoryKey, PartMap } from './types'

const cache = new Map<CategoryKey, unknown[]>()

export async function loadParts<K extends CategoryKey>(category: K): Promise<PartMap[K][]> {
  const cached = cache.get(category)
  if (cached) return cached as PartMap[K][]
  const response = await fetch(`/data/${category}.json`)
  if (!response.ok) throw new Error(`无法加载 ${category} 数据（HTTP ${response.status}）`)
  const parts = (await response.json()) as PartMap[K][]
  cache.set(category, parts as unknown[])
  return parts
}

export type { CategoryKey, PartMap }
