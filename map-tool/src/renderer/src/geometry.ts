import type { Pt, Shape } from './types'
import { isAreaKind } from './types'

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

export function polylineLength(pts: Pt[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i])
  return s
}

/** Catmull-Rom 样条采样：生成平滑穿过全部锚点的曲线（不限锚点数量） */
export function bezierSamples(pts: Pt[], seg = 24): Pt[] {
  if (pts.length <= 2) return pts
  const out: Pt[] = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let j = 1; j <= seg; j++) {
      const t = j / seg
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  return out
}

/** 形状对应的渲染/测量点列（贝塞尔为穿过锚点的平滑曲线采样） */
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
