const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const IMG_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out']);

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'mapper',
    autoHideMenuBar: true,
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeSettings(s) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf8');
}

ipcMain.handle('get-settings', () => readSettings());
ipcMain.handle('set-settings', (e, s) => writeSettings(s));

ipcMain.handle('select-dir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

function scanDir(root) {
  const out = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(path.join(dir, ent.name));
      } else if (IMG_EXTS.has(path.extname(ent.name).toLowerCase())) {
        const full = path.join(dir, ent.name);
        out.push({
          relPath: path.relative(root, full).split(path.sep).join('/'),
          absPath: full,
          fileUrl: pathToFileURL(full).href
        });
      }
    }
  })(root);
  out.sort((a, b) => a.relPath.localeCompare(b.relPath, 'zh-CN'));
  return out;
}

ipcMain.handle('scan-maps', (e, root) => scanDir(root));

ipcMain.handle('read-config', (e, imageAbsPath) => {
  const jsonPath = imageAbsPath.replace(/\.[^.]+$/, '') + '.json';
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return { ok: true, data, path: jsonPath };
  } catch (err) {
    return { ok: false, data: null, path: jsonPath };
  }
});

ipcMain.handle('write-config', (e, imageAbsPath, data) => {
  const jsonPath = imageAbsPath.replace(/\.[^.]+$/, '') + '.json';
  const tmp = jsonPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, jsonPath);
  return jsonPath;
});
