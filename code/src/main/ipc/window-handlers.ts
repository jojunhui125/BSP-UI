/**
 * 윈도우 제어 IPC 핸들러
 */

import { ipcMain, BrowserWindow } from 'electron'
import { WINDOW_CHANNELS } from '../../shared/ipc-channels'

/**
 * 윈도우 핸들러 등록
 */
export function registerWindowHandlers(): void {
  // 윈도우 최소화
  ipcMain.on(WINDOW_CHANNELS.MINIMIZE, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.minimize()
  })

  // 윈도우 최대화/복원
  ipcMain.on(WINDOW_CHANNELS.MAXIMIZE, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window?.isMaximized()) {
      window.unmaximize()
    } else {
      window?.maximize()
    }
  })

  // 윈도우 닫기
  ipcMain.on(WINDOW_CHANNELS.CLOSE, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.close()
  })

  // 윈도우 최대화 상태 확인
  ipcMain.handle(WINDOW_CHANNELS.IS_MAXIMIZED, (event): boolean => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window?.isMaximized() ?? false
  })

  console.log('[IPC] Window handlers registered')
}
