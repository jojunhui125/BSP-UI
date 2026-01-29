/**
 * 인덱스 및 LSP 관련 IPC 핸들러
 * SQLite 기반 고성능 인덱싱 + LSP 기능
 */

import { ipcMain, BrowserWindow } from 'electron'
import { indexManager } from '../indexer/IndexManager'
import { indexDb } from '../database/IndexDatabase'
import { languageService } from '../lsp/LanguageService'
import { 
  fileContentCache, 
  astCache, 
  searchCache, 
  symbolCache,
  getAllCacheStats,
  clearAllCaches
} from '../cache/LRUCache'

// IPC 채널 정의
export const INDEX_CHANNELS = {
  // 인덱싱
  START_INDEX: 'index:start',
  CANCEL_INDEX: 'index:cancel',
  GET_STATUS: 'index:getStatus',
  GET_STATS: 'index:getStats',
  CLEAR_INDEX: 'index:clear',
  // 이벤트
  PROGRESS: 'index:progress',
} as const

export const LSP_CHANNELS = {
  // 정의 이동
  GO_TO_DEFINITION: 'lsp:goToDefinition',
  // 참조 찾기
  FIND_REFERENCES: 'lsp:findReferences',
  // 호버 정보
  GET_HOVER: 'lsp:getHover',
  // 자동완성
  GET_COMPLETIONS: 'lsp:getCompletions',
  // 심볼 검색
  SEARCH_SYMBOLS: 'lsp:searchSymbols',
  // 심볼 정의 찾기
  FIND_DEFINITION: 'lsp:findDefinition',
  // 파일/경로 검색
  SEARCH_FILES: 'lsp:searchFiles',
  // 디렉토리 존재 확인
  DIRECTORY_EXISTS: 'lsp:directoryExists',
} as const

export const CACHE_CHANNELS = {
  GET_STATS: 'cache:getStats',
  CLEAR: 'cache:clear',
} as const

let mainWindow: BrowserWindow | null = null

/**
 * 메인 윈도우 설정
 */
export function setIndexMainWindow(window: BrowserWindow): void {
  mainWindow = window
  indexManager.setMainWindow(window)
}

/**
 * 인덱스 핸들러 등록
 */
export function registerIndexHandlers(): void {
  // 인덱싱 시작
  ipcMain.handle(INDEX_CHANNELS.START_INDEX, async (_event, projectPath: string, serverId: string, fullReindex?: boolean) => {
    console.log(`[IPC] index:start - ${projectPath}`)
    languageService.setProjectPath(projectPath)
    return indexManager.startIndexing(projectPath, serverId, fullReindex ?? false)
  })

  // 인덱싱 취소
  ipcMain.handle(INDEX_CHANNELS.CANCEL_INDEX, async () => {
    console.log('[IPC] index:cancel')
    indexManager.cancelIndexing()
    return true
  })

  // 인덱싱 상태 조회
  ipcMain.handle(INDEX_CHANNELS.GET_STATUS, async () => {
    return indexManager.getStatus()
  })

  // 인덱스 통계 조회
  ipcMain.handle(INDEX_CHANNELS.GET_STATS, async () => {
    return indexManager.getStats()
  })

  // 인덱스 초기화
  ipcMain.handle(INDEX_CHANNELS.CLEAR_INDEX, async () => {
    console.log('[IPC] index:clear')
    indexDb.clearAll()
    clearAllCaches()
    return true
  })

  // 인덱스를 서버에 저장 (팀 공유용)
  ipcMain.handle('index:saveToServer', async (_event, serverId: string, projectPath: string) => {
    console.log(`[IPC] index:saveToServer - ${projectPath}`)
    return indexManager.saveIndexToServer(serverId, projectPath)
  })

  // 서버에서 인덱스 로드 (팀 공유용)
  ipcMain.handle('index:loadFromServer', async (_event, serverId: string, projectPath: string) => {
    console.log(`[IPC] index:loadFromServer - ${projectPath}`)
    return indexManager.loadIndexFromServer(serverId, projectPath)
  })

  // 서버 인덱스 메타데이터 조회
  ipcMain.handle('index:getServerMeta', async (_event, serverId: string, projectPath: string) => {
    return indexManager.getServerIndexMeta(serverId, projectPath)
  })

  // 🚀 서버 측 인덱싱 (핵폭탄급 성능!)
  ipcMain.handle('index:serverSide', async (_event, projectPath: string, serverId: string) => {
    console.log(`[IPC] index:serverSide - ${projectPath}`)
    languageService.setProjectPath(projectPath)
    return indexManager.startServerSideIndexing(projectPath, serverId)
  })

  // Python 사용 가능 여부 확인
  ipcMain.handle('index:checkPython', async (_event, serverId: string) => {
    console.log(`[IPC] index:checkPython`)
    return indexManager.checkPythonAvailable(serverId)
  })

  console.log('[IPC] Index handlers registered')
}

/**
 * LSP 핸들러 등록
 */
export function registerLspHandlers(): void {
  // Go to Definition
  ipcMain.handle(LSP_CHANNELS.GO_TO_DEFINITION, async (_event, filePath: string, content: string, line: number, character: number) => {
    console.log(`[IPC] lsp:goToDefinition - ${filePath}:${line}:${character}`)
    return languageService.getDefinition(filePath, content, { line, character })
  })

  // Find References
  ipcMain.handle(LSP_CHANNELS.FIND_REFERENCES, async (_event, filePath: string, content: string, line: number, character: number) => {
    console.log(`[IPC] lsp:findReferences - ${filePath}:${line}:${character}`)
    return languageService.getReferences(filePath, content, { line, character })
  })

  // Get Hover
  ipcMain.handle(LSP_CHANNELS.GET_HOVER, async (_event, filePath: string, content: string, line: number, character: number) => {
    return languageService.getHover(filePath, content, { line, character })
  })

  // Get Completions
  ipcMain.handle(LSP_CHANNELS.GET_COMPLETIONS, async (_event, filePath: string, content: string, line: number, character: number) => {
    return languageService.getCompletions(filePath, content, { line, character })
  })

  // Search Symbols (FTS5)
  ipcMain.handle(LSP_CHANNELS.SEARCH_SYMBOLS, async (_event, query: string, limit?: number) => {
    console.log(`[IPC] lsp:searchSymbols - ${query}`)
    return languageService.searchSymbols(query, limit ?? 50)
  })

  // Find Definition (by name)
  ipcMain.handle(LSP_CHANNELS.FIND_DEFINITION, async (_event, symbolName: string) => {
    return languageService.findDefinition(symbolName)
  })

  // Search Files (파일/경로 검색)
  ipcMain.handle(LSP_CHANNELS.SEARCH_FILES, async (_event, query: string, limit?: number) => {
    console.log(`[IPC] lsp:searchFiles - ${query}`)
    return indexDb.searchFiles(query, limit ?? 50)
  })

  // Directory Exists (디렉토리 존재 확인)
  ipcMain.handle(LSP_CHANNELS.DIRECTORY_EXISTS, async (_event, dirPath: string) => {
    return indexDb.directoryExists(dirPath)
  })

  console.log('[IPC] LSP handlers registered')
}

/**
 * 캐시 핸들러 등록
 */
export function registerCacheHandlers(): void {
  // 캐시 통계 조회
  ipcMain.handle(CACHE_CHANNELS.GET_STATS, async () => {
    return getAllCacheStats()
  })

  // 캐시 초기화
  ipcMain.handle(CACHE_CHANNELS.CLEAR, async () => {
    console.log('[IPC] cache:clear')
    clearAllCaches()
    return true
  })

  console.log('[IPC] Cache handlers registered')
}

/**
 * 모든 새 핸들러 등록
 */
export function registerAllNewHandlers(): void {
  registerIndexHandlers()
  registerLspHandlers()
  registerCacheHandlers()
}
