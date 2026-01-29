/**
 * 공유 타입 정의 - Main/Renderer 간 공통 사용
 */

// ============================================
// 프로젝트 관련 타입
// ============================================

export interface ProjectInfo {
  path: string
  name: string
  machine?: string
  distro?: string
  layers: LayerInfo[]
}

export interface LayerInfo {
  name: string
  path: string
  priority: number
}

// ============================================
// 서버 연결 관련 타입
// ============================================

export interface ServerProfile {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'  // 인증 방식
  password?: string              // 비밀번호 인증
  privateKeyPath?: string        // SSH 키 경로
  passphrase?: string            // SSH 키 비밀번호
  workspacePath: string
}

export interface ConnectionStatus {
  connected: boolean
  serverId?: string
  error?: string
}

export interface SshReadFileResult {
  ok: boolean
  content?: string
  error?: string
  code?: string | number
}

// ============================================
// 빌드 관련 타입
// ============================================

export interface BuildJob {
  id: string
  project: string
  machine: string
  image: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  startTime?: string
  endTime?: string
  logPath?: string
}

export interface BuildArtifact {
  file: string
  type: 'sdcard_image' | 'kernel' | 'dtb' | 'rootfs' | 'other'
  size: number
  sha256: string
}

// ============================================
// 파일 시스템 관련 타입
// ============================================

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  extension?: string
}

export interface FileContent {
  path: string
  content: string
  encoding: 'utf-8' | 'binary'
}

// ============================================
// UI 상태 관련 타입
// ============================================

export interface PanelLayout {
  sidebarWidth: number
  bottomPanelHeight: number
  rightPanelWidth: number
  sidebarVisible: boolean
  bottomPanelVisible: boolean
  rightPanelVisible: boolean
}

export interface TabInfo {
  id: string
  path: string
  name: string
  isDirty: boolean
  isActive: boolean
}
