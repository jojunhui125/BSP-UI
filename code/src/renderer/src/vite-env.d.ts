/// <reference types="vite/client" />

// Preload에서 노출한 electronAPI 타입 선언
import type { ElectronAPI } from '../../preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
