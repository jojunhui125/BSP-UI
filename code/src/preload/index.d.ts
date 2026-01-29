/**
 * Preload API 타입 선언
 * Renderer에서 window.electronAPI 타입 지원
 */

import type { ElectronAPI } from './index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
