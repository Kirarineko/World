import { useState } from 'react'
import { fmt } from '../geometry'

interface Props {
  pxLen: number
  onConfirm: (pxPerUnit: number, unit: string) => void
  onCancel: () => void
}

export default function CalibrateModal({ pxLen, onConfirm, onCancel }: Props) {
  const [dist, setDist] = useState('')
  const [unit, setUnit] = useState('公里')

  const n = parseFloat(dist)
  const valid = isFinite(n) && n > 0 && unit.trim().length > 0

  return (
    <div className="modal-mask" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>设置比例尺</h3>
        <div className="sub">
          参考线长度 <b>{fmt(pxLen)}</b> 像素，输入它代表的实际距离
        </div>
        <div className="field">
          <label>实际距离</label>
          <input
            className="input"
            autoFocus
            type="number"
            min="0"
            step="any"
            placeholder="例如 50"
            value={dist}
            onChange={(e) => setDist(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) onConfirm(pxLen / n, unit.trim())
              if (e.key === 'Escape') onCancel()
            }}
          />
        </div>
        <div className="field">
          <label>单位</label>
          <input
            className="input"
            placeholder="公里 / 里 / 米…"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) onConfirm(pxLen / n, unit.trim())
              if (e.key === 'Escape') onCancel()
            }}
          />
        </div>
        <div className="actions">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => valid && onConfirm(pxLen / n, unit.trim())}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
