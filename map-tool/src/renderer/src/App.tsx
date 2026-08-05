import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import CanvasStage from './components/CanvasStage'
import CalibrateModal from './components/CalibrateModal'
import type { MapEntry, ScaleInfo, Shape, ToolId } from './types'

export default function App() {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('wmt-theme') ?? 'dark')
  const [root, setRoot] = useState<string | null>(() => localStorage.getItem('wmt-root'))
  const [maps, setMaps] = useState<MapEntry[]>([])
  const [current, setCurrent] = useState<MapEntry | null>(null)
  const [tool, setTool] = useState<ToolId>('pan')
  const [scale, setScale] = useState<ScaleInfo | null>(null)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [calibPx, setCalibPx] = useState<number | null>(null)

  // 配置加载完成前不触发保存
  const loadedFor = useRef<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('wmt-theme', theme)
  }, [theme])

  // 启动时自动重扫上次目录
  useEffect(() => {
    if (root) {
      window.api.rescan(root).then((r) => setMaps(r.maps)).catch(() => setRoot(null))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openDir = useCallback(async () => {
    const r = await window.api.selectRoot()
    if (!r) return
    setRoot(r.root)
    localStorage.setItem('wmt-root', r.root)
    setMaps(r.maps)
    setCurrent(null)
  }, [])

  const rescan = useCallback(async () => {
    if (!root) return
    const r = await window.api.rescan(root)
    setMaps(r.maps)
  }, [root])

  const pickMap = useCallback(async (m: MapEntry) => {
    loadedFor.current = null
    setCurrent(m)
    setScale(null)
    setShapes([])
    setTool('pan')
    const cfg = await window.api.loadConfig(m.path)
    if (cfg) {
      setScale(cfg.scale ?? null)
      setShapes(Array.isArray(cfg.shapes) ? cfg.shapes : [])
    }
    loadedFor.current = m.path
  }, [])

  // 配置持久化（防抖）
  useEffect(() => {
    if (!current || loadedFor.current !== current.path) return
    const t = setTimeout(() => {
      window.api.saveConfig(current.path, { scale, shapes })
    }, 400)
    return () => clearTimeout(t)
  }, [current, scale, shapes])

  const onCalibrate = useCallback((px: number) => setCalibPx(px), [])

  return (
    <div className="app" data-theme={theme}>
      <Toolbar
        tool={tool}
        onTool={setTool}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onOpenDir={openDir}
      />
      <div className="body">
        <Sidebar
          root={root}
          maps={maps}
          current={current}
          onPick={pickMap}
          onOpenDir={openDir}
          onRescan={rescan}
          scale={scale}
          onStartCalibrate={() => setTool('calibrate')}
          onClearScale={() => setScale(null)}
          shapes={shapes}
          onDeleteShape={(id) => setShapes((ss) => ss.filter((s) => s.id !== id))}
        />
        {current ? (
          <CanvasStage
            map={current}
            tool={tool}
            theme={theme}
            scale={scale}
            shapes={shapes}
            onShapes={setShapes}
            onCalibrate={onCalibrate}
          />
        ) : (
          <div className="empty-stage">
            <h2>世界观地图测量工具</h2>
            <p>
              选择世界观目录后自动扫描地图图片
              <br />
              仅收录文件名包含 “map” 或 “地图” 的图片（大小写不敏感）
              <br />
              比例尺与测量记录保存在图片同级的 .maptool.json 中
            </p>
            <button className="btn primary" onClick={openDir}>
              <FolderOpen /> 选择世界观目录
            </button>
          </div>
        )}
      </div>
      {calibPx !== null && (
        <CalibrateModal
          pxLen={calibPx}
          onConfirm={(pxPerUnit, unit) => {
            setScale({ pxPerUnit, unit })
            setCalibPx(null)
            setTool('pan')
          }}
          onCancel={() => setCalibPx(null)}
        />
      )}
    </div>
  )
}
