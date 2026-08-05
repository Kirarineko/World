window.layers = (() => {
  let seq = 0;
  const PALETTE = ['#e04040', '#2060e0', '#20a040', '#c07010', '#a030c0', '#0aa0a0', '#d04080', '#606060'];

  function uid() {
    seq += 1;
    return 'l' + seq + '_' + Math.random().toString(36).slice(2, 8);
  }

  function create(name) {
    seq += 1;
    return {
      id: uid(),
      name: name || '图层' + seq,
      visible: true,
      color: PALETTE[(seq - 1) % PALETTE.length],
      width: 2,
      items: []
    };
  }

  function active() {
    return STATE.layers.find((l) => l.id === STATE.activeLayerId) || null;
  }

  function addItem(item) {
    const l = active();
    if (!l) return false;
    l.items.push(item);
    renderList();
    store.dirty();
    view.render();
    return true;
  }

  function removeSelected() {
    if (!STATE.selected) return;
    const { layer, item } = STATE.selected;
    layer.items = layer.items.filter((i) => i !== item);
    STATE.selected = null;
    renderList();
    store.dirty();
    view.render();
  }

  function setActive(id) {
    STATE.activeLayerId = id;
    renderList();
  }

  function reorder(dir) {
    const idx = STATE.layers.findIndex((l) => l.id === STATE.activeLayerId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= STATE.layers.length) return;
    const arr = STATE.layers;
    const t = arr[idx];
    arr[idx] = arr[j];
    arr[j] = t;
    renderList();
    store.dirty();
    view.render();
  }

  function removeActive() {
    const idx = STATE.layers.findIndex((l) => l.id === STATE.activeLayerId);
    if (idx < 0) return;
    STATE.layers.splice(idx, 1);
    if (STATE.selected && STATE.selected.layer === STATE.layers[idx]) STATE.selected = null;
    STATE.activeLayerId = STATE.layers.length ? STATE.layers[Math.max(0, idx - 1)].id : null;
    renderList();
    store.dirty();
    view.render();
  }

  function renameActive(name) {
    const l = active();
    if (l && name) {
      l.name = name;
      renderList();
      store.dirty();
    }
  }

  function renderList() {
    const el = document.getElementById('layer-list');
    el.innerHTML = '';
    if (!STATE.layers.length) {
      const tip = document.createElement('div');
      tip.className = 'empty-tip';
      tip.textContent = '暂无图层，点击 + 新建';
      el.appendChild(tip);
      return;
    }
    for (const layer of STATE.layers) {
      const row = document.createElement('div');
      row.className = 'layer-item' + (layer.id === STATE.activeLayerId ? ' active' : '');
      row.dataset.id = layer.id;

      const eye = document.createElement('span');
      eye.className = 'eye';
      eye.textContent = layer.visible ? '显' : '隐';
      eye.title = layer.visible ? '点击隐藏' : '点击显示';

      const name = document.createElement('span');
      name.className = 'lname';
      name.textContent = layer.name;
      name.title = layer.name + '（双击重命名）';

      const color = document.createElement('input');
      color.type = 'color';
      color.className = 'lcolor';
      color.value = layer.color;
      color.title = '线条颜色';

      row.appendChild(eye);
      row.appendChild(name);
      row.appendChild(color);

      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        renderList();
        store.dirty();
        view.render();
      });
      row.addEventListener('click', () => setActive(layer.id));
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        app.promptText('重命名图层', layer.name, (v) => {
          if (v) {
            layer.name = v;
            renderList();
            store.dirty();
          }
        });
      });
      color.addEventListener('input', () => {
        layer.color = color.value;
        store.dirty();
        view.render();
      });
      el.appendChild(row);
    }
  }

  return { create, active, addItem, removeSelected, setActive, reorder, removeActive, renameActive, renderList };
})();
