// Build a compact, offline parts index from a BuildCores OpenDB checkout.
//
// Data source: https://github.com/buildcores/buildcores-open-db
// License: CC BY-NC-SA 4.0 (non-commercial, share-alike) -- see public/data/manifest.json
//
// Usage:
//   node scripts/sync-parts.mjs [path-to-open-db-dir]
// Default source: ../_data/buildcores-open-db-main/open-db (workspace checkout)

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, '..', 'public', 'data')
const sourceDir = path.resolve(process.argv[2] ?? path.join(here, '..', '..', '_data', 'buildcores-open-db-main', 'open-db'))

if (!existsSync(sourceDir)) {
  console.error(`[data] OpenDB directory not found: ${sourceDir}`)
  process.exit(1)
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const brand = (meta) => meta?.manufacturer ?? null
const name = (meta) => meta?.name ?? 'Unknown part'
const year = (meta) => num(meta?.releaseYear)

/** GPU records use pcie_6_pin / pcie_8_pin / pcie_12VHPWR; PSU records use pcie_6_plus_2_pin / pcie_12vhpwr. */
const connectors = (c) => {
  if (!c || typeof c !== 'object') return null
  return {
    pcie6: num(c.pcie_6_pin) ?? 0,
    pcie8: num(c.pcie_8_pin) ?? num(c.pcie_6_plus_2_pin) ?? 0,
    hpwr: num(c.pcie_12VHPWR) ?? num(c.pcie_12vhpwr) ?? 0,
    eps8: num(c.eps_8_pin) ?? 0,
    atx24: num(c.atx_24_pin) ?? 0,
    sata: num(c.sata) ?? 0,
  }
}

/** One compact projection per category. Every mapper returns null to drop a record. */
const mappers = {
  CPU: (o) => {
    const meta = o.metadata ?? {}
    if (!o.socket) return null
    return {
      id: o.opendb_id,
      name: name(meta),
      brand: brand(meta),
      socket: o.socket,
      series: o.series ?? null,
      cores: num(o.cores?.total),
      threads: num(o.cores?.threads),
      base: num(o.clocks?.performance?.base),
      boost: num(o.clocks?.performance?.boost),
      tdp: num(o.specifications?.tdp),
      igpu: o.specifications?.integratedGraphics?.model && o.specifications.integratedGraphics.model !== 'None'
        ? o.specifications.integratedGraphics.model
        : null,
      memoryTypes: Array.isArray(o.specifications?.memory?.types) ? o.specifications.memory.types.filter(Boolean) : [],
      maxMemory: num(o.specifications?.memory?.maxSupport),
      year: year(meta),
    }
  },
  Motherboard: (o) => {
    const meta = o.metadata ?? {}
    if (!o.socket) return null
    const mem = o.memory ?? {}
    return {
      id: o.opendb_id,
      name: name(meta),
      brand: brand(meta),
      socket: o.socket,
      formFactor: o.form_factor ?? null,
      chipset: o.chipset ?? null,
      memoryType: mem.ram_type ?? mem.type ?? null,
      memorySlots: num(mem.slots),
      maxMemory: num(mem.max),
      m2Slots: Array.isArray(o.m2_slots) ? o.m2_slots.length : num(o.m2_slots),
      pcieSlots: Array.isArray(o.pcie_slots) ? o.pcie_slots.length : num(o.pcie_slots),
      wifi: Boolean(o.wireless_networking && String(o.wireless_networking).toLowerCase() !== 'none'),
      year: year(meta),
    }
  },
  RAM: (o) => {
    const meta = o.metadata ?? {}
    if (!o.ram_type) return null
    return {
      id: o.opendb_id,
      name: name(meta),
      brand: brand(meta),
      type: o.ram_type,
      speed: num(o.speed),
      capacity: num(o.capacity),
      modules: o.modules ? { qty: num(o.modules.quantity), each: num(o.modules.capacity_gb) } : null,
      formFactor: o.form_factor ?? null,
      casLatency: num(o.cas_latency),
      ecc: o.ecc ?? null,
      year: year(meta),
    }
  },
  GPU: (o) => {
    const meta = o.metadata ?? {}
    return {
      id: o.opendb_id,
      name: name(meta),
      brand: brand(meta),
      chipset: o.chipset ?? null,
      memory: num(o.memory),
      memoryType: o.memory_type ?? null,
      tdp: num(o.tdp),
      length: num(o.length),
      slotWidth: num(o.total_slot_width),
      connectors: connectors(o.power_connectors),
      year: year(meta),
    }
  },
  PCCase: (o) => {
    const meta = o.metadata ?? {}
    return {
      id: o.opendb_id,
      name: name(meta),
      brand: brand(meta),
      formFactor: o.form_factor ?? null,
      supportedMoboFormFactors: Array.isArray(o.supported_motherboard_form_factors) ? o.supported_motherboard_form_factors.filter(Boolean) : [],
      supportedPsuFormFactors: Array.isArray(o.supported_power_supply_form_factors) ? o.supported_power_supply_form_factors.filter(Boolean) : [],
      maxGpuLength: num(o.max_video_card_length),
      maxCoolerHeight: num(o.max_cpu_cooler_height),
      bays35: num(o.internal_3_5_bays),
      bays25: num(o.internal_2_5_bays),
      expansionSlots: num(o.expansion_slots),
      dimensions: o.dimensions_mm ?? o.dimensions ?? null,
      volume: num(o.volume),
      year: year(meta),
    }
  },
  PSU: (o) => {
    const meta = o.metadata ?? {}
    if (!num(o.wattage)) return null
    return {
      id: o.opendb_id,
      name: name(meta),
      brand: brand(meta),
      wattage: num(o.wattage),
      efficiency: o.efficiency_rating ?? null,
      modular: o.modular ?? null,
      formFactor: o.form_factor ?? null,
      length: num(o.length),
      fanless: Boolean(o.fanless),
      connectors: connectors(o.connectors),
      year: year(meta),
    }
  },
  CPUCooler: (o) => {
    const meta = o.metadata ?? {}
    return {
      id: o.opendb_id,
      name: name(meta),
      brand: brand(meta),
      height: num(o.height),
      sockets: Array.isArray(o.cpu_sockets) ? o.cpu_sockets.filter(Boolean) : [],
      waterCooled: Boolean(o.water_cooled),
      radiatorSize: num(o.radiator_size),
      fanless: Boolean(o.fanless),
      year: year(meta),
    }
  },
  Storage: (o) => {
    const meta = o.metadata ?? {}
    return {
      id: o.opendb_id,
      name: name(meta),
      brand: brand(meta),
      capacity: num(o.capacity),
      type: o.storage_type ?? null,
      formFactor: o.form_factor ?? null,
      interface: o.interface ?? null,
      nvme: Boolean(o.nvme),
      year: year(meta),
    }
  },
}

/** Display order and per-category copy for the UI. */
const categories = [
  { key: 'CPU', label: '处理器', en: 'CPU' },
  { key: 'Motherboard', label: '主板', en: 'Motherboard' },
  { key: 'GPU', label: '显卡', en: 'GPU' },
  { key: 'RAM', label: '内存', en: 'Memory' },
  { key: 'Storage', label: '硬盘', en: 'Storage' },
  { key: 'PSU', label: '电源', en: 'PSU' },
  { key: 'PCCase', label: '机箱', en: 'Case' },
  { key: 'CPUCooler', label: '散热器', en: 'Cooler' },
]

await mkdir(outDir, { recursive: true })

const manifest = {
  source: 'BuildCores OpenDB',
  sourceUrl: 'https://github.com/buildcores/buildcores-open-db',
  license: 'CC BY-NC-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  generatedAt: new Date().toISOString(),
  categories: [],
}

for (const category of categories) {
  const dir = path.join(sourceDir, category.key)
  if (!existsSync(dir)) {
    console.warn(`[data] skip ${category.key}: directory missing`)
    continue
  }
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
  const records = []
  for (const file of files) {
    let parsed
    try {
      parsed = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
    } catch {
      continue
    }
    const mapped = mappers[category.key](parsed)
    if (mapped) records.push(mapped)
  }
  records.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name))
  await writeFile(path.join(outDir, `${category.key}.json`), JSON.stringify(records))
  manifest.categories.push({ key: category.key, label: category.label, en: category.en, count: records.length })
  console.log(`[data] ${category.key.padEnd(12)} ${String(records.length).padStart(6)} records`)
}

await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`[data] wrote ${path.join(outDir, 'manifest.json')}`)
