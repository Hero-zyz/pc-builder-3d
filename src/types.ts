/** Part shapes produced by scripts/sync-parts.mjs from BuildCores OpenDB (CC BY-NC-SA 4.0). */

export interface PartBase {
  id: string
  name: string
  brand: string | null
  year: number | null
}

export interface Connectors {
  pcie6: number
  pcie8: number
  hpwr: number
  eps8: number
  atx24: number
  sata: number
}

export interface Cpu extends PartBase {
  socket: string
  series: string | null
  cores: number | null
  threads: number | null
  base: number | null
  boost: number | null
  tdp: number | null
  igpu: string | null
  memoryTypes: string[]
  maxMemory: number | null
}

export interface Motherboard extends PartBase {
  socket: string
  formFactor: string | null
  chipset: string | null
  memoryType: string | null
  memorySlots: number | null
  maxMemory: number | null
  m2Slots: number | null
  pcieSlots: number | null
  wifi: boolean
}

export interface Ram extends PartBase {
  type: string
  speed: number | null
  capacity: number | null
  modules: { qty: number | null; each: number | null } | null
  formFactor: string | null
  casLatency: number | null
  ecc: string | null
}

export interface Gpu extends PartBase {
  chipset: string | null
  memory: number | null
  memoryType: string | null
  tdp: number | null
  length: number | null
  slotWidth: number | null
  connectors: Connectors | null
}

export interface Psu extends PartBase {
  wattage: number
  efficiency: string | null
  modular: string | null
  formFactor: string | null
  length: number | null
  fanless: boolean
  connectors: Connectors | null
}

export interface CaseDimensions {
  depth?: number
  width?: number
  height?: number
  [key: string]: number | string | undefined
}

export interface PcCase extends PartBase {
  formFactor: string | null
  supportedMoboFormFactors: string[]
  supportedPsuFormFactors: string[]
  maxGpuLength: number | null
  maxCoolerHeight: number | null
  bays35: number | null
  bays25: number | null
  expansionSlots: number | null
  dimensions: CaseDimensions | string | null
  volume: number | null
}

export interface Cooler extends PartBase {
  height: number | null
  sockets: string[]
  waterCooled: boolean
  radiatorSize: number | null
  fanless: boolean
}

export interface Storage extends PartBase {
  capacity: number | null
  type: string | null
  formFactor: string | null
  interface: string | null
  nvme: boolean
}

export interface PartMap {
  CPU: Cpu
  Motherboard: Motherboard
  GPU: Gpu
  RAM: Ram
  Storage: Storage
  PSU: Psu
  PCCase: PcCase
  CPUCooler: Cooler
}

export type CategoryKey = keyof PartMap

export type Build = { [K in CategoryKey]: PartMap[K] | null }

export const emptyBuild: Build = {
  CPU: null,
  Motherboard: null,
  GPU: null,
  RAM: null,
  Storage: null,
  PSU: null,
  PCCase: null,
  CPUCooler: null,
}

export const categoryOrder: CategoryKey[] = [
  'CPU',
  'Motherboard',
  'GPU',
  'RAM',
  'Storage',
  'PSU',
  'PCCase',
  'CPUCooler',
]

export const categoryLabels: Record<CategoryKey, string> = {
  CPU: '处理器',
  Motherboard: '主板',
  GPU: '显卡',
  RAM: '内存',
  Storage: '硬盘',
  PSU: '电源',
  PCCase: '机箱',
  CPUCooler: '散热器',
}
