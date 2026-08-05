window.STATE = {
  map: { relPath: '', absPath: '', image: null, w: 0, h: 0 },
  view: { scale: 1, ox: 0, oy: 0 },
  calib: { kmPerPx: 0, samples: [] },
  unit: 'km',
  layers: [],
  activeLayerId: null,
  tool: 'pan',
  draft: null,
  selected: null,
  lastResult: null
};

window.app = (() => {
  const TOOL_DEFS = [
    { id: 'pan', label: '平移', hint: '拖拽平移 · 滚轮缩放 · Ctrl+拖拽也可平移' },
    { id: 'calib', label: '标定', hint: '放大后沿比例尺拖一条线，输入实际距离' },
    { id: 'ruler', label: '测距', hint: '点击加顶点，双击/回车结束，Esc 取消' },
    { id: 'area', label: '面积', hint: '沿大陆轮廓描点，双击/回车闭合计算面积' },
    { id: 'line', label: '折线', hint: '绘制折线要素，双击完成' },
    { id: 'poly', label: '多边形', hint: '绘制多边形要素，双击完成' },
    { id: 'pen', label: '画笔', hint: '按住拖动自由描线，松开完成' },
    { id: 'mark', label: '标记', hint: '点击放置文字标记' },
    { id: 'select', label: '选择', hint: '点击要素 · 拖顶点或整体 · Delete 删除' }
  ];

  let settings = { rootDirs: [], lastMap: null, liKm: 0.5 };
  let toastTimer = null;
  let lastMouse = null;

  async function init() {
    settings = (await window.api.getSettings()) || {};
    units.setLiKm(settings.liKm || 0.5);
    bindTopbar();
    tools.bind();
    view.resize();
    view.render();
    layers.renderList();
    if (!settings.rootDirs || !settings.rootDirs.length) {
      await addDir();
    }
    await refreshMaps();
    const maps = getMapList();
    if (!maps.length) return;
    const last = settings.lastMap ? maps.find((m) => m.absPath === settings.lastMap) : null;
    await loadMap(last || maps[0]);
  }

  function bindTopbar() {
    const toolsEl = document.getElementById('tools');
    for (const def of TOOL_DEFS) {
      const btn = document.createElement('button');
      btn.textContent = def.label;
      btn.dataset.tool = def.id;
      btn.addEventListener('click', () => setTool(def.id));
      toolsEl.appendChild(btn);
    }
    document.getElementById('unit-sel').addEventListener('change', (e) => {
      STATE.unit = e.target.value;
      store.dirty();
      view.render();
      if (STATE.lastResult) showMeasureFromResult();
    });
    document.getElementById('btn-save').addEventListener('click', async () => {
      await store.save();
      const b = document.getElementById('btn-save');
      b.textContent = '已保存';
      setTimeout(() => { b.textContent = '保存'; }, 900);
    });
    document.getElementById('btn-calib-clear').addEventListener('click', () => {
      STATE.calib = { kmPerPx: 0, samples: [] };
      updateCalibButton();
      store.dirty();
      view.render();
    });
    document.getElementById('btn-settings').addEventListener('click', () => {
      showModal({
        title: '设置',
        body: '<div class="row"><label>1 里 = </label><input id="set-li" type="number" step="any" min="0.0001" value="' + (settings.liKm || 0.5) + '"><label>公里</label></div>',
        onOk: (el) => {
          const v = parseFloat(el.querySelector('#set-li').value);
          if (!(v > 0)) return false;
          settings.liKm = v;
          units.setLiKm(v);
          window.api.setSettings(settings);
          store.dirty();
          view.render();
          return true;
        }
      });
    });
    document.getElementById('btn-add-dir').addEventListener('click', addDir);
    document.getElementById('btn-rescan').addEventListener('click', refreshMaps);
    document.getElementById('btn-new-layer').addEventListener('click', () => {
      const l = layers.create();
      STATE.layers.push(l);
      STATE.activeLayerId = l.id;
      layers.renderList();
      store.dirty();
    });
    document.getElementById('btn-layer-up').addEventListener('click', () => layers.reorder(-1));
    document.getElementById('btn-layer-down').addEventListener('click', () => layers.reorder(1));
    document.getElementById('btn-layer-del').addEventListener('click', () => layers.removeActive());
    document.getElementById('btn-layer-rename').addEventListener('click', () => {
      const l = layers.active();
      if (!l) return;
      promptText('重命名图层', l.name, (v) => layers.renameActive(v));
    });
  }

  function setTool(id) {
    STATE.tool = id;
    STATE.draft = null;
    STATE.selected = null;
    for (const btn of document.querySelectorAll('#tools button')) {
      btn.classList.toggle('active', btn.dataset.tool === id);
    }
    updateStatus(lastMouse);
    view.render();
  }

  async function addDir() {
    const dir = await window.api.selectDir();
    if (!dir) return;
    if (!settings.rootDirs) settings.rootDirs = [];
    if (!settings.rootDirs.includes(dir)) {
      settings.rootDirs.push(dir);
      await window.api.setSettings(settings);
    }
    await refreshMaps();
  }

  function getMapList() {
    return window._mapList || [];
  }

  async function refreshMaps() {
    const el = document.getElementById('dir-list');
    el.innerHTML = '';
    const all = [];
    if (settings.rootDirs && settings.rootDirs.length) {
      const groups = await Promise.all(
        settings.rootDirs.map(async (root) => ({ root, maps: await window.api.scanMaps(root) }))
      );
      for (const g of groups) {
        const groupEl = document.createElement('div');
        groupEl.className = 'dir-group';
        const head = document.createElement('div');
        head.className = 'dir-name';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = g.root;
        nameSpan.title = g.root;
        const rm = document.createElement('button');
        rm.className = 'rm';
        rm.textContent = '×';
        rm.title = '移除该目录';
        rm.addEventListener('click', async () => {
          settings.rootDirs = settings.rootDirs.filter((d) => d !== g.root);
          await window.api.setSettings(settings);
          refreshMaps();
        });
        head.appendChild(nameSpan);
        head.appendChild(rm);
        groupEl.appendChild(head);
        if (!g.maps.length) {
          const tip = document.createElement('div');
          tip.className = 'empty-tip';
          tip.textContent = '未找到图片';
          groupEl.appendChild(tip);
        }
        for (const m of g.maps) {
          all.push(m);
          const item = document.createElement('div');
          item.className = 'map-item' + (m.absPath === STATE.map.absPath ? ' active' : '');
          const fname = document.createElement('span');
          fname.className = 'fname';
          fname.textContent = m.relPath.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
          const dirpart = document.createElement('span');
          dirpart.textContent = m.relPath.replace(/\.[^.]+$/, '').replace(/\/?[^/]+$/, '');
          item.appendChild(fname);
          if (dirpart.textContent) item.appendChild(document.createTextNode(' — ' + dirpart.textContent));
          item.title = m.absPath;
          item.addEventListener('click', () => loadMap(m));
          groupEl.appendChild(item);
        }
        el.appendChild(groupEl);
      }
    } else {
      const tip = document.createElement('div');
      tip.className = 'empty-tip';
      tip.textContent = '点击"+目录"选择地图根目录';
      el.appendChild(tip);
    }
    window._mapList = all;
  }

  async function loadMap(m) {
    await store.save();
    STATE.draft = null;
    STATE.selected = null;
    STATE.lastResult = null;
    document.getElementById('measure').classList.add('hidden');
    STATE.map = { relPath: m.relPath, absPath: m.absPath, image: null, w: 0, h: 0 };
    const img = new Image();
    img.src = m.fileUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('图片加载失败'));
    });
    STATE.map.image = img;
    STATE.map.w = img.naturalWidth;
    STATE.map.h = img.naturalHeight;
    const hadView = await store.loadConfig();
    view.resize();
    if (!hadView) view.fit();
    document.getElementById('map-name').textContent = m.relPath;
    document.getElementById('unit-sel').value = STATE.unit;
    updateCalibButton();
    layers.renderList();
    view.render();
    settings.lastMap = m.absPath;
    window.api.setSettings(settings);
    refreshMaps();
  }

  function updateCalibButton() {
    document.getElementById('btn-calib-clear').classList.toggle('hidden', !STATE.calib.kmPerPx);
  }

  function showModal(opts) {
    const mask = document.getElementById('modal-mask');
    const modal = document.getElementById('modal');
    modal.innerHTML =
      '<h3>' + opts.title + '</h3>' +
      opts.body +
      '<div class="actions">' +
      '<button id="m-cancel">取消</button>' +
      '<button id="m-ok">' + (opts.okText || '确定') + '</button>' +
      '</div>';
    mask.classList.remove('hidden');
    modal.querySelector('#m-cancel').addEventListener('click', () => mask.classList.add('hidden'));
    modal.querySelector('#m-ok').addEventListener('click', () => {
      const ok = opts.onOk ? opts.onOk(modal) : true;
      if (ok !== false) mask.classList.add('hidden');
    });
    const first = modal.querySelector('input');
    if (first) {
      first.focus();
      first.select();
      first.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const ok = opts.onOk ? opts.onOk(modal) : true;
          if (ok !== false) mask.classList.add('hidden');
        }
      });
    }
  }

  function promptText(title, def, onOk) {
    showModal({
      title,
      body: '<div class="row"><input id="ptext" type="text" value="' + (def || '') + '"></div>',
      onOk: (el) => {
        const v = el.querySelector('#ptext').value.trim();
        onOk(v);
        return true;
      }
    });
  }

  function showMeasureFromResult() {
    const r = STATE.lastResult;
    const el = document.getElementById('measure');
    if (!r) return;
    let html = '';
    if (r.kind === 'ruler') {
      const kmPerSeg = [];
      let total = 0;
      for (let i = 1; i < r.pts.length; i++) {
        const km = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]) * STATE.calib.kmPerPx;
        kmPerSeg.push(km);
        total += km;
      }
      html = '<div class="m-title">测距结果</div>' +
        '<div class="m-rows">' +
        '<div class="m-row"><span>总长</span><b>' + units.fmtLen(total, STATE.unit, 2) + '</b></div>' +
        '<div class="m-row"><span>分段</span><span>' + kmPerSeg.map((k) => units.fmtLen(k, STATE.unit, 2)).join(' + ') + '</span></div>' +
        '</div>';
    } else {
      const px2 = view.polyArea(r.pts);
      const km2 = px2 * STATE.calib.kmPerPx * STATE.calib.kmPerPx;
      html = '<div class="m-title">面积测量</div>' +
        '<div class="m-rows">' +
        '<div class="m-row"><span>面积</span><b>' + units.fmtArea(km2, STATE.unit, 2) + '</b></div>' +
        '</div>';
    }
    const btns = document.createElement('div');
    btns.className = 'm-btns';
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '保存为' + (r.kind === 'ruler' ? '折线' : '多边形');
    saveBtn.addEventListener('click', () => {
      const pts = r.pts.map((p) => [p[0], p[1]]);
      const ok = layers.addItem(
        r.kind === 'ruler' ? { type: 'line', points: pts } : { type: 'polygon', points: pts }
      );
      if (!ok) {
        toast('请先新建并选择图层');
        return;
      }
      STATE.lastResult = null;
      el.classList.add('hidden');
    });
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.addEventListener('click', () => {
      STATE.lastResult = null;
      el.classList.add('hidden');
    });
    btns.appendChild(saveBtn);
    btns.appendChild(closeBtn);
    el.innerHTML = html;
    el.appendChild(btns);
    el.classList.remove('hidden');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function updateStatus(mouse) {
    document.getElementById('st-zoom').textContent = STATE.map.image
      ? (STATE.view.scale * 100).toFixed(0) + '%'
      : '';
    if (mouse && STATE.map.image) {
      const p = view.screenToWorld(mouse.x, mouse.y);
      document.getElementById('st-pos').textContent = Math.round(p.x) + ', ' + Math.round(p.y);
    } else {
      document.getElementById('st-pos').textContent = '';
    }
    const k = STATE.calib.kmPerPx;
    document.getElementById('st-ratio').textContent = k > 0
      ? (k >= 1
          ? '1 图像像素 ≈ ' + units.fmtLen(k, STATE.unit, 2)
          : '1 ' + units.info(STATE.unit).label + ' ≈ ' + units.fmt((1 / k) * units.info(STATE.unit).toKm, 0) + ' 像素')
      : '未标定比例尺';
    const def = TOOL_DEFS.find((t) => t.id === STATE.tool);
    document.getElementById('st-hint').textContent = def ? def.hint : '';
  }

  window.addEventListener('pointermove', (e) => {
    lastMouse = { x: e.clientX, y: e.clientY };
    updateStatus(lastMouse);
  });

  return { init, setTool, showModal, promptText, showMeasureFromResult, toast, updateCalibButton, updateStatus };
})();

app.init();
