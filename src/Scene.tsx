import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import type { Build, CategoryKey } from './types'
import type { Verdict } from './compat'

/** Millimetres -> scene units (1 unit = 10 mm). */
const u = (mm: number) => mm / 10

const COLORS = {
  caseShell: '#4a6b96',
  board: '#1f6f43',
  cpu: '#8b9dff',
  gpu: '#475569',
  gpuAccent: '#38bdf8',
  ram: '#7c3aed',
  cooler: '#94a3b8',
  psu: '#64748b',
  storage: '#0ea5e9',
  bad: '#ef4444',
  ghost: '#5b7fb5',
}

const FORM_FACTOR_SIZE: Record<string, { w: number; h: number }> = {
  ATX: { w: 244, h: 305 },
  MATX: { w: 244, h: 244 },
  ITX: { w: 170, h: 170 },
  EATX: { w: 305, h: 330 },
  THINITX: { w: 170, h: 170 },
}

function boardFormKey(value: string | null): string {
  const compact = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.includes('EATX')) return 'EATX'
  if (compact.includes('MINIITX') || compact === 'ITX') return 'ITX'
  if (compact.includes('MICROATX') || compact === 'MATX') return 'MATX'
  if (compact === 'ATX') return 'ATX'
  return 'MATX'
}

function caseSize(build: Build) {
  const dims = build.PCCase?.dimensions
  if (dims && typeof dims === 'object') {
    const width = Number(dims.width ?? 210)
    const height = Number(dims.height ?? 450)
    const depth = Number(dims.depth ?? 450)
    if (width > 0 && height > 0 && depth > 0) return { width, height, depth }
  }
  return { width: 210, height: 450, depth: 450 }
}

function PartBox({
  size,
  position,
  color,
  bad = false,
  ghost = false,
}: {
  size: [number, number, number]
  position: [number, number, number]
  color: string
  bad?: boolean
  ghost?: boolean
}) {
  const tint = bad ? COLORS.bad : ghost ? COLORS.ghost : color
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={tint}
          metalness={bad ? 0.1 : 0.45}
          roughness={bad ? 0.7 : 0.4}
          transparent={ghost}
          opacity={ghost ? 0.18 : 1}
          emissive={bad ? '#7f1d1d' : '#000000'}
          emissiveIntensity={bad ? 0.7 : 0}
          depthWrite={!ghost}
        />
      </mesh>
      {ghost || bad ? (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
          <lineBasicMaterial color={bad ? '#f87171' : '#7f9ec4'} transparent opacity={0.75} />
        </lineSegments>
      ) : null}
    </group>
  )
}

export function Scene({ build, verdict }: { build: Build; verdict: Verdict }) {
  const dims = useMemo(() => caseSize(build), [build])
  const badParts = useMemo(() => {
    const bad = new Set<CategoryKey>()
    for (const check of verdict.checks) {
      if (check.status !== 'fail') continue
      if (['socket', 'ramtype', 'ramslots', 'formfactor'].includes(check.id)) bad.add('Motherboard')
      if (check.id === 'gpuLength') bad.add('GPU')
      if (check.id === 'coolerHeight' || check.id === 'coolerSocket') bad.add('CPUCooler')
      if (['psuSize', 'power', 'gpuPower'].includes(check.id)) bad.add('PSU')
      if (check.id === 'm2') bad.add('Storage')
    }
    return bad
  }, [verdict])

  const cw = u(dims.width)
  const ch = u(dims.height)
  const cd = u(dims.depth)

  const boardKey = boardFormKey(build.Motherboard?.formFactor ?? null)
  const boardSpec = FORM_FACTOR_SIZE[boardKey] ?? FORM_FACTOR_SIZE.MATX
  const boardW = u(Math.min(boardSpec.w, dims.width - 30))
  const boardH = u(Math.min(boardSpec.h, dims.height - 140))
  const boardZ = -cd / 2 + 0.7
  const boardY = -ch / 2 + 3 + boardH / 2

  const gpuLen = u(Math.min(build.GPU?.length ?? 260, dims.depth - 45))
  const gpuThick = u((build.GPU?.slotWidth ?? 2) * 20)
  const gpuZ = boardZ + gpuLen / 2 + 0.8
  const gpuY = boardY + boardH * 0.14

  const coolerH = u(build.CPUCooler?.height ?? 155)
  const coolerW = u(130)

  const psuW = u(150)
  const psuH = u(86)
  const psuD = u(build.PSU?.length ?? 140)
  const psuY = -ch / 2 + 0.4 + psuH / 2
  const psuZ = -cd / 2 + 0.6 + psuD / 2

  /** Normalise the millimetre model into a ~3 unit stage so the default camera frames it. */
  const fit = 3.2 / Math.max(cw, ch, cd)

  const ramQty = Math.max(1, Math.min(4, build.RAM?.modules?.qty ?? 2))
  const ramH = u(32)
  const ramW = u(8)

  return (
    <Canvas
      key={`${Math.round(cw)}x${Math.round(ch)}x${Math.round(cd)}`}
      shadows
      dpr={[1, 2]}
    >
      <PerspectiveCamera makeDefault position={[2.4, 1.5, 4.4]} fov={45} near={0.05} far={100} />
      <color attach="background" args={['#0a1220']} />
      <fog attach="fog" args={['#0a1220', 8, 40]} />

      <hemisphereLight args={['#cfe4ff', '#0b1220', 1.1]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[70, 120, 80]} intensity={2.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-80, 50, -70]} intensity={1.1} color="#93c5fd" />
      <directionalLight position={[0, -30, 40]} intensity={0.5} color="#f472b6" />

      <group scale={fit}>

      {/* case shell — always visible so the scene reads even before a case is chosen */}
      <group>
        <mesh receiveShadow>
          <boxGeometry args={[cw, ch, cd]} />
          <meshPhysicalMaterial
            color={build.PCCase ? COLORS.caseShell : COLORS.ghost}
            transparent
            opacity={build.PCCase ? 0.045 : 0.03}
            roughness={0.2}
            metalness={0.7}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(cw, ch, cd)]} />
          <lineBasicMaterial color={build.PCCase ? '#6ea8ff' : '#3c5b85'} transparent opacity={0.9} />
        </lineSegments>
      </group>

      {/* motherboard */}
      <PartBox size={[boardW, boardH, 0.4]} position={[0, boardY, boardZ]} color={COLORS.board} bad={badParts.has('Motherboard')} ghost={!build.Motherboard} />

      {/* CPU + cooler */}
      <PartBox
        size={[u(45), u(45), 0.5]}
        position={[-boardW * 0.18, boardY + boardH * 0.24, boardZ + 0.5]}
        color={COLORS.cpu}
        ghost={!build.CPU}
      />
      <PartBox
        size={[coolerW, coolerH, coolerW]}
        position={[-boardW * 0.18, boardY + boardH * 0.24 + coolerH / 2 + 0.4, boardZ + coolerW / 2 + 0.7]}
        color={COLORS.cooler}
        bad={badParts.has('CPUCooler')}
        ghost={!build.CPUCooler}
      />

      {/* RAM sticks */}
      {Array.from({ length: ramQty }).map((_, index) => (
        <PartBox
          key={index}
          size={[ramW, ramH, u(133)]}
          position={[boardW * 0.16 + index * u(11), boardY + boardH * 0.24 + ramH / 2 - u(8), boardZ + u(70)]}
          color={COLORS.ram}
          ghost={!build.RAM}
        />
      ))}

      {/* GPU in the PCIe slot, sticking toward the front of the case */}
      <PartBox size={[gpuThick, u(120), gpuLen]} position={[u(20), gpuY, gpuZ]} color={COLORS.gpu} bad={badParts.has('GPU')} ghost={!build.GPU} />
      {build.GPU ? (
        <PartBox
          size={[gpuThick * 0.4, u(18), gpuLen * 0.9]}
          position={[u(20) + gpuThick * 0.55, gpuY + u(40), gpuZ]}
          color={COLORS.gpuAccent}
        />
      ) : null}

      {/* PSU */}
      <PartBox size={[psuW, psuH, psuD]} position={[0, psuY, psuZ]} color={COLORS.psu} bad={badParts.has('PSU')} ghost={!build.PSU} />

      {/* M.2 drive */}
      <PartBox
        size={[u(22), 0.25, u(80)]}
        position={[boardW * 0.05, boardY - boardH * 0.22, boardZ + 0.55]}
        color={COLORS.storage}
        bad={badParts.has('Storage')}
        ghost={!build.Storage}
      />

      <gridHelper args={[420, 42, '#1b2c4a', '#111c30']} position={[0, -ch / 2 - 0.8, 0]} />

      </group>

      <OrbitControls makeDefault enablePan minDistance={1.6} maxDistance={16} maxPolarAngle={Math.PI / 1.7} target={[0, 0, 0]} />
    </Canvas>
  )
}
