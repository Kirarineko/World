window.tools = (() => {
  const cv = document.getElementById('cv');
  let pan = null;
  let dragSel = null;

  function toWorld(e) {
    return view.screenToWorld(e.clientX, e.clientY);
  }

  function distPtSeg(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(p.x - a[0], p.y - a[1]);
    let t = ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
  }

  function hitTest(mx, my) {
    const s = STATE.view.scale;
    const ox = STATE.view.ox;
    const oy = STATE.view.oy;
    let best = null;
    let bestD = 9;
    for (const layer of STATE.layers) {
      if (!layer.visible) continue;
      for (const item of layer.items) {
        if (item.type === 'point') {
          const d = Math.hypot(item.x * s + ox - mx, item.y * s + oy - my);
          if (d < bestD) {
            bestD = d;
            best = { layer, item, vi: null };
          }
        } else if (item.type === 'line' || item.type === 'path' || item.type === 'polygon') {
          const pts = item.points;
          for (let i = 0; i < pts.length; i++) {
            const d = Math.hypot(pts[i][0] * s + ox - mx, pts[i][1] * s + oy - my);
            if (d < 10 && d < bestD) {
              bestD = d;
              best = { layer, item, vi: i };
            }
          }
          for (let i = 1; i < pts.length; i++) {
            const d = distPtSeg(
              { x: (mx - ox) / s, y: (my - oy) / s },
              pts[i - 1],
              pts[i]
            ) * s;
            if (d < 8 && d < bestD) {
              bestD = d;
              best = { layer, item, vi: null };
            }
          }
          if (item.type === 'polygon' && pts.length > 2) {
            const d = distPtSeg(
              { x: (mx - ox) / s, y: (my - oy) / s },
              pts[pts.length - 1],
              pts[0]
            ) * s;
            if (d < 8 && d < bestD) {
              bestD = d;
              best = { layer, item, vi: null };
            }
          }
        }
      }
    }
    return best;
  }

  function onPointerDown(e) {
    if (!STATE.map.image) return;
    const p = toWorld(e);
    const tool = STATE.tool;
    if (tool === 'pan' || e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
      pan = { sx: e.clientX, sy: e.clientY, ox: STATE.view.ox, oy: STATE.view.oy };
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'calib') {
      STATE.draft = { type: 'calib', a: { x: p.x, y: p.y }, b: { x: p.x, y: p.y } };
    } else if (tool === 'ruler' || tool === 'line') {
      if (e.detail > 1) return;
      if (!STATE.draft) STATE.draft = { type: 'line', pts: [], cur: p };
      STATE.draft.pts.push([p.x, p.y]);
    } else if (tool === 'area' || tool === 'poly') {
      if (e.detail > 1) return;
      if (!STATE.draft) STATE.draft = { type: 'poly', pts: [], cur: p };
      STATE.draft.pts.push([p.x, p.y]);
    } else if (tool === 'pen') {
      STATE.draft = { type: 'pen', pts: [[p.x, p.y]] };
    } else if (tool === 'mark') {
      STATE.draft = { type: 'mark', p: { x: p.x, y: p.y } };
      app.promptText('放置标记', '', (v) => {
        if (STATE.draft && STATE.draft.type === 'mark') {
          layers.addItem({ type: 'point', x: STATE.draft.p.x, y: STATE.draft.p.y, label: v || '' });
        }
        STATE.draft = null;
        view.render();
      });
    } else if (tool === 'select') {
      const mx = (p.x * STATE.view.scale + STATE.view.ox);
      const my = (p.y * STATE.view.scale + STATE.view.oy);
      STATE.selected = hitTest(mx, my);
      if (STATE.selected) {
        const item = STATE.selected.item;
        const orig = item.type === 'point'
          ? [item.x, item.y]
          : item.points.map((pt) => [pt[0], pt[1]]);
        dragSel = { start: { x: e.clientX, y: e.clientY }, orig };
      }
    }
    view.render();
  }

  function onPointerMove(e) {
    const mx = e.clientX;
    const my = e.clientY;
    view.setMouse({ x: mx, y: my });
    if (pan) {
      STATE.view.ox = pan.ox + (mx - pan.sx) * (cv.width / cv.getBoundingClientRect().width);
      STATE.view.oy = pan.oy + (my - pan.sy) * (cv.height / cv.getBoundingClientRect().height);
      view.render();
      return;
    }
    if (!STATE.map.image) {
      view.render();
      return;
    }
    const p = toWorld(e);
    const d = STATE.draft;
    if (d && d.type === 'calib') {
      d.b = { x: p.x, y: p.y };
      view.render();
    } else if (d && (d.type === 'line' || d.type === 'poly')) {
      d.cur = p;
      view.render();
    } else if (d && d.type === 'pen') {
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(last[0] - p.x, last[1] - p.y) * STATE.view.scale > 2.5) {
        d.pts.push([p.x, p.y]);
      }
      view.render();
    } else if (dragSel && STATE.selected) {
      const r = cv.getBoundingClientRect();
      const dx = (mx - dragSel.start.x) * (cv.width / r.width) / STATE.view.scale;
      const dy = (my - dragSel.start.y) * (cv.height / r.height) / STATE.view.scale;
      const item = STATE.selected.item;
      if (item.type === 'point') {
        item.x = dragSel.orig[0] + dx;
        item.y = dragSel.orig[1] + dy;
      } else if (STATE.selected.vi !== null) {
        item.points[STATE.selected.vi][0] = dragSel.orig[STATE.selected.vi][0] + dx;
        item.points[STATE.selected.vi][1] = dragSel.orig[STATE.selected.vi][1] + dy;
      } else {
        for (let i = 0; i < item.points.length; i++) {
          item.points[i][0] = dragSel.orig[i][0] + dx;
          item.points[i][1] = dragSel.orig[i][1] + dy;
        }
      }
      view.render();
    } else {
      view.render();
    }
  }

  function onPointerUp() {
    const d = STATE.draft;
    if (pan) {
      pan = null;
      store.dirty();
    }
    if (d && d.type === 'calib') {
      const dpx = Math.hypot(d.a.x - d.b.x, d.a.y - d.b.y) * STATE.view.scale;
      if (dpx < 3) {
        STATE.draft = null;
      } else {
        finishCalib(d.a, d.b, dpx);
      }
      view.render();
    } else if (d && d.type === 'pen') {
      if (d.pts.length >= 2) {
        if (!layers.addItem({ type: 'path', points: d.pts })) {
          app.toast('请先新建并选择图层');
        }
      }
      STATE.draft = null;
      view.render();
    }
    if (dragSel) {
      dragSel = null;
      store.dirty();
    }
  }

  function finishCalib(a, b, dpx) {
    app.showModal({
      title: '标定比例尺',
      body:
        '<div class="row"><label>线段屏幕长度</label><b>' + dpx.toFixed(1) + ' px</b></div>' +
        '<div class="row"><label>对应实际距离</label><input id="calib-dist" type="number" step="any" min="0" placeholder="数值"></div>' +
        '<div class="row"><label>单位</label><b>' + units.info(STATE.unit).label + '</b></div>',
      onOk: (el) => {
        const v = parseFloat(el.querySelector('#calib-dist').value);
        if (!(v > 0)) return false;
        const distKm = units.toKm(v, STATE.unit);
        const kmPerPx = (distKm * STATE.view.scale) / dpx;
        STATE.calib.samples.push({ zoom: STATE.view.scale, dpx, dist: v });
        let sum = 0;
        for (const s of STATE.calib.samples) {
          sum += (units.toKm(s.dist, STATE.unit) * s.zoom) / s.dpx;
        }
        STATE.calib.kmPerPx = sum / STATE.calib.samples.length;
        app.updateCalibButton();
        store.dirty();
        view.render();
        return true;
      }
    });
  }

  function finishDraft() {
    const d = STATE.draft;
    if (!d || (d.type !== 'line' && d.type !== 'poly')) return;
    const t = STATE.tool;
    if (d.pts.length < 2) {
      STATE.draft = null;
      view.render();
      return;
    }
    if (t === 'ruler' || t === 'area') {
      if (!STATE.calib.kmPerPx) {
        app.toast('请先标定比例尺');
        STATE.draft = null;
        view.render();
        return;
      }
      STATE.lastResult = t === 'ruler' ? { kind: 'ruler', pts: d.pts } : { kind: 'area', pts: d.pts };
      app.showMeasureFromResult();
      STATE.draft = null;
    } else if (t === 'line' || t === 'poly') {
      const pts = d.pts.map((p) => [p[0], p[1]]);
      if (t === 'line') {
        if (!layers.addItem({ type: 'line', points: pts })) app.toast('请先新建并选择图层');
      } else {
        if (!layers.addItem({ type: 'polygon', points: pts })) app.toast('请先新建并选择图层');
      }
    }
    view.render();
  }

  function cancelDraft() {
    STATE.draft = null;
    view.render();
  }

  function onDblClick(e) {
    if (STATE.tool === 'ruler' || STATE.tool === 'area' || STATE.tool === 'line' || STATE.tool === 'poly') {
      finishDraft();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    if (!STATE.map.image) return;
    const factor = Math.pow(1.002, -e.deltaY);
    view.zoomAt(e.clientX, e.clientY, factor);
    store.dirty();
    view.render();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      const mask = document.getElementById('modal-mask');
      if (!mask.classList.contains('hidden')) {
        mask.classList.add('hidden');
        return;
      }
      if (!document.getElementById('measure').classList.contains('hidden')) {
        document.getElementById('measure').classList.add('hidden');
        return;
      }
      cancelDraft();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (STATE.selected) {
        e.preventDefault();
        layers.removeSelected();
      }
    } else if (e.key === 'Enter') {
      if (STATE.tool === 'ruler' || STATE.tool === 'area' || STATE.tool === 'line' || STATE.tool === 'poly') {
        finishDraft();
      }
    }
  }

  function bind() {
    cv.addEventListener('pointerdown', onPointerDown);
    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerup', onPointerUp);
    cv.addEventListener('dblclick', onDblClick);
    cv.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', () => {
      view.resize();
      view.render();
    });
  }

  return { bind };
})();
