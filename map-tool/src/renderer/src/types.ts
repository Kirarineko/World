export interface Pt {
  x: number
  y: number
}

export type ShapeKind =
  | 'line' // 直线
  | 'polyline' // 折线
  | 'freehand' // 自由画笔（线）
  | 'bezier' // 贝塞尔曲线
  | 'area-freehand' // 自由画笔选区
  | 'area-polygon' // 多边形选区
  | 'lasso' // 套索选区

export interface Shape {
  id: string
  kind: ShapeKind
  points: Pt[]
}

export interface ScaleInfo {
  pxPerUnit: number // 1 单位实际距离对应的像素数
  unit: string // 单位名，如 公里 / 里 / 米
}

export interface MapConfig {
  scale: ScaleInfo | null
  shapes: Shape[]
}

export interface MapEntry {
  path: string
  name: string
  rel: string
}

export type ToolId =
  | 'pan'
  | 'calibrate'
  | 'line'
  | 'polyline'
  | 'freehand'
  | 'bezier'
  | 'area-freehand'
  | 'area-polygon'
  | 'lasso'

export const isAreaKind = (k: ShapeKind): boolean =>
  k === 'area-freehand' || k === 'area-polygon' || k === 'lasso'

export const KIND_LABEL: Record<ShapeKind, string> = {
  line: '直线',
  polyline: '折线',
  freehand: '自由线',
  bezier: '贝塞尔',
  'area-freehand': '自由选区',
  'area-polygon': '多边形',
  lasso: '套索',
}
