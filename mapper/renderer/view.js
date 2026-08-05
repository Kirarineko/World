window.view = (() => {
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  let lastMouse = null;

  function resize() {
    const wrap = document.getElementById('canvas-wrap');
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(wrap.clientWidth * dpr));
    cv.height = Math.max(1, Math.round(wrap.clientHeight * dpr));
  }

  function cssToCanvas(cx, cy) {
    const r = cv.getBoundingClientRect();
    return {
      x: (cx - r.left) * (cv.width / r.width),
      y: (cy - r.top) * (cv.height / r.height)
    };
  }

  function screenToWorld(cx, cy) {
    const p = cssToCanvas(cx, cy);
    const s = STATE.view.scale;
    return {
      x: (p.x - STATE.view.ox) / s,
      y: (p.y - STATE.view.oy) / s
    };
  }

  function fit() {
    const { w, h } = STATE.map;
    if (!w) return;
    const s = Math.min(cv.width / w, cv.height / h) * 0.94;
    STATE.view.scale = s;
    STATE.view.ox = (cv.width - w * s) / 2;
    STATE.view.oy = (cv.height - h * s) / 2;
  }

  function zoomAt(cx, cy, factor) {
    const p = cssToCanvas(cx, cy);
    const s = Math.min(64, Math.max(0.05, STATE.view.scale * factor));
    const k = s / STATE.view.scale;
    STATE.view.scale = s;
    STATE.view.ox = p.x - (p.x - STATE.view.ox) * k;
    STATE.view.oy = p.y - (p.y - STATE.view.oy) * k;
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function segLen(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  function polylineLen(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += segLen(pts[i - 1], pts[i]);
    return len;
  }

  function polyArea(pts) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    return Math.abs(area) / 2;
  }

  function drawLayer(layer) {
    const s = STATE.view.scale;
    ctx.lineWidth = layer.width / s;
    ctx.strokeStyle = layer.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const it of layer.items) {
      if (it.type === 'point') {
        ctx.beginPath();
        ctx.arc(it.x, it.y, 3 / s, 0, Math.PI * 2);
        ctx.fillStyle = layer.color;
        ctx.fill();
        if (it.label) {
          ctx.fillStyle = 'rgba(0,0,0,.78)';
          ctx.font = (11 / s) + 'px sans-serif';
          ctx.textBaseline = 'bottom';
          ctx.fillText(it.label, it.x + 5 / s, it.y - 4 / s);
        }
      } else if (it.type === 'polygon') {
        if (it.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(it.points[0][0], it.points[0][1]);
        for (let i = 1; i < it.points.length; i++) ctx.lineTo(it.points[i][0], it.points[i][1]);
        ctx.closePath();
        if (it.points.length > 2) {
          ctx.fillStyle = hexA(layer.color, 0.12);
          ctx.fill();
        }
        ctx.stroke();
      } else if (it.type === 'line' || it.type === 'path') {
        if (it.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(it.points[0][0], it.points[0][1]);
        for (let i = 1; i < it.points.length; i++) ctx.lineTo(it.points[i][0], it.points[i][1]);
        ctx.stroke();
      }
    }
  }

  function dot(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawDraft() {
    const d = STATE.draft;
    if (!d) return;
    const s = STATE.view.scale;
    ctx.save();
    ctx.setTransform(s, 0, 0, s, STATE.view.ox, STATE.view.oy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (d.type === 'calib') {
      ctx.strokeStyle = '#e04040';
      ctx.lineWidth = 1.5 / s;
      ctx.beginPath();
      ctx.moveTo(d.a.x, d.a.y);
      ctx.lineTo(d.b.x, d.b.y);
      ctx.stroke();
      dot(d.a.x, d.a.y, 3.5 / s, '#e04040');
      dot(d.b.x, d.b.y, 3.5 / s, '#e04040');
      const dpx = Math.hypot(d.a.x - d.b.x, d.a.y - d.b.y) * s;
      ctx.fillStyle = '#e04040';
      ctx.font = 'bold ' + (12 / s) + 'px sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText(dpx.toFixed(0) + ' px', (d.a.x + d.b.x) / 2 + 6 / s, Math.min(d.a.y, d.b.y) - 4 / s);
    } else if (d.type === 'line' || d.type === 'poly') {
      ctx.strokeStyle = '#2060e0';
      ctx.lineWidth = 1.5 / s;
      if (d.pts.length) {
        ctx.beginPath();
        ctx.moveTo(d.pts[0][0], d.pts[0][1]);
        for (let i = 1; i < d.pts.length; i++) ctx.lineTo(d.pts[i][0], d.pts[i][1]);
        if (d.type === 'poly' && d.pts.length > 1) ctx.lineTo(d.cur.x, d.cur.y);
        else ctx.lineTo(d.cur.x, d.cur.y);
        ctx.stroke();
        if (d.type === 'poly' && d.pts.length > 2) {
          ctx.fillStyle = 'rgba(32,96,224,.10)';
          ctx.beginPath();
          ctx.moveTo(d.pts[0][0], d.pts[0][1]);
          for (let i = 1; i < d.pts.length; i++) ctx.lineTo(d.pts[i][0], d.pts[i][1]);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(32,96,224,.55)';
        ctx.lineWidth = 1 / s;
        ctx.setLineDash([6 / s, 5 / s]);
        ctx.beginPath();
        const lp = d.pts[d.pts.length - 1];
        ctx.moveTo(lp[0], lp[1]);
        ctx.lineTo(d.cur.x, d.cur.y);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const p of d.pts) dot(p[0], p[1], 3 / s, '#2060e0');
      }
    } else if (d.type === 'mark') {
      dot(d.p.x, d.p.y, 3.5 / s, '#a030c0');
      ctx.strokeStyle = '#a030c0';
      ctx.lineWidth = 1 / s;
      ctx.beginPath();
      ctx.arc(d.p.x, d.p.y, 8 / s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSelected() {
    const sel = STATE.selected;
    if (!sel) return;
    const { item } = sel;
    const s = STATE.view.scale;
    ctx.save();
    ctx.setTransform(s, 0, 0, s, STATE.view.ox, STATE.view.oy);
    ctx.strokeStyle = '#e04040';
    ctx.lineWidth = 1 / s;
    ctx.setLineDash([5 / s, 4 / s]);
    ctx.lineCap = 'round';
    if (item.type === 'point') {
      ctx.beginPath();
      ctx.arc(item.x, item.y, 6 / s, 0, Math.PI * 2);
      ctx.stroke();
      dot(item.x, item.y, 3.5 / s, '#e04040');
    } else {
      const pts = item.points;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (item.type === 'polygon') ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < pts.length; i++) {
        ctx.fillStyle = i === sel.vi ? '#e04040' : '#ffffff';
        ctx.strokeStyle = '#e04040';
        ctx.lineWidth = 1.2 / s;
        ctx.beginPath();
        ctx.rect(pts[i][0] - 3.5 / s, pts[i][1] - 3.5 / s, 7 / s, 7 / s);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const { image, w, h } = STATE.map;
    if (image) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.setTransform(STATE.view.scale, 0, 0, STATE.view.scale, STATE.view.ox, STATE.view.oy);
      ctx.drawImage(image, 0, 0, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (image) {
      ctx.setTransform(STATE.view.scale, 0, 0, STATE.view.scale, STATE.view.ox, STATE.view.oy);
      for (const l of STATE.layers) {
        if (l.visible) drawLayer(l);
      }
      drawSelected();
      drawDraft();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    updateScaleBar();
    app.updateStatus(lastMouse);
  }

  function round125(v) {
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * mag;
  }

  function updateScaleBar() {
    const sb = document.getElementById('scalebar');
    if (!STATE.map.image || !STATE.calib.kmPerPx) {
      sb.classList.add('hidden');
      return;
    }
    const toKm = units.info(STATE.unit).toKm;
    const pxPerUnit = (STATE.view.scale / STATE.calib.kmPerPx) * toKm;
    if (!(pxPerUnit > 0)) {
      sb.classList.add('hidden');
      return;
    }
    const val = round125(170 / pxPerUnit);
    const w = Math.max(20, val * pxPerUnit);
    sb.querySelector('.bar').style.width = w + 'px';
    sb.querySelector('.txt').textContent = units.fmt(val, val < 10 ? 1 : 0) + ' ' + units.info(STATE.unit).label;
    sb.classList.remove('hidden');
  }

  function setMouse(m) {
    lastMouse = m;
  }

  return { resize, render, fit, screenToWorld, zoomAt, setMouse, polylineLen, polyArea };
})();
