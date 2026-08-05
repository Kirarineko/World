import {
  Brush,
  FolderOpen,
  Hand,
  Hexagon,
  Lasso,
  Moon,
  Pencil,
  PenTool,
  Ruler,
  Slash,
  Sun,
  Waypoints,
} from 'lucide-react'
import type { ToolId } from '../types'

interface Props {
  tool: ToolId
  onTool: (t: ToolId) => void
  theme: string
  onToggleTheme: () => void
  onOpenDir: () => void
}

const GROUPS: { label: string; items: { id: ToolId; title: string; icon: JSX.Element }[] }[] = [
  {
    label: '画布',
    items: [
      { id: 'pan', title: '移动画布', icon: <Hand /> },
      { id: 'calibrate', title: '比例尺校准', icon: <Ruler /> },
    ],
  },
  {
    label: '测距',
    items: [
      { id: 'line', title: '直线', icon: <Slash /> },
      { id: 'polyline', title: '折线', icon: <Waypoints /> },
      { id: 'freehand', title: '自由画笔', icon: <Pencil /> },
      { id: 'bezier', title: '贝塞尔曲线', icon: <PenTool /> },
    ],
  },
  {
    label: '测面',
    items: [
      { id: 'area-freehand', title: '自由选区（自动闭合）', icon: <Brush /> },
      { id: 'area-polygon', title: '多边形（节点可拖动）', icon: <Hexagon /> },
      { id: 'lasso', title: '套索（按住圈选）', icon: <Lasso /> },
    ],
  },
]

export default function Toolbar({ tool, onTool, theme, onToggleTheme, onOpenDir }: Props) {
  return (
    <div className="header">
      <span className="brand">地图测量</span>
      {GROUPS.map((g) => (
        <div className="tool-group" key={g.label}>
          <span className="group-label">{g.label}</span>
          {g.items.map((it) => (
            <button
              key={it.id}
              className={`tbtn ${tool === it.id ? 'active' : ''}`}
              title={it.title}
              onClick={() => onTool(it.id)}
            >
              {it.icon}
            </button>
          ))}
        </div>
      ))}
      <div className="spacer" />
      <button className="tbtn" title="选择世界观目录" onClick={onOpenDir}>
        <FolderOpen />
      </button>
      <button className="tbtn" title="切换主题" onClick={onToggleTheme}>
        {theme === 'dark' ? <Sun /> : <Moon />}
      </button>
    </div>
  )
}
