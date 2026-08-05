import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'])
// 文件名需包含 “map” 或 “地图” 字样（大小写不敏感）
const NAME_RE = /map|地图/i

interface MapEntry {
  path: string
  name: string
  rel: string
}

async function scanDir(dir: string, root: string, out: MapEntry[], depth: number): Promise<void> {
  if (depth > 12) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'out' || e.name === 'dist') continue
      await scanDir(full, root, out, depth + 1)
    } else if (IMAGE_EXTS.has(path.extname(e.name).toLowerCase()) && NAME_RE.test(e.name)) {
      out.push({ path: full, name: e.name, rel: path.relative(root, full) })
    }
  }
}

async function scan(root: string): Promise<MapEntry[]> {
  const out: MapEntry[] = []
  await scanDir(root, root, out, 0)
  out.sort((a, b) => a.rel.localeCompare(b.rel, 'zh-CN'))
  return out
}

// 配置文件与地图图片同级目录：<图片名>.maptool.json
function configPath(imgPath: string): string {
  const dir = path.dirname(imgPath)
  const base = path.basename(imgPath, path.extname(imgPath))
  return path.join(dir, `${base}.maptool.json`)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0e1116',
    title: '世界观地图测量工具',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // 自定义协议读取本地图片，避免 base64 过 IPC
  protocol.handle('mapimg', (request) => {
    const p = new URL(request.url).searchParams.get('p')
    if (!p) return new Response('missing path', { status: 400 })
    return net.fetch(pathToFileURL(p).toString())
  })

  ipcMain.handle('dialog:selectRoot', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const r = await dialog.showOpenDialog(win, {
      title: '选择世界观目录',
      properties: ['openDirectory'],
    })
    if (r.canceled || !r.filePaths[0]) return null
    const root = r.filePaths[0]
    return { root, maps: await scan(root) }
  })

  ipcMain.handle('scan:root', async (_e, root: string) => {
    return { root, maps: await scan(root) }
  })

  ipcMain.handle('config:load', async (_e, imgPath: string) => {
    try {
      return JSON.parse(await fs.readFile(configPath(imgPath), 'utf-8'))
    } catch {
      return null
    }
  })

  ipcMain.handle('config:save', async (_e, imgPath: string, cfg: unknown) => {
    await fs.writeFile(configPath(imgPath), JSON.stringify(cfg, null, 2), 'utf-8')
    return true
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
