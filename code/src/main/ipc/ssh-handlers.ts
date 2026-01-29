/**
 * SSH 관련 IPC 핸들러
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { SSH_CHANNELS } from '../../shared/ipc-channels'
import { sshManager } from '../ssh/SshManager'
import type { ServerProfile, ConnectionStatus, SshReadFileResult } from '../../shared/types'

// 스트림 데이터를 Renderer로 전송하기 위한 참조
let mainWindow: BrowserWindow | null = null

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window
}

/**
 * SSH 핸들러 등록
 */
export function registerSshHandlers(): void {
  // SSH 연결
  ipcMain.handle(
    SSH_CHANNELS.CONNECT,
    async (_event, profile: ServerProfile): Promise<ConnectionStatus> => {
      return await sshManager.connect(profile)
    }
  )

  // SSH 연결 해제
  ipcMain.handle(SSH_CHANNELS.DISCONNECT, async (_event, serverId: string): Promise<void> => {
    sshManager.disconnect(serverId)
  })

  // 연결 상태 확인
  ipcMain.handle(SSH_CHANNELS.IS_CONNECTED, async (_event, serverId: string): Promise<boolean> => {
    return sshManager.isConnected(serverId)
  })

  // 연결 테스트
  ipcMain.handle(
    SSH_CHANNELS.TEST_CONNECTION,
    async (_event, profile: ServerProfile): Promise<{ success: boolean; info?: string; error?: string }> => {
      return await sshManager.testConnection(profile)
    }
  )

  // 원격 명령 실행
  ipcMain.handle(
    SSH_CHANNELS.EXEC,
    async (_event, serverId: string, command: string): Promise<{ stdout: string; stderr: string; code: number }> => {
      return await sshManager.exec(serverId, command)
    }
  )

  // 원격 명령 실행 (스트리밍) - 빌드 로그 등에 사용
  ipcMain.handle(
    SSH_CHANNELS.EXEC_STREAM,
    async (_event, serverId: string, command: string): Promise<number> => {
      return await sshManager.execStream(
        serverId,
        command,
        (data) => {
          mainWindow?.webContents.send(SSH_CHANNELS.STREAM_DATA, { type: 'stdout', data })
        },
        (data) => {
          mainWindow?.webContents.send(SSH_CHANNELS.STREAM_DATA, { type: 'stderr', data })
        }
      )
    }
  )

  // 원격 디렉토리 읽기
  ipcMain.handle(
    SSH_CHANNELS.READ_DIR,
    async (_event, serverId: string, remotePath: string): Promise<string[]> => {
      return await sshManager.readDir(serverId, remotePath)
    }
  )

  // 원격 파일 읽기
  ipcMain.handle(
    SSH_CHANNELS.READ_FILE,
    async (_event, serverId: string, remotePath: string): Promise<SshReadFileResult> => {
      try {
        const content = await sshManager.readFile(serverId, remotePath)
        return { ok: true, content }
      } catch (err: any) {
        const code = err?.code
        const message =
          code === 2 || /no such file/i.test(err?.message || '')
            ? `File not found: ${remotePath}`
            : err?.message || 'Failed to read file'
        return { ok: false, error: message, code }
      }
    }
  )

  // 원격 파일 쓰기
  ipcMain.handle(
    SSH_CHANNELS.WRITE_FILE,
    async (_event, serverId: string, remotePath: string, content: string): Promise<void> => {
      return await sshManager.writeFile(serverId, remotePath, content)
    }
  )

  // SSH 키 파일 선택 다이얼로그
  ipcMain.handle(SSH_CHANNELS.SELECT_KEY_FILE, async (event): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      title: 'SSH 개인 키 파일 선택',
      properties: ['openFile'],
      filters: [
        { name: 'SSH 키', extensions: ['pem', 'ppk', ''] },
        { name: '모든 파일', extensions: ['*'] },
      ],
      defaultPath: process.env.HOME || process.env.USERPROFILE,
    })

    return result.canceled ? null : result.filePaths[0]
  })

  // SSH 이벤트를 Renderer로 전달
  sshManager.on('connected', (serverId: string) => {
    mainWindow?.webContents.send(SSH_CHANNELS.STATUS_CHANGED, { serverId, connected: true })
  })

  sshManager.on('disconnected', (serverId: string) => {
    mainWindow?.webContents.send(SSH_CHANNELS.STATUS_CHANGED, { serverId, connected: false })
  })

  sshManager.on('error', (serverId: string, error: string) => {
    mainWindow?.webContents.send(SSH_CHANNELS.STATUS_CHANGED, { serverId, connected: false, error })
  })

  console.log('[IPC] SSH handlers registered')
}
