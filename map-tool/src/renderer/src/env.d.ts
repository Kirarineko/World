/// <reference types="vite/client" />

import type { MapEntry, MapConfig } from './types'

declare global {
  interface Window {
    api: {
      selectRoot: () => Promise<{ root: string; maps: MapEntry[] } | null>
      rescan: (root: string) => Promise<{ root: string; maps: MapEntry[] }>
      loadConfig: (imgPath: string) => Promise<MapConfig | null>
      saveConfig: (imgPath: string, cfg: MapConfig) => Promise<boolean>
      imageUrl: (p: string) => string
    }
  }
}

export {}
