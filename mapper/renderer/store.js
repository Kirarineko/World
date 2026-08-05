window.store = (() => {
  let timer = null;
  let saving = false;

  function dirty() {
    if (saving) return;
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  }

  async function save() {
    if (!STATE.map.absPath) return;
    clearTimeout(timer);
    saving = true;
    try {
      const data = {
        version: 1,
        unit: STATE.unit,
        calib: STATE.calib,
        view: STATE.view,
        layers: STATE.layers
      };
      await window.api.writeConfig(STATE.map.absPath, data);
    } catch (err) {
      console.error('保存失败', err);
      app.toast('保存失败');
    }
    saving = false;
  }

  async function loadConfig() {
    const r = await window.api.readConfig(STATE.map.absPath);
    if (r.ok && r.data && r.data.version === 1) {
      STATE.unit = r.data.unit || 'km';
      STATE.calib = r.data.calib && r.data.calib.kmPerPx ? r.data.calib : { kmPerPx: 0, samples: [] };
      STATE.view = Object.assign({ scale: 1, ox: 0, oy: 0 }, r.data.view || {});
      STATE.layers = Array.isArray(r.data.layers) && r.data.layers.length ? r.data.layers : [layers.create('标注')];
      STATE.activeLayerId = STATE.layers[0].id;
      return true;
    }
    STATE.calib = { kmPerPx: 0, samples: [] };
    STATE.view = { scale: 1, ox: 0, oy: 0 };
    STATE.layers = [layers.create('标注')];
    STATE.activeLayerId = STATE.layers[0].id;
    return false;
  }

  return { dirty, save, loadConfig };
})();
