import { FolderOpen, RefreshCw, Ruler, Trash2, X } from 'lucide-react'
import type { MapEntry, ScaleInfo, Shape } from '../types'
import { isAreaKind, KIND_LABEL } from '../types'
import { fmt, measureText } from '../geometry'

interface Props {
  root: string | null
  maps: MapEntry[]
  current: MapEntry | null
  onPick: (m: MapEntry) => void
  onOpenDir: () => void
  onRescan: () => void
  scale: ScaleInfo | null
  onStartCalibrate: () => void
  onClearScale: () => void
  shapes: Shape[]
  onDeleteShape: (id: string) => void
}

export default function Sidebar(p: Props) {
  return (
    <div className="sidebar">
      <div className="side-section">
        <div className="side-title">
          <span>世界观目录</span>
          {p.root && (
            <button className="tbtn" title="重新扫描" onClick={p.onRescan} style={{ height: 22, minWidth: 22 }}>
              <RefreshCw />
            </button>
          )}
        </div>
        <button className="btn block" onClick={p.onOpenDir}>
          <FolderOpen /> 选择目录
        </button>
        {p.root && <div className="dir-path">{p.root}</div>}
      </div>

      <div className="side-section" style={{ flex: '0 1 auto', minHeight: 80 }}>
        <div className="side-title">地图（{p.maps.length}）</div>
        {p.maps.length === 0 && (
          <div className="empty-tip">
            {p.root
              ? '未找到地图图片。仅收录文件名包含 “map” 或 “地图” 的图片（大小写不敏感）。'
              : '选择目录后自动扫描其中的地图图片。'}
          </div>
        )}
        {p.maps.map((m) => (
          <button
            key={m.path}
            className={`map-item ${p.current?.path === m.path ? 'active' : ''}`}
            onClick={() => p.onPick(m)}
          >
            <span className="mname">{m.name}</span>
            <span className="mrel">{m.rel}</span>
          </button>
        ))}
      </div>

      {p.current && (
        <div className="side-section">
          <div className="side-title">比例尺</div>
          <div className="scale-card">
            {p.scale ? (
              <>
                <div>
                  1 {p.scale.unit} = <span className="val">{fmt(p.scale.pxPerUnit)}</span> 像素
                </div>
                <div>
                  1 像素 = <span className="val">{fmt(1 / p.scale.pxPerUnit, 4)}</span> {p.scale.unit}
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-dim)' }}>尚未校准，测量值以像素显示</div>
            )}
            <div className="row">
              <button className="btn primary" style={{ flex: 1 }} onClick={p.onStartCalibrate}>
                <Ruler /> 校准
              </button>
              {p.scale && (
                <button className="btn" title="清除比例尺" onClick={p.onClearScale}>
                  <X />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {p.current && (
        <div className="side-section" style={{ flex: 1 }}>
          <div className="side-title">测量记录（{p.shapes.length}）</div>
          {p.shapes.length === 0 && <div className="empty-tip">使用顶栏工具在地图上画线或选区。</div>}
          {p.shapes.map((s) => (
            <div className="measure-item" key={s.id}>
              <span className={`tag ${isAreaKind(s.kind) ? 'area' : ''}`}>{KIND_LABEL[s.kind]}</span>
              <span className="mval">{measureText(s, p.scale)}</span>
              <button className="del" title="删除" onClick={() => p.onDeleteShape(s.id)}>
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
