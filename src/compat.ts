/** Compatibility rules for the selected parts. Pure functions, no React. */

import type { Build, CategoryKey } from './types'

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'na'

export interface Check {
  id: string
  label: string
  status: CheckStatus
  detail: string
}

export interface PowerEstimate {
  peak: number
  recommended: number
  headroom: number | null
}

export interface Verdict {
  checks: Check[]
  power: PowerEstimate
  status: 'ok' | 'warn' | 'fail'
  missing: CategoryKey[]
}

const socketKey = (value: string): string => value.toUpperCase().replace(/[\s_-]/g, '')

/** "Micro ATX" / "mATX" / "ATX" / "Mini ITX" / "E-ATX" -> one canonical token. */
export function formFactorKey(value: string | null | undefined): string {
  if (!value) return ''
  const compact = value.toUpperCase().replace(/[\s_-]/g, '')
  if (compact.includes('EATX')) return 'EATX'
  if (compact.includes('MINIITX') || compact === 'ITX' || compact.includes('MINIITX')) return 'ITX'
  if (compact.includes('MICROATX') || compact === 'MATX' || compact === 'UATX') return 'MATX'
  if (compact.includes('THINITX')) return 'THINITX'
  if (compact === 'ATX' || compact.includes('STANDARDATX')) return 'ATX'
  return compact
}

const ramKey = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const psuFormKey = (value: string | null | undefined): string => {
  const compact = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.startsWith('SFX')) return 'SFX'
  if (compact.startsWith('TFX')) return 'TFX'
  if (compact.startsWith('FLEX')) return 'FLEX'
  if (compact.startsWith('ATX')) return 'ATX'
  return compact
}

const hasValue = (value: unknown): boolean => value !== null && value !== undefined && value !== ''

export function estimatePower(build: Build): PowerEstimate {
  const cpuTdp = build.CPU?.tdp ?? 0
  const gpuTdp = build.GPU?.tdp ?? 0
  const boardAndDrives = 70
  const peak = Math.round(cpuTdp + gpuTdp + boardAndDrives)
  const recommended = Math.ceil((peak * 1.3) / 50) * 50
  const psu = build.PSU
  const headroom = psu ? psu.wattage - peak : null
  return { peak, recommended, headroom }
}

/** 8-pin-equivalent count a card wants, and what a PSU can supply. */
function gpuPowerNeed(build: Build): { need: number; hpwr: boolean } {
  const c = build.GPU?.connectors
  if (!c) return { need: 0, hpwr: false }
  return { need: c.pcie8 + c.pcie6 * 0.75 + c.hpwr * 2, hpwr: c.hpwr > 0 }
}

function psuPowerSupply(build: Build): { supply: number; hpwr: number } {
  const c = build.PSU?.connectors
  if (!c) return { supply: 0, hpwr: 0 }
  return { supply: c.pcie8 + c.hpwr * 2, hpwr: c.hpwr }
}

export function checkBuild(build: Build): Verdict {
  const checks: Check[] = []
  const add = (id: string, label: string, status: CheckStatus, detail: string) => {
    checks.push({ id, label, status, detail })
  }

  const { CPU, Motherboard, GPU, RAM, Storage, PSU, PCCase, CPUCooler } = build

  // CPU <-> Motherboard
  if (CPU && Motherboard) {
    const same = socketKey(CPU.socket) === socketKey(Motherboard.socket)
    add('socket', 'CPU 插槽 / 主板插槽', same ? 'pass' : 'fail',
      same ? `${CPU.socket} 对 ${Motherboard.socket}` : `${CPU.socket} 装不进 ${Motherboard.socket} 主板`)
  } else {
    add('socket', 'CPU 插槽 / 主板插槽', 'na', '选好 CPU 和主板后检查')
  }

  // Motherboard <-> Case form factor
  if (Motherboard && PCCase) {
    const supported = PCCase.supportedMoboFormFactors.map(formFactorKey).filter(Boolean)
    const board = formFactorKey(Motherboard.formFactor)
    if (supported.length === 0) {
      add('formfactor', '主板板型 / 机箱', 'warn', `机箱未标注支持的板型，主板为 ${Motherboard.formFactor ?? '未知'}`)
    } else if (!board) {
      add('formfactor', '主板板型 / 机箱', 'warn', '主板未标注板型，无法判断')
    } else {
      const ok = supported.includes(board)
      add('formfactor', '主板板型 / 机箱', ok ? 'pass' : 'fail',
        ok ? `${Motherboard.formFactor} 可装入（支持 ${PCCase.supportedMoboFormFactors.join(' / ')}）`
          : `机箱只支持 ${PCCase.supportedMoboFormFactors.join(' / ')}，装不下 ${Motherboard.formFactor}`)
    }
  } else {
    add('formfactor', '主板板型 / 机箱', 'na', '选好主板和机箱后检查')
  }

  // RAM type
  if (RAM && Motherboard) {
    const ram = ramKey(RAM.type)
    const board = ramKey(Motherboard.memoryType)
    if (!board) {
      add('ramtype', '内存类型', 'warn', '主板未标注内存类型，无法判断')
    } else {
      const ok = ram === board
      add('ramtype', '内存类型', ok ? 'pass' : 'fail',
        ok ? `${RAM.type} 匹配主板 ${Motherboard.memoryType}`
          : `主板只支持 ${Motherboard.memoryType}，${RAM.type} 插不上`)
    }
  } else {
    add('ramtype', '内存类型', 'na', '选好内存和主板后检查')
  }

  // RAM modules vs slots
  if (RAM && Motherboard) {
    const qty = RAM.modules?.qty ?? null
    const slots = Motherboard.memorySlots
    if (qty === null || slots === null) {
      add('ramslots', '内存条数 / 插槽数', 'warn', '缺少条数或插槽数，无法判断')
    } else {
      const ok = qty <= slots
      add('ramslots', '内存条数 / 插槽数', ok ? 'pass' : 'fail',
        `${qty} 条内存 / 主板 ${slots} 个插槽${ok ? '' : '，插不下'}`)
    }
    if (RAM.capacity && Motherboard.maxMemory) {
      const ok = RAM.capacity <= Motherboard.maxMemory
      add('rammax', '内存容量 / 主板上限', ok ? 'pass' : 'warn',
        `${RAM.capacity} GB / 主板上限 ${Motherboard.maxMemory} GB`)
    }
  } else {
    add('ramslots', '内存条数 / 插槽数', 'na', '选好内存和主板后检查')
  }

  // GPU length vs case
  if (GPU && PCCase) {
    const length = GPU.length
    const limit = PCCase.maxGpuLength
    if (!hasValue(length) || !hasValue(limit)) {
      add('gpuLength', '显卡长度 / 机箱限长', 'warn', '缺少显卡长度或机箱限长')
    } else {
      const ok = (length as number) <= (limit as number)
      add('gpuLength', '显卡长度 / 机箱限长', ok ? 'pass' : 'fail',
        `${length} mm / 机箱限长 ${limit} mm${ok ? '' : `，超长 ${(length as number) - (limit as number)} mm`}`)
    }
  } else {
    add('gpuLength', '显卡长度 / 机箱限长', 'na', '选好显卡和机箱后检查')
  }

  // Cooler height and socket support
  if (CPUCooler && PCCase) {
    const height = CPUCooler.height
    const limit = PCCase.maxCoolerHeight
    if (!hasValue(height) || !hasValue(limit)) {
      add('coolerHeight', '散热器高度 / 机箱限高', 'warn', '缺少散热器高度或机箱限高')
    } else {
      const ok = (height as number) <= (limit as number)
      add('coolerHeight', '散热器高度 / 机箱限高', ok ? 'pass' : 'fail',
        `${height} mm / 机箱限高 ${limit} mm${ok ? '' : '，装不上'}`)
    }
  } else {
    add('coolerHeight', '散热器高度 / 机箱限高', 'na', '选好散热器和机箱后检查')
  }

  if (CPU && CPUCooler) {
    if (CPUCooler.sockets.length === 0) {
      add('coolerSocket', '散热器扣具 / CPU 插槽', 'warn', '散热器未标注支持的插槽')
    } else {
      const ok = CPUCooler.sockets.some((s) => socketKey(s) === socketKey(CPU.socket))
      add('coolerSocket', '散热器扣具 / CPU 插槽', ok ? 'pass' : 'fail',
        ok ? `支持 ${CPU.socket}` : `扣具不支持 ${CPU.socket}（支持 ${CPUCooler.sockets.slice(0, 4).join(' / ')}…）`)
    }
  } else {
    add('coolerSocket', '散热器扣具 / CPU 插槽', 'na', '选好 CPU 和散热器后检查')
  }

  // PSU form factor vs case
  if (PSU && PCCase) {
    const supported = PCCase.supportedPsuFormFactors.map(psuFormKey).filter(Boolean)
    const psuForm = psuFormKey(PSU.formFactor)
    if (supported.length === 0) {
      add('psuSize', '电源规格 / 机箱', 'warn', '机箱未标注支持的电源规格')
    } else if (!psuForm) {
      add('psuSize', '电源规格 / 机箱', 'warn', '电源未标注规格')
    } else {
      const ok = supported.includes(psuForm)
      add('psuSize', '电源规格 / 机箱', ok ? 'pass' : 'fail',
        ok ? `${PSU.formFactor} 可装入` : `机箱只支持 ${PCCase.supportedPsuFormFactors.join(' / ')}，${PSU.formFactor} 装不进`)
    }
  } else {
    add('psuSize', '电源规格 / 机箱', 'na', '选好电源和机箱后检查')
  }

  // PSU wattage
  const power = estimatePower(build)
  if (PSU) {
    const ok = PSU.wattage >= power.recommended
    const tight = PSU.wattage >= power.peak
    add('power', '电源功率', ok ? 'pass' : tight ? 'warn' : 'fail',
      `${PSU.wattage} W / 峰值 ${power.peak} W / 建议 ${power.recommended} W`)
  } else {
    add('power', '电源功率', 'na', `峰值约 ${power.peak} W，建议 ${power.recommended} W`)
  }

  // GPU power connectors
  if (GPU && PSU) {
    const { need, hpwr } = gpuPowerNeed(build)
    const { supply, hpwr: psuHpwr } = psuPowerSupply(build)
    if (need === 0 && supply === 0) {
      add('gpuPower', '显卡供电接口', 'warn', '显卡或电源未标注供电接口')
    } else {
      const ok = supply + 0.01 >= need
      const directHpwr = !hpwr || psuHpwr > 0
      const status: CheckStatus = !ok ? 'fail' : directHpwr ? 'pass' : 'warn'
      const parts = [
        `显卡需要约 ${Number(need.toFixed(2))} 个 8pin 等效`,
        `电源提供 ${supply}`,
      ]
      if (!directHpwr) parts.push('显卡要 12VHPWR，电源没有原生接口，需转接线')
      add('gpuPower', '显卡供电接口', status, parts.join('，'))
    }
  } else {
    add('gpuPower', '显卡供电接口', 'na', '选好显卡和电源后检查')
  }

  // M.2 storage vs motherboard slots
  if (Storage && Motherboard) {
    const isM2 = (Storage.formFactor ?? '').toUpperCase().includes('M.2')
    if (!isM2) {
      add('m2', '硬盘接口', 'pass', `${Storage.formFactor ?? '非 M.2'}，不受 M.2 插槽限制`)
    } else if (Motherboard.m2Slots === null) {
      add('m2', '硬盘接口', 'warn', '主板未标注 M.2 插槽数')
    } else {
      const ok = Motherboard.m2Slots >= 1
      add('m2', '硬盘接口', ok ? 'pass' : 'fail',
        `M.2 硬盘 / 主板 ${Motherboard.m2Slots} 个 M.2 插槽${ok ? '' : '，没有空位'}`)
    }
  } else {
    add('m2', '硬盘接口', 'na', '选好硬盘和主板后检查')
  }

  // CPU memory controller vs board memory type (informational)
  if (CPU && Motherboard && Motherboard.memoryType && CPU.memoryTypes.length > 0) {
    const supported = CPU.memoryTypes.map(ramKey)
    const board = ramKey(Motherboard.memoryType)
    if (!supported.includes(board)) {
      add('cpuMem', 'CPU 内存控制器', 'warn', `CPU 官方支持 ${CPU.memoryTypes.join(' / ')}，主板为 ${Motherboard.memoryType}`)
    }
  }

  const missing = (Object.keys(build) as CategoryKey[]).filter((key) => build[key] === null)
  const status: Verdict['status'] = checks.some((c) => c.status === 'fail')
    ? 'fail'
    : checks.some((c) => c.status === 'warn')
      ? 'warn'
      : 'ok'

  return { checks, power, status, missing }
}
