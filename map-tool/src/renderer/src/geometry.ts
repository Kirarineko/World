import type { Pt, Shape } from './types'
import { isAreaKind } from './types'

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

export function polylineLength(pts: Pt[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i])
  return s
}

function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

/** 三次贝塞尔采样为折线，用于绘制与测长 */
export function bezierSamples(pts: Pt[], n = 120): Pt[] {
  if (pts.length < 4) return pts
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) out.push(cubicAt(pts[0], pts[1], pts[2], pts[3], i / n))
  return out
}

/** 形状对应的渲染/测量点列 */
export function shapePath(s: Shape): Pt[] {
  return s.kind === 'bezier' ? bezierSamples(s.points) : s.points
}

export function shapeLength(s: Shape): number {
  return polylineLength(shapePath(s))
}

export function polygonArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a / 2)
}

export function centroid(pts: Pt[]): Pt {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

export function midPoint(pts: Pt[]): Pt {
  return pts[Math.floor(pts.length / 2)] ?? pts[0]
}

/** 去掉相邻距离过近的点（双击收尾会注入重复点） */
export function dedupe(pts: Pt[], minDist: number): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    if (out.length === 0 || dist(out[out.length - 1], p) > minDist) out.push(p)
  }
  return out
}

export function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—'
  if (Math.abs(n) >= 10000) return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
  if (Math.abs(n) >= 100) return n.toFixed(1).replace(/\.0$/, '')
  return n.toFixed(digits).replace(/\.?0+$/, '')
}

/** 形状测量值的显示文本 */
export function measureText(s: Shape, scale: { pxPerUnit: number; unit: string } | null): string {
  if (isAreaKind(s.kind)) {
    const a = polygonArea(s.points)
    if (scale) return `${fmt(a / scale.pxPerUnit ** 2)} 平方${scale.unit}`
    return `${fmt(a)} px²`
  }
  const l = shapeLength(s)
  if (scale) return `${fmt(l / scale.pxPerUnit)} ${scale.unit}`
  return `${fmt(l)} px`
}
