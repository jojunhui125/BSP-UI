/**
 * IPC 채널 정의 - Main/Renderer 간 통신 채널
 * 타입 안전성을 위해 상수로 정의
 */

// ============================================
// 파일 시스템 채널
// ============================================

export const FILE_CHANNELS = {
  READ_FILE: 'file:read',
  WRITE_FILE: 'file:write',
  READ_DIR: 'file:readDir',
  GET_FILE_TREE: 'file:getTree',
  WATCH_FILE: 'file:watch',
  UNWATCH_FILE: 'file:unwatch',
} as const

// ============================================
// SSH 연결 채널
// ============================================

export const SSH_CHANNELS = {
  CONNECT: 'ssh:connect',
  DISCONNECT: 'ssh:disconnect',
  IS_CONNECTED: 'ssh:isConnected',
  TEST_CONNECTION: 'ssh:testConnection',
  EXEC: 'ssh:exec',
  EXEC_STREAM: 'ssh:execStream',
  READ_DIR: 'ssh:readDir',
  READ_FILE: 'ssh:readFile',
  WRITE_FILE: 'ssh:writeFile',
  SELECT_KEY_FILE: 'ssh:selectKeyFile',
  // 이벤트 (Renderer로 전송)
  STATUS_CHANGED: 'ssh:statusChanged',
  STREAM_DATA: 'ssh:streamData',
} as const

// ============================================
// 동기화 채널
// ============================================

export const SYNC_CHANNELS = {
  START_SYNC: 'sync:start',
  STOP_SYNC: 'sync:stop',
  GET_STATUS: 'sync:getStatus',
  ON_PROGRESS: 'sync:onProgress',
} as const

// ============================================
// 빌드 채널
// ============================================

export const BUILD_CHANNELS = {
  START_BUILD: 'build:start',
  STOP_BUILD: 'build:stop',
  GET_STATUS: 'build:getStatus',
  ON_LOG: 'build:onLog',
  GET_ARTIFACTS: 'build:getArtifacts',
  DOWNLOAD_ARTIFACT: 'build:downloadArtifact',
} as const

// ============================================
// 프로젝트 채널
// ============================================

export const PROJECT_CHANNELS = {
  OPEN_PROJECT: 'project:open',
  CLOSE_PROJECT: 'project:close',
  GET_INFO: 'project:getInfo',
  SELECT_FOLDER: 'project:selectFolder',
} as const

// ============================================
// 윈도우 채널
// ============================================

export const WINDOW_CHANNELS = {
  MINIMIZE: 'window:minimize',
  MAXIMIZE: 'window:maximize',
  CLOSE: 'window:close',
  IS_MAXIMIZED: 'window:isMaximized',
} as const

// ============================================
// 인덱스 채널 (SQLite + FTS5)
// ============================================

export const INDEX_CHANNELS = {
  START_INDEX: 'index:start',
  CANCEL_INDEX: 'index:cancel',
  GET_STATUS: 'index:getStatus',
  GET_STATS: 'index:getStats',
  CLEAR_INDEX: 'index:clear',
  // 서버 측 인덱싱 (핵폭탄급 성능!)
  SERVER_SIDE_INDEX: 'index:serverSide',
  CHECK_PYTHON: 'index:checkPython',
  SAVE_TO_SERVER: 'index:saveToServer',
  LOAD_FROM_SERVER: 'index:loadFromServer',
  GET_SERVER_META: 'index:getServerMeta',
  // 이벤트
  PROGRESS: 'index:progress',
} as const

// ============================================
// LSP 채널 (Language Server Protocol)
// ============================================

export const LSP_CHANNELS = {
  GO_TO_DEFINITION: 'lsp:goToDefinition',
  FIND_REFERENCES: 'lsp:findReferences',
  GET_HOVER: 'lsp:getHover',
  GET_COMPLETIONS: 'lsp:getCompletions',
  SEARCH_SYMBOLS: 'lsp:searchSymbols',
  FIND_DEFINITION: 'lsp:findDefinition',
  SEARCH_FILES: 'lsp:searchFiles',
  DIRECTORY_EXISTS: 'lsp:directoryExists',
} as const

// ============================================
// 캐시 채널 (LRU Cache)
// ============================================

export const CACHE_CHANNELS = {
  GET_STATS: 'cache:getStats',
  CLEAR: 'cache:clear',
} as const

// 모든 채널 타입
export type IpcChannel =
  | (typeof FILE_CHANNELS)[keyof typeof FILE_CHANNELS]
  | (typeof SSH_CHANNELS)[keyof typeof SSH_CHANNELS]
  | (typeof SYNC_CHANNELS)[keyof typeof SYNC_CHANNELS]
  | (typeof BUILD_CHANNELS)[keyof typeof BUILD_CHANNELS]
  | (typeof PROJECT_CHANNELS)[keyof typeof PROJECT_CHANNELS]
  | (typeof WINDOW_CHANNELS)[keyof typeof WINDOW_CHANNELS]
  | (typeof INDEX_CHANNELS)[keyof typeof INDEX_CHANNELS]
  | (typeof LSP_CHANNELS)[keyof typeof LSP_CHANNELS]
  | (typeof CACHE_CHANNELS)[keyof typeof CACHE_CHANNELS]