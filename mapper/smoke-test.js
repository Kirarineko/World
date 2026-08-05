const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const p = path.join(app.getPath('userData'), 'settings.json');
fs.mkdirSync(path.dirname(p), { recursive: true });
fs.writeFileSync(p, JSON.stringify({
  rootDirs: ['C:\\World'],
  lastMap: 'C:\\World\\Universe\\Local\\WorldMap.png',
  liKm: 0.5
}, null, 2));

require('./main.js');

app.on('browser-window-created', (e, win) => {
  const wc = win.webContents;
  wc.on('console-message', (ev, level, message) => {
    const msg = (ev && ev.message) || message || '';
    console.log('[renderer]', msg);
  });
  wc.on('render-process-gone', (ev, d) => console.log('[gone]', JSON.stringify(d)));
  wc.on('did-fail-load', (ev, code, desc) => console.log('[fail-load]', code, desc));
});

app.whenReady().then(() => {
  setTimeout(() => {
    console.log('SMOKE-EXIT');
    app.exit(0);
  }, 12000);
});
