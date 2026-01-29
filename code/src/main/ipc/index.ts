/**
 * IPC 핸들러 등록 모듈
 * 모든 IPC 핸들러를 한 곳에서 관리
 */

import { BrowserWindow } from 'electron'
import { registerFileHandlers } from './file-handlers'
import { registerWindowHandlers } from './window-handlers'
import { registerProjectHandlers } from './project-handlers'
import { registerSshHandlers, setMainWindow } from './ssh-handlers'
import { registerAllNewHandlers, setIndexMainWindow } from './index-handlers'

/**
 * 모든 IPC 핸들러 등록
 */
export function registerIpcHandlers(): void {
  registerFileHandlers()
  registerWindowHandlers()
  registerProjectHandlers()
  registerSshHandlers()
  
  // 새로운 고성능 핸들러 (SQLite + FTS5 + LRU Cache + LSP)
  registerAllNewHandlers()

  console.log('[IPC] All handlers registered')
}

/**
 * 메인 윈도우 설정 (SSH 스트리밍 등에 필요)
 */
export function setIpcMainWindow(window: BrowserWindow): void {
  setMainWindow(window)
  setIndexMainWindow(window)
}
