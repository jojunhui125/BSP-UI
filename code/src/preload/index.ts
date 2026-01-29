/**
 * Preload Script
 * Main/Renderer 간 안전한 API 브리지
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  FILE_CHANNELS,
  WINDOW_CHANNELS,
  PROJECT_CHANNELS,
  SSH_CHANNELS,
  INDEX_CHANNELS,
  LSP_CHANNELS,
  CACHE_CHANNELS,
} from '../shared/ipc-channels'
import type { FileContent, FileTreeNode, ProjectInfo, ServerProfile, ConnectionStatus, SshReadFileResult } from '../shared/types'

// ============================================
// API 정의
// ============================================

/**
 * 파일 시스템 API
 */
const fileApi = {
  readFile: (path: string): Promise<FileContent> =>
    ipcRenderer.invoke(FILE_CHANNELS.READ_FILE, path),
    
  writeFile: (path: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke(FILE_CHANNELS.WRITE_FILE, path, content),
    
  readDir: (path: string): Promise<string[]> =>
    ipcRenderer.invoke(FILE_CHANNELS.READ_DIR, path),
    
  getFileTree: (rootPath: string): Promise<FileTreeNode[]> =>
    ipcRenderer.invoke(FILE_CHANNELS.GET_FILE_TREE, rootPath),
}

/**
 * 윈도우 제어 API
 */
const windowApi = {
  minimize: (): void => ipcRenderer.send(WINDOW_CHANNELS.MINIMIZE),
  maximize: (): void => ipcRenderer.send(WINDOW_CHANNELS.MAXIMIZE),
  close: (): void => ipcRenderer.send(WINDOW_CHANNELS.CLOSE),
  isMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke(WINDOW_CHANNELS.IS_MAXIMIZED),
}

/**
 * 프로젝트 API
 */
const projectApi = {
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(PROJECT_CHANNELS.SELECT_FOLDER),
    
  openProject: (path: string): Promise<ProjectInfo> =>
    ipcRenderer.invoke(PROJECT_CHANNELS.OPEN_PROJECT, path),
    
  getInfo: (path: string): Promise<ProjectInfo | null> =>
    ipcRenderer.invoke(PROJECT_CHANNELS.GET_INFO, path),
}

/**
 * SSH API
 */
const sshApi = {
  // 연결 관리
  connect: (profile: ServerProfile): Promise<ConnectionStatus> =>
    ipcRenderer.invoke(SSH_CHANNELS.CONNECT, profile),
    
  disconnect: (serverId: string): Promise<void> =>
    ipcRenderer.invoke(SSH_CHANNELS.DISCONNECT, serverId),
    
  isConnected: (serverId: string): Promise<boolean> =>
    ipcRenderer.invoke(SSH_CHANNELS.IS_CONNECTED, serverId),
    
  testConnection: (profile: ServerProfile): Promise<{ success: boolean; info?: string; error?: string }> =>
    ipcRenderer.invoke(SSH_CHANNELS.TEST_CONNECTION, profile),

  // 명령 실행
  exec: (serverId: string, command: string): Promise<{ stdout: string; stderr: string; code: number }> =>
    ipcRenderer.invoke(SSH_CHANNELS.EXEC, serverId, command),
    
  execStream: (serverId: string, command: string): Promise<number> =>
    ipcRenderer.invoke(SSH_CHANNELS.EXEC_STREAM, serverId, command),

  // 파일 시스템 (SFTP)
  readDir: (serverId: string, remotePath: string): Promise<string[]> =>
    ipcRenderer.invoke(SSH_CHANNELS.READ_DIR, serverId, remotePath),
    
  readFile: async (serverId: string, remotePath: string): Promise<string> => {
    const result = await ipcRenderer.invoke(
      SSH_CHANNELS.READ_FILE,
      serverId,
      remotePath
    ) as SshReadFileResult

    if (!result?.ok) {
      const error = new Error(result?.error || 'Failed to read file')
      ;(error as any).code = result?.code
      throw error
    }

    return result.content ?? ''
  },
    
  writeFile: (serverId: string, remotePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke(SSH_CHANNELS.WRITE_FILE, serverId, remotePath, content),

  // 다이얼로그
  selectKeyFile: (): Promise<string | null> =>
    ipcRenderer.invoke(SSH_CHANNELS.SELECT_KEY_FILE),

  // 이벤트 리스너
  onStatusChanged: (callback: (data: { serverId: string; connected: boolean; error?: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on(SSH_CHANNELS.STATUS_CHANGED, handler)
    return () => ipcRenderer.removeListener(SSH_CHANNELS.STATUS_CHANGED, handler)
  },

  onStreamData: (callback: (data: { type: 'stdout' | 'stderr'; data: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on(SSH_CHANNELS.STREAM_DATA, handler)
    return () => ipcRenderer.removeListener(SSH_CHANNELS.STREAM_DATA, handler)
  },
}

/**
 * 인덱스 API (SQLite + FTS5)
 */
const indexApi = {
  // 인덱싱 시작 (증분)
  startIndex: (projectPath: string, serverId: string, fullReindex?: boolean): Promise<boolean> =>
    ipcRenderer.invoke(INDEX_CHANNELS.START_INDEX, projectPath, serverId, fullReindex),
  
  // 인덱싱 취소
  cancelIndex: (): Promise<boolean> =>
    ipcRenderer.invoke(INDEX_CHANNELS.CANCEL_INDEX),
  
  // 인덱싱 상태 조회
  getStatus: (): Promise<{ isIndexing: boolean; projectPath: string }> =>
    ipcRenderer.invoke(INDEX_CHANNELS.GET_STATUS),
  
  // 인덱스 통계 조회
  getStats: (): Promise<{ files: number; symbols: number; includes: number; dtNodes: number; gpioPins: number; lastIndexTime: string | null }> =>
    ipcRenderer.invoke(INDEX_CHANNELS.GET_STATS),
  
  // 인덱스 초기화
  clearIndex: (): Promise<boolean> =>
    ipcRenderer.invoke(INDEX_CHANNELS.CLEAR_INDEX),
  
  // 진행률 이벤트
  onProgress: (callback: (progress: { phase: string; current: number; total: number; message: string; speed?: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on(INDEX_CHANNELS.PROGRESS, handler)
    return () => ipcRenderer.removeListener(INDEX_CHANNELS.PROGRESS, handler)
  },

  // 서버에 인덱스 저장 (팀 공유용)
  saveToServer: (serverId: string, projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('index:saveToServer', serverId, projectPath),

  // 서버에서 인덱스 로드 (팀 공유용)
  loadFromServer: (serverId: string, projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('index:loadFromServer', serverId, projectPath),

  // 서버 인덱스 메타데이터 조회
  getServerMeta: (serverId: string, projectPath: string): Promise<{
    exists: boolean
    lastSaved?: string
    savedBy?: string
    stats?: { files: number; symbols: number }
  }> => ipcRenderer.invoke('index:getServerMeta', serverId, projectPath),

  // 🚀 서버 측 인덱싱 (핵폭탄급 성능!)
  serverSideIndex: (projectPath: string, serverId: string): Promise<boolean> =>
    ipcRenderer.invoke('index:serverSide', projectPath, serverId),

  // Python 사용 가능 여부 확인
  checkPython: (serverId: string): Promise<{ available: boolean; version?: string }> =>
    ipcRenderer.invoke('index:checkPython', serverId),
}

/**
 * LSP API (Language Server Protocol)
 */
const lspApi = {
  // Go to Definition
  goToDefinition: (filePath: string, content: string, line: number, character: number): Promise<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } } | null> =>
    ipcRenderer.invoke(LSP_CHANNELS.GO_TO_DEFINITION, filePath, content, line, character),
  
  // Find References
  findReferences: (filePath: string, content: string, line: number, character: number): Promise<Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>> =>
    ipcRenderer.invoke(LSP_CHANNELS.FIND_REFERENCES, filePath, content, line, character),
  
  // Get Hover
  getHover: (filePath: string, content: string, line: number, character: number): Promise<{ contents: { kind: string; value: string }; range?: any } | null> =>
    ipcRenderer.invoke(LSP_CHANNELS.GET_HOVER, filePath, content, line, character),
  
  // Get Completions
  getCompletions: (filePath: string, content: string, line: number, character: number): Promise<Array<{ label: string; kind: number; detail?: string; documentation?: string; insertText?: string }>> =>
    ipcRenderer.invoke(LSP_CHANNELS.GET_COMPLETIONS, filePath, content, line, character),
  
  // Search Symbols (FTS5 전문 검색)
  searchSymbols: (query: string, limit?: number): Promise<Array<{ name: string; value: string; type: string; file_path: string; line: number }>> =>
    ipcRenderer.invoke(LSP_CHANNELS.SEARCH_SYMBOLS, query, limit),
  
  // Find Definition by name
  findDefinition: (symbolName: string): Promise<{ name: string; value: string; type: string; file_path: string; line: number } | null> =>
    ipcRenderer.invoke(LSP_CHANNELS.FIND_DEFINITION, symbolName),
  
  // Search Files (파일/경로 검색)
  searchFiles: (query: string, limit?: number): Promise<Array<{ path: string; name: string; type: string }>> =>
    ipcRenderer.invoke(LSP_CHANNELS.SEARCH_FILES, query, limit),
  
  // Directory Exists (디렉토리 존재 확인)
  directoryExists: (dirPath: string): Promise<boolean> =>
    ipcRenderer.invoke(LSP_CHANNELS.DIRECTORY_EXISTS, dirPath),
}

/**
 * 캐시 API (LRU Cache)
 */
const cacheApi = {
  // 캐시 통계 조회
  getStats: (): Promise<Record<string, { size: number; entries: number; maxSize: number; maxEntries: number; hits: number; misses: number; hitRate: number }>> =>
    ipcRenderer.invoke(CACHE_CHANNELS.GET_STATS),
  
  // 캐시 초기화
  clear: (): Promise<boolean> =>
    ipcRenderer.invoke(CACHE_CHANNELS.CLEAR),
}

// ============================================
// API 노출
// ============================================

/**
 * window.electronAPI로 Renderer에서 접근 가능
 */
const electronAPI = {
  file: fileApi,
  window: windowApi,
  project: projectApi,
  ssh: sshApi,
  // 새로운 고성능 API
  index: indexApi,
  lsp: lspApi,
  cache: cacheApi,
}

// 타입 선언 (TypeScript 지원)
export type ElectronAPI = typeof electronAPI

// Context Bridge로 안전하게 노출
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
