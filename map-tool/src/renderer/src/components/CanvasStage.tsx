import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { MapEntry, Pt, ScaleInfo, Shape, ShapeKind, ToolId } from '../types'
import { isAreaKind } from '../types'
import {
  bezierSamples,
  centroid,
  dedupe,
  dist,
  measureText,
  midPoint,
  polygonArea,
  polylineLength,
  shapePath,
} from '../geometry'

interface View {
  z: number
  x: number
  y: number
}

interface Props {
  map: MapEntry
  tool: ToolId
  theme: string
  scale: ScaleInfo | null
  shapes: Shape[]
  onShapes: (s: Shape[]) => void
  onCalibrate: (px: number) => void
}

type Drag =
  | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { mode: 'draw'; points: Pt[] }
  | { mode: 'node'; id: string; index: number }

interface Palette {
  line: string
  areaFill: string
  draft: string
  handle: string
  labelBg: string
  labelText: string
  canvasBg: string
  imgBorder: string
}

const DARK: Palette = {
  line: '#6ea8fe',
  areaFill: 'rgba(110, 168, 254, 0.18)',
  draft: '#f2a93b',
  handle: '#ffffff',
  labelBg: 'rgba(16, 20, 28, 0.85)',
  labelText: '#e6eaf2',
  canvasBg: '#0a0c10',
  imgBorder: '#2a3442',
}

const LIGHT: Palette = {
  line: '#2f6fed',
  areaFill: 'rgba(47, 111, 237, 0.14)',
  draft: '#d98e1b',
  handle: '#1d2430',
  labelBg: 'rgba(255, 255, 255, 0.92)',
  labelText: '#1d2430',
  canvasBg: '#e7e9ee',
  imgBorder: '#c8cfdb',
}

const PAN_TOOLS: ToolId[] = ['pan']
const MEASURE_HINT: Record<ToolId, string> = {
  pan: '拖动平移画布，滚轮缩放；任意工具下按住空格即可拖动画布',
  calibrate: '先把画面放大到需要的倍率，再在图例比例尺上按住拖出一条参考线',
  line: '按住拖动绘制直线，松开完成',
  polyline: '单击添加节点，双击或回车结束，Esc 取消',
  freehand: '按住拖动自由绘制，松开完成',
  bezier: '依次单击：起点 → 控制点 1 → 控制点 2 → 终点；之后可拖动节点调整',
  'area-freehand': '单击开始，移动鼠标自由勾勒，再次单击自动闭合并计算面积',
  'area-polygon': '单击添加顶点，双击或回车闭合；之后可拖动顶点调整',
  lasso: '按住左键拖动圈选，松开自动闭合并计算面积',
}

export default function CanvasStage(props: Props) {
  const { map, tool, theme, scale, shapes, onShapes, onCalibrate } = props

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [view, setView] = useState<View>({ z: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  viewRef.current = view

  const [spaceDown, setSpaceDown] = useState(false)
  const spaceRef = useRef(false)
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [live, setLive] = useState<{ kind: ShapeKind | 'calibrate'; points: Pt[] } | null>(null)
  const [draft, setDraft] = useState<{ kind: ShapeKind; points: Pt[] } | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [activeId, setActiveId] = useState<string | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [zoomInput, setZoomInput] = useState('100')

  const palette = theme === 'light' ? LIGHT : DARK
  const paletteRef = useRef(palette)
  paletteRef.current = palette

  const shapesRef = useRef(shapes)
  shapesRef.current = shapes
  const toolRef = useRef(tool)
  toolRef.current = tool

  /* ---------- 图片加载 ---------- */
  useEffect(() => {
    setImg(null)
    setLive(null)
    setDraft(null)
    setActiveId(null)
    const im = new Image()
    im.src = window.api.imageUrl(map.path)
    im.onload = () => {
      setImg(im)
      fitTo(im)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.path])

  const fitTo = useCallback((im?: HTMLImageElement | null) => {
    const wrap = wrapRef.current
    const image = im === undefined ? img : im
    if (!wrap || !image) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (!w || !h) return
    const z = Math.min(w / image.naturalWidth, h / image.naturalHeight) * 0.96
    setView({
      z,
      x: (w - image.naturalWidth * z) / 2,
      y: (h - image.naturalHeight * z) / 2,
    })
  }, [img])

  const setZoom = useCallback((z: number, cx?: number, cy?: number) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const v = viewRef.current
    const px = cx ?? wrap.clientWidth / 2
    const py = cy ?? wrap.clientHeight / 2
    const nz = Math.min(64, Math.max(0.02, z))
    setView({ z: nz, x: px - (px - v.x) * (nz / v.z), y: py - (py - v.y) * (nz / v.z) })
  }, [])

  useEffect(() => {
    setZoomInput(String(Math.round(view.z * 100)))
  }, [view.z])

  /* ---------- 滚轮缩放（需非被动监听） ---------- */
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = c.getBoundingClientRect()
      const factor = Math.pow(1.0015, -e.deltaY)
      const v = viewRef.current
      setZoom(v.z * factor, e.clientX - rect.left, e.clientY - rect.top)
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [setZoom])

  /* ---------- 提交形状 ---------- */
  const commitShape = useCallback(
    (kind: ShapeKind, points: Pt[]) => {
      const s: Shape = { id: crypto.randomUUID(), kind, points }
      onShapes([...shapesRef.current, s])
      setActiveId(s.id)
    },
    [onShapes],
  )

  const finishDraft = useCallback(() => {
    const d = draftRef.current
    if (!d) return
    const v = viewRef.current
    const pts = dedupe(d.points, 2 / v.z)
    if (d.kind === 'polyline' && pts.length >= 2) commitShape('polyline', pts)
    if (d.kind === 'area-polygon' && pts.length >= 3) commitShape('area-polygon', pts)
    if (d.kind === 'area-freehand' && pts.length >= 3) commitShape('area-freehand', pts)
    setDraft(null)
  }, [commitShape])

  /* ---------- 键盘：空格平移 / 回车结束 / Esc 取消 ---------- */
  useEffect(() => {
    const isEditable = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditable(e.target)) {
        e.preventDefault()
        if (!spaceRef.current) {
          spaceRef.current = true
          setSpaceDown(true)
        }
      }
      if (e.key === 'Enter' && !isEditable(e.target)) finishDraft()
      if (e.key === 'Escape') {
        setDraft(null)
        setLive(null)
        dragRef.current = null
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false
        setSpaceDown(false)
        if (dragRef.current?.mode === 'pan') dragRef.current = null
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [finishDraft])

  /* ---------- 坐标换算 ---------- */
  const toMap = (e: { clientX: number; clientY: number }): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return {
      x: (e.clientX - rect.left - v.x) / v.z,
      y: (e.clientY - rect.top - v.y) / v.z,
    }
  }

  /* ---------- 指针交互 ---------- */
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !img) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toMap(e)
    const v = viewRef.current

    if (spaceRef.current || PAN_TOOLS.includes(toolRef.current)) {
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y }
      return
    }

    // 贝塞尔 / 多边形：优先命中已有节点进行拖动
    if (tool === 'bezier' || tool === 'area-polygon') {
      const want: ShapeKind = tool === 'bezier' ? 'bezier' : 'area-polygon'
      const thr = 9 / v.z
      const candidates = shapesRef.current.filter((s) => s.kind === want)
      for (let si = candidates.length - 1; si >= 0; si--) {
        const s = candidates[si]
        for (let i = 0; i < s.points.length; i++) {
          if (dist(p, s.points[i]) < thr) {
            dragRef.current = { mode: 'node', id: s.id, index: i }
            setActiveId(s.id)
            return
          }
        }
      }
    }

    switch (tool) {
      case 'calibrate':
      case 'line':
      case 'freehand':
      case 'lasso':
        dragRef.current = { mode: 'draw', points: [p] }
        setLive({ kind: tool, points: [p] })
        break
      case 'polyline':
      case 'area-polygon':
        setDraft((d) =>
          d && d.kind === tool ? { kind: d.kind, points: [...d.points, p] } : { kind: tool, points: [p] },
        )
        break
      case 'bezier': {
        const d = draftRef.current
        const pts = d && d.kind === 'bezier' ? [...d.points, p] : [p]
        if (pts.length === 4) {
          commitShape('bezier', pts)
          setDraft(null)
        } else {
          setDraft({ kind: 'bezier', points: pts })
        }
        break
      }
      case 'area-freehand': {
        const d = draftRef.current
        if (d && d.kind === 'area-freehand') {
          finishDraft()
        } else {
          setDraft({ kind: 'area-freehand', points: [p] })
        }
        break
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toMap(e)
    setCursor(p)
    const dr = dragRef.current
    const v = viewRef.current

    if (dr?.mode === 'pan') {
      setView({ z: v.z, x: dr.vx + (e.clientX - dr.sx), y: dr.vy + (e.clientY - dr.sy) })
      return
    }
    if (dr?.mode === 'node') {
      onShapes(
        shapesRef.current.map((s) =>
          s.id === dr.id
            ? { ...s, points: s.points.map((pt, i) => (i === dr.index ? p : pt)) }
            : s,
        ),
      )
      return
    }
    if (dr?.mode === 'draw') {
      const pts = dr.points
      if (tool === 'freehand' || tool === 'lasso') {
        if (dist(pts[pts.length - 1], p) > 3 / v.z) {
          pts.push(p)
          setLive({ kind: tool, points: [...pts] })
        }
      } else {
        setLive((l) => (l ? { kind: l.kind, points: [pts[0], p] } : l))
      }
      return
    }
    // 自由选区：单击开始后，移动即采样
    const d = draftRef.current
    if (d && d.kind === 'area-freehand' && tool === 'area-freehand') {
      if (dist(d.points[d.points.length - 1], p) > 3 / v.z) {
        setDraft({ kind: d.kind, points: [...d.points, p] })
      }
    }
  }

  const onPointerUp = () => {
    const dr = dragRef.current
    dragRef.current = null
    if (!dr || dr.mode !== 'draw') return
    const v = viewRef.current
    const pts = dr.points
    setLive(null)

    if (tool === 'calibrate') {
      if (pts.length >= 2) {
        const len = dist(pts[0], pts[pts.length - 1])
        if (len > 4 / v.z) onCalibrate(len)
      }
      return
    }
    if (tool === 'line') {
      if (pts.length >= 2 && dist(pts[0], pts[pts.length - 1]) > 4 / v.z) {
        commitShape('line', [pts[0], pts[pts.length - 1]])
      }
      return
    }
    if (tool === 'freehand') {
      if (pts.length >= 2 && polylineLength(pts) > 4 / v.z) commitShape('freehand', pts)
      return
    }
    if (tool === 'lasso') {
      if (pts.length >= 3 && polygonArea(pts) > (4 / v.z) ** 2) commitShape('lasso', pts)
    }
  }

  /* ---------- 渲染 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pal = paletteRef.current
    const v = view

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = pal.canvasBg
    ctx.fillRect(0, 0, w, h)

    ctx.translate(v.x, v.y)
    ctx.scale(v.z, v.z)

    if (img) {
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(img, 0, 0)
      ctx.strokeStyle = pal.imgBorder
      ctx.lineWidth = 1 / v.z
      ctx.strokeRect(0, 0, img.naturalWidth, img.naturalHeight)
    }

    const drawPath = (kind: ShapeKind, pts: Pt[], color: string, isDraft: boolean) => {
      const path = kind === 'bezier' ? bezierSamples(pts) : pts
      if (path.length < 2) return
      ctx.beginPath()
      ctx.moveTo(path[0].x, path[0].y)
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
      if (isAreaKind(kind)) {
        ctx.closePath()
        ctx.fillStyle = pal.areaFill
        ctx.fill()
      }
      ctx.strokeStyle = color
      ctx.lineWidth = (isDraft ? 1.6 : 2) / v.z
      ctx.setLineDash(isDraft ? [6 / v.z, 4 / v.z] : [])
      ctx.stroke()
      ctx.setLineDash([])
    }

    const drawLabel = (pos: Pt, text: string) => {
      ctx.save()
      ctx.translate(pos.x, pos.y)
      ctx.scale(1 / v.z, 1 / v.z)
      ctx.font = '12px "Segoe UI", "Microsoft YaHei", sans-serif'
      const tw = ctx.measureText(text).width
      ctx.fillStyle = pal.labelBg
      ctx.beginPath()
      ctx.roundRect(-tw / 2 - 7, -22, tw + 14, 19, 6)
      ctx.fill()
      ctx.fillStyle = pal.labelText
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 0, -12.5)
      ctx.restore()
    }

    const drawHandles = (s: Shape) => {
      const r = 4 / v.z
      for (const p of s.points) {
        ctx.beginPath()
        ctx.rect(p.x - r, p.y - r, r * 2, r * 2)
        ctx.fillStyle = pal.handle
        ctx.fill()
        ctx.strokeStyle = pal.line
        ctx.lineWidth = 1.5 / v.z
        ctx.stroke()
      }
    }

    // 已完成的形状
    for (const s of shapes) {
      drawPath(s.kind, s.points, pal.line, false)
      const path = shapePath(s)
      const pos = isAreaKind(s.kind) ? centroid(path) : midPoint(path)
      drawLabel(pos, measureText(s, scale))
    }

    // 拖动中的线
    if (live && live.points.length >= 2) {
      if (live.kind === 'calibrate') {
        drawPath('line', live.points, pal.draft, false)
        drawLabel(midPoint(live.points), `${Math.round(dist(live.points[0], live.points[live.points.length - 1]))} px`)
      } else {
        drawPath(live.kind as ShapeKind, live.points, pal.draft, false)
      }
    }

    // 点击式草稿
    if (draft) {
      const preview = cursor && tool !== 'area-freehand' ? [...draft.points, cursor] : draft.points
      if (preview.length >= 2) {
        const kind: ShapeKind = draft.kind === 'bezier' ? 'polyline' : draft.kind
        drawPath(kind, preview, pal.draft, true)
      }
      // 贝塞尔已放置点的预览曲线
      if (draft.kind === 'bezier' && draft.points.length === 3 && cursor) {
        drawPath('bezier', [...draft.points, cursor], pal.draft, true)
      }
      const r = 3.5 / v.z
      for (const p of draft.points) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = pal.draft
        ctx.fill()
      }
    }

    // 活动形状节点手柄
    const active = shapes.find((s) => s.id === activeId)
    if (active && (active.kind === 'bezier' || active.kind === 'area-polygon')) {
      drawHandles(active)
      if (active.kind === 'bezier') {
        // 控制点连线
        ctx.beginPath()
        ctx.moveTo(active.points[0].x, active.points[0].y)
        ctx.lineTo(active.points[1].x, active.points[1].y)
        ctx.moveTo(active.points[2].x, active.points[2].y)
        ctx.lineTo(active.points[3].x, active.points[3].y)
        ctx.strokeStyle = pal.draft
        ctx.lineWidth = 1 / v.z
        ctx.setLineDash([4 / v.z, 4 / v.z])
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }, [img, view, shapes, live, draft, cursor, activeId, scale, tool, theme])

  /* ---------- 窗口尺寸变化 ---------- */
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      setView((v) => ({ ...v }))
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const wrapClass = PAN_TOOLS.includes(tool) || spaceDown ? 'tool-pan' : 'tool-measure'

  return (
    <div className={`stage-wrap ${wrapClass}`} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={finishDraft}
      />
      <div className="hint-bar">{MEASURE_HINT[tool]}</div>
      <div className="zoom-bar">
        <button className="tbtn" title="缩小" onClick={() => setZoom(view.z / 1.25)}>
          <ZoomOut />
        </button>
        <input
          className="zval"
          value={zoomInput}
          onChange={(e) => setZoomInput(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const n = parseFloat(zoomInput)
              if (n > 0) setZoom(n / 100)
            }
          }}
          onBlur={() => {
            const n = parseFloat(zoomInput)
            if (n > 0) setZoom(n / 100)
          }}
          title="缩放倍率（%），输入后回车"
        />
        <button className="tbtn" title="放大" onClick={() => setZoom(view.z * 1.25)}>
          <ZoomIn />
        </button>
        <button className="tbtn" title="适应窗口" onClick={() => fitTo()}>
          <Maximize />
        </button>
      </div>
    </div>
  )
}
