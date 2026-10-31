import { useCallback, useEffect, useMemo, useState } from 'react'
import { Scene } from './Scene'
import { checkBuild } from './compat'
import { loadParts } from './parts'
import { categoryLabels, categoryOrder, emptyBuild } from './types'
import type { Build, CategoryKey, Cooler, Cpu, Gpu, Motherboard, PartMap, PcCase, Psu, Ram, Storage } from './types'

const STORAGE_KEY = 'pc-builder-3d:build:v1'

type PartsByCategory = { [K in CategoryKey]?: PartMap[K][] }

interface ManifestEntry {
  key: CategoryKey
  label: string
  en: string
  count: number
}

function loadBuild(): Build {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...emptyBuild }
    const parsed = JSON.parse(raw) as Partial<Build>
    return { ...emptyBuild, ...parsed }
  } catch {
    return { ...emptyBuild }
  }
}

const formKey = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Cheap predicate used to grey out parts that cannot fit the current build. */
function isCompatible(category: CategoryKey, part: unknown, build: Build): boolean {
  switch (category) {
    case 'CPU': {
      const cpu = part as Cpu
      return !build.Motherboard || formKey(cpu.socket) === formKey(build.Motherboard.socket)
    }
    case 'Motherboard': {
      const board = part as Motherboard
      if (build.CPU && formKey(board.socket) !== formKey(build.CPU.socket)) return false
      if (build.PCCase) {
        const supported = build.PCCase.supportedMoboFormFactors.map(formKey)
        if (supported.length > 0 && !supported.includes(formKey(board.formFactor))) return false
      }
      if (build.RAM && formKey(board.memoryType) !== formKey(build.RAM.type)) return false
      return true
    }
    case 'RAM': {
      const ram = part as Ram
      return !build.Motherboard || formKey(ram.type) === formKey(build.Motherboard.memoryType)
    }
    case 'GPU': {
      const gpu = part as Gpu
      if (build.PCCase?.maxGpuLength && gpu.length) return gpu.length <= build.PCCase.maxGpuLength
      return true
    }
    case 'PSU': {
      const psu = part as Psu
      if (build.PCCase && build.PCCase.supportedPsuFormFactors.length > 0) {
        const supported = build.PCCase.supportedPsuFormFactors.map(formKey)
        if (!supported.includes(formKey(psu.formFactor))) return false
      }
      return true
    }
    case 'PCCase': {
      const pcCase = part as PcCase
      if (build.Motherboard) {
        const supported = pcCase.supportedMoboFormFactors.map(formKey)
        if (supported.length > 0 && !supported.includes(formKey(build.Motherboard.formFactor))) return false
      }
      if (build.GPU?.length && pcCase.maxGpuLength && build.GPU.length > pcCase.maxGpuLength) return false
      return true
    }
    case 'CPUCooler': {
      const cooler = part as Cooler
      if (build.CPU && cooler.sockets.length > 0) {
        if (!cooler.sockets.some((socket) => formKey(socket) === formKey(build.CPU?.socket))) return false
      }
      if (build.PCCase?.maxCoolerHeight && cooler.height) return cooler.height <= build.PCCase.maxCoolerHeight
      return true
    }
    case 'Storage':
      return true
    default:
      return true
  }
}

function partSummary(category: CategoryKey, part: PartMap[CategoryKey]): string {
  switch (category) {
    case 'CPU': {
      const cpu = part as Cpu
      return [cpu.socket, cpu.cores ? `${cpu.cores}C/${cpu.threads ?? cpu.cores}T` : null, cpu.tdp ? `${cpu.tdp}W` : null]
        .filter(Boolean).join(' · ')
    }
    case 'Motherboard': {
      const board = part as Motherboard
      return [board.socket, board.formFactor, board.memoryType].filter(Boolean).join(' · ')
    }
    case 'GPU': {
      const gpu = part as Gpu
      return [gpu.memory ? `${gpu.memory} GB` : null, gpu.length ? `${gpu.length} mm` : null, gpu.tdp ? `${gpu.tdp}W` : null]
        .filter(Boolean).join(' · ')
    }
    case 'RAM': {
      const ram = part as Ram
      return [ram.type, ram.capacity ? `${ram.capacity} GB` : null, ram.speed ? `${ram.speed} MT/s` : null]
        .filter(Boolean).join(' · ')
    }
    case 'Storage': {
      const storage = part as Storage
      return [storage.capacity ? `${storage.capacity} GB` : null, storage.formFactor, storage.interface]
        .filter(Boolean).join(' · ')
    }
    case 'PSU': {
      const psu = part as Psu
      return [psu.wattage ? `${psu.wattage} W` : null, psu.efficiency, psu.formFactor].filter(Boolean).join(' · ')
    }
    case 'PCCase': {
      const pcCase = part as PcCase
      return [
        pcCase.formFactor,
        pcCase.maxGpuLength ? `显卡限长 ${pcCase.maxGpuLength} mm` : null,
        pcCase.maxCoolerHeight ? `限高 ${pcCase.maxCoolerHeight} mm` : null,
      ].filter(Boolean).join(' · ')
    }
    case 'CPUCooler': {
      const cooler = part as Cooler
      return [
        cooler.height ? `${cooler.height} mm` : null,
        cooler.waterCooled ? '水冷' : '风冷',
        cooler.sockets.length ? `${cooler.sockets.length} 种扣具` : null,
      ].filter(Boolean).join(' · ')
    }
    default:
      return ''
  }
}

export default function App() {
  const [build, setBuild] = useState<Build>(loadBuild)
  const [manifest, setManifest] = useState<ManifestEntry[]>([])
  const [picker, setPicker] = useState<CategoryKey | null>(null)
  const [parts, setParts] = useState<PartsByCategory>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [onlyCompatible, setOnlyCompatible] = useState(true)
  const [limit, setLimit] = useState(60)

  useEffect(() => {
    fetch('/data/manifest.json')
      .then((response) => response.json())
      .then((data: { categories: ManifestEntry[] }) => setManifest(data.categories))
      .catch(() => setManifest([]))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(build))
    } catch {
      /* storage disabled */
    }
  }, [build])

  const verdict = useMemo(() => checkBuild(build), [build])
  const totalParts = useMemo(() => manifest.reduce((sum, category) => sum + category.count, 0), [manifest])

  const openPicker = useCallback(async (category: CategoryKey) => {
    setPicker(category)
    setQuery('')
    setLimit(60)
    setError(null)
    if (parts[category]) return
    setLoading(true)
    try {
      const loaded = await loadParts(category)
      setParts((prev) => ({ ...prev, [category]: loaded }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [parts])

  const choose = useCallback((category: CategoryKey, part: PartMap[CategoryKey] | null) => {
    setBuild((prev) => ({ ...prev, [category]: part } as Build))
    setPicker(null)
  }, [])

  const autoBuild = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cpus, boards, rams, gpus, storages, psus, cases, coolers] = await Promise.all([
        loadParts('CPU'),
        loadParts('Motherboard'),
        loadParts('RAM'),
        loadParts('GPU'),
        loadParts('Storage'),
        loadParts('PSU'),
        loadParts('PCCase'),
        loadParts('CPUCooler'),
      ])
      setParts({ CPU: cpus, Motherboard: boards, RAM: rams, GPU: gpus, Storage: storages, PSU: psus, PCCase: cases, CPUCooler: coolers })

      const cpu = cpus.find((item) => item.socket === 'AM5' && item.tdp) ?? cpus[0]
      const board = boards.find((item) =>
        formKey(item.socket) === formKey(cpu.socket) && item.formFactor && item.memoryType) ?? boards[0]
      const ram = rams.find((item) => formKey(item.type) === formKey(board.memoryType)) ?? rams[0]
      const pcCase = cases.find((item) =>
        item.maxGpuLength &&
        item.supportedMoboFormFactors.some((form) => formKey(form) === formKey(board.formFactor))) ?? cases[0]
      const fitsCase = gpus
        .filter((item) => item.length && item.tdp && (!pcCase.maxGpuLength || item.length <= pcCase.maxGpuLength))
        .sort((a, b) => (b.tdp ?? 0) - (a.tdp ?? 0))
      const gpu = fitsCase[0] ?? gpus[0]
      const need = (cpu.tdp ?? 0) + (gpu.tdp ?? 0) + 70
      const psu = psus
        .filter((item) => item.wattage >= need * 1.25)
        .sort((a, b) => a.wattage - b.wattage)[0] ?? psus[0]
      const cooler = coolers.find((item) =>
        item.height &&
        item.sockets.some((socket) => formKey(socket) === formKey(cpu.socket)) &&
        (!pcCase.maxCoolerHeight || item.height <= pcCase.maxCoolerHeight)) ?? coolers[0]
      const storage = storages.find((item) => (item.formFactor ?? '').toUpperCase().includes('M.2')) ?? storages[0]

      setBuild({ CPU: cpu, Motherboard: board, RAM: ram, PCCase: pcCase, GPU: gpu, PSU: psu, CPUCooler: cooler, Storage: storage })
    } catch (err) {
      setError(err instanceof Error ? err.message : '示例配置生成失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('demo')) void autoBuild()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const candidates = useMemo(() => {
    if (!picker) return []
    const list = (parts[picker] ?? []) as PartMap[CategoryKey][]
    const text = query.trim().toLowerCase()
    return list.filter((part) => {
      if (onlyCompatible && !isCompatible(picker, part, build)) return false
      if (!text) return true
      return `${part.name} ${part.brand ?? ''}`.toLowerCase().includes(text)
    })
  }, [picker, parts, query, onlyCompatible, build])

  const statusCopy = verdict.status === 'fail'
    ? '存在不兼容项'
    : verdict.status === 'warn'
      ? '可以装，但有未知项'
      : verdict.missing.length === 8
        ? '开始选择配件'
        : '当前搭配兼容'

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>◈</span>
          <div>
            <h1>3D 装机模拟器</h1>
            <p className="sub">
              数据来自 BuildCores OpenDB · {totalParts.toLocaleString()} 个型号 · CC BY-NC-SA 4.0
            </p>
          </div>
        </div>
        <div className="topbar-right">
          <div className={`status ${verdict.missing.length === 8 ? 'idle' : verdict.status}`}>{statusCopy}</div>
          <div className="power-chip">
            <span>峰值 {verdict.power.peak} W</span>
            <span className="dim">建议 {verdict.power.recommended} W</span>
          </div>
          <button className="ghost" onClick={() => void autoBuild()}>示例配置</button>
          <button className="ghost" onClick={() => setBuild({ ...emptyBuild })}>清空</button>
        </div>
      </header>

      <aside className="slots">
        <h2>配件清单</h2>
        {categoryOrder.map((category) => {
          const part = build[category]
          return (
            <div key={category} className={`slot ${part ? 'filled' : ''}`}>
              <button className="slot-main" onClick={() => openPicker(category)}>
                <span className="slot-label">{categoryLabels[category]}</span>
                <span className="slot-name">{part ? part.name : '未选择'}</span>
                <span className="slot-meta">{part ? partSummary(category, part) : '点击选择'}</span>
              </button>
              {part ? (
                <button className="slot-clear" title="移除" onClick={() => choose(category, null)}>×</button>
              ) : null}
            </div>
          )
        })}
        <p className="hint">拖动鼠标旋转视角，滚轮缩放；没选的配件会显示成半透明空位。</p>
      </aside>

      <main className="viewport">
        <Scene build={build} verdict={verdict} />
        <div className="legend">
          <span><i style={{ background: '#8b9dff' }} />CPU</span>
          <span><i style={{ background: '#334155' }} />显卡</span>
          <span><i style={{ background: '#6d28d9' }} />内存</span>
          <span><i style={{ background: '#94a3b8' }} />散热</span>
          <span><i style={{ background: '#475569' }} />电源</span>
          <span><i style={{ background: '#ef4444' }} />不兼容</span>
        </div>
      </main>

      <aside className="checks">
        <h2>兼容性检查</h2>
        <ul>
          {verdict.checks.map((check) => (
            <li key={check.id} className={check.status}>
              <span className="dot" />
              <div>
                <span className="check-label">{check.label}</span>
                <span className="check-detail">{check.detail}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="power">
          <h3>功耗估算</h3>
          <div className="bar">
            <div
              className="bar-fill"
              style={{
                width: `${Math.min(100, (verdict.power.peak / Math.max(1, build.PSU?.wattage ?? verdict.power.recommended)) * 100)}%`,
              }}
            />
          </div>
          <p>
            峰值约 <b>{verdict.power.peak} W</b>，建议电源 <b>{verdict.power.recommended} W</b>
            {build.PSU ? `，已选 ${build.PSU.wattage} W` : ''}
          </p>
        </div>
      </aside>

      {picker ? (
        <div className="modal" role="dialog" aria-label={`选择${categoryLabels[picker]}`}>
          <div className="modal-card">
            <header>
              <h2>选择{categoryLabels[picker]}</h2>
              <button className="ghost" onClick={() => setPicker(null)}>关闭</button>
            </header>
            <div className="filters">
              <input
                autoFocus
                placeholder="搜索型号或品牌…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setLimit(60)
                }}
              />
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={onlyCompatible}
                  onChange={(event) => setOnlyCompatible(event.target.checked)}
                />
                只看兼容
              </label>
              <span className="count">{candidates.length.toLocaleString()} 个结果</span>
            </div>
            {error ? <p className="error">{error}</p> : null}
            {loading ? <p className="loading">正在加载 {categoryLabels[picker]} 数据…</p> : null}
            <ul className="list">
              {candidates.slice(0, limit).map((part) => {
                const compatible = isCompatible(picker, part, build)
                return (
                  <li key={part.id} className={compatible ? '' : 'incompatible'}>
                    <button onClick={() => choose(picker, part)}>
                      <span className="row-name">{part.name}</span>
                      <span className="row-meta">
                        {partSummary(picker, part)}
                        {part.year ? ` · ${part.year}` : ''}
                        {compatible ? '' : ' · 与当前配件冲突'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {candidates.length > limit ? (
              <button className="more" onClick={() => setLimit((value) => value + 60)}>
                再加载 60 个
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
