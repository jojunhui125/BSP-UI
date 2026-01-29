/**
 * Main Process 진입점
 * Electron 앱의 생명주기와 윈도우 관리
 */

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers, setIpcMainWindow } from './ipc'

// 메인 윈도우 참조
let mainWindow: BrowserWindow | null = null

/**
 * 메인 윈도우 생성
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false, // ready-to-show 이벤트에서 표시
    frame: false, // 커스텀 타이틀바 사용
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // electron-toolkit 호환
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 윈도우 준비 완료 시 표시
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 외부 링크는 기본 브라우저에서 열기
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 개발/프로덕션 환경에 따른 로딩
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 개발 모드에서 DevTools 열기
  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

/**
 * 앱 초기화
 */
app.whenReady().then(() => {
  // 앱 ID 설정 (Windows)
  electronApp.setAppUserModelId('com.bsp-studio')

  // 개발 모드에서 F12로 DevTools 토글
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC 핸들러 등록
  registerIpcHandlers()

  // 메인 윈도우 생성
  createWindow()

  // SSH 스트리밍을 위한 메인 윈도우 설정
  if (mainWindow) {
    setIpcMainWindow(mainWindow)
  }

  // macOS: Dock 클릭 시 윈도우 재생성
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 모든 윈도우 닫힘 시 앱 종료 (macOS 제외)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 메인 윈도우 참조 export (다른 모듈에서 사용)
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
