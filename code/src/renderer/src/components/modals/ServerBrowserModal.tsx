/**
 * 서버 파일 브라우저 모달
 * 서버의 디렉토리를 탐색하고 프로젝트 폴더 선택
 */

import { useState, useEffect } from 'react'
import { useSshStore } from '../../stores/sshStore'

interface ServerBrowserModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (path: string) => void
  initialPath?: string
}

interface DirEntry {
  name: string
  isDirectory: boolean
  size?: number
}

export function ServerBrowserModal({ isOpen, onClose, onSelect, initialPath }: ServerBrowserModalProps) {
  const { activeProfile, connectionStatus } = useSshStore()
  
  const [currentPath, setCurrentPath] = useState(initialPath || '/home')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  // 디렉토리 목록 로드
  const loadDirectory = async (path: string) => {
    if (!activeProfile || !connectionStatus.connected) return

    setLoading(true)
    setError(null)

    try {
      // ls -la 명령으로 디렉토리 정보 가져오기
      const result = await window.electronAPI.ssh.exec(
        activeProfile.id,
        `ls -la "${path}" 2>/dev/null | tail -n +2`
      )

      if (result.code !== 0) {
        setError('디렉토리를 읽을 수 없습니다.')
        setEntries([])
        return
      }

      // 파싱
      const lines = result.stdout.trim().split('\n').filter(Boolean)
      const parsed: DirEntry[] = []

      for (const line of lines) {
        // drwxr-xr-x 2 user group 4096 Jan 28 10:00 dirname
        const parts = line.split(/\s+/)
        if (parts.length >= 9) {
          const perms = parts[0]
          const name = parts.slice(8).join(' ')
          
          // . 과 .. 제외, 숨김 파일 포함
          if (name === '.') continue
          
          parsed.push({
            name,
            isDirectory: perms.startsWith('d'),
            size: parseInt(parts[4]) || 0,
          })
        }
      }

      // 디렉토리 먼저, 그 다음 파일 (알파벳순)
      parsed.sort((a, b) => {
        if (a.name === '..') return -1
        if (b.name === '..') return 1
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      setEntries(parsed)
      setCurrentPath(path)
      setSelectedPath(null)
    } catch (err: any) {
      setError(err.message)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  // 경로 정규화 (이중 슬래시, 끝 슬래시 제거)
  const normalizePath = (path: string): string => {
    return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  }

  // 초기 로드
  useEffect(() => {
    if (isOpen && connectionStatus.connected) {
      const rawPath = activeProfile?.workspacePath || initialPath || '/home'
      const startPath = normalizePath(rawPath)
      loadDirectory(startPath)
    }
  }, [isOpen, connectionStatus.connected])

  if (!isOpen) return null

  const handleEntryClick = (entry: DirEntry) => {
    if (entry.isDirectory) {
      let newPath: string
      if (entry.name === '..') {
        // 상위 디렉토리
        const parts = currentPath.split('/').filter(Boolean)
        parts.pop()
        newPath = '/' + parts.join('/')
        if (!newPath) newPath = '/'
      } else {
        newPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`
      }
      loadDirectory(newPath)
    }
  }

  const handleEntryDoubleClick = (entry: DirEntry) => {
    if (entry.isDirectory && entry.name !== '..') {
      const fullPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`
      setSelectedPath(fullPath)
    }
  }

  const handleSelect = () => {
    if (selectedPath) {
      onSelect(selectedPath)
      onClose()
    } else {
      // 현재 폴더 선택
      onSelect(currentPath)
      onClose()
    }
  }

  const handlePathInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      loadDirectory((e.target as HTMLInputElement).value)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[600px] h-[500px] bg-ide-sidebar rounded-lg shadow-2xl border border-ide-border overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 bg-ide-bg border-b border-ide-border">
          <h2 className="text-lg font-semibold text-ide-text">📂 서버 프로젝트 폴더 선택</h2>
          <button onClick={onClose} className="text-ide-text-muted hover:text-ide-text">
            ✕
          </button>
        </div>

        {/* 경로 표시 */}
        <div className="px-4 py-2 bg-ide-bg border-b border-ide-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ide-text-muted">경로:</span>
            <input
              type="text"
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              onKeyDown={handlePathInput}
              className="flex-1 px-2 py-1 bg-ide-sidebar border border-ide-border rounded text-sm text-ide-text font-mono focus:border-ide-accent outline-none"
            />
            <button
              onClick={() => loadDirectory(currentPath)}
              className="px-2 py-1 bg-ide-hover border border-ide-border rounded text-xs text-ide-text hover:bg-ide-border"
            >
              이동
            </button>
          </div>
        </div>

        {/* 파일 목록 */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-ide-text-muted">
              로딩 중...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-ide-error">
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ide-text-muted">
              빈 디렉토리
            </div>
          ) : (
            <div className="p-2">
              {entries.map((entry, index) => {
                const fullPath = entry.name === '..'
                  ? null
                  : currentPath === '/'
                    ? `/${entry.name}`
                    : `${currentPath}/${entry.name}`
                const isSelected = fullPath === selectedPath

                return (
                  <div
                    key={index}
                    onClick={() => handleEntryClick(entry)}
                    onDoubleClick={() => handleEntryDoubleClick(entry)}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer
                      ${isSelected ? 'bg-ide-active' : 'hover:bg-ide-hover'}
                    `}
                  >
                    <span className="text-base">
                      {entry.isDirectory ? (entry.name === '..' ? '⬆️' : '📁') : '📄'}
                    </span>
                    <span className={`text-sm flex-1 ${entry.isDirectory ? 'text-ide-text' : 'text-ide-text-muted'}`}>
                      {entry.name}
                    </span>
                    {!entry.isDirectory && entry.size !== undefined && (
                      <span className="text-xs text-ide-text-muted">
                        {formatSize(entry.size)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 선택된 경로 */}
        {selectedPath && (
          <div className="px-4 py-2 bg-ide-success/10 border-t border-ide-border">
            <span className="text-xs text-ide-success">
              선택됨: <span className="font-mono">{selectedPath}</span>
            </span>
          </div>
        )}

        {/* 푸터 버튼 */}
        <div className="flex items-center justify-between px-4 py-3 bg-ide-bg border-t border-ide-border">
          <div className="text-xs text-ide-text-muted">
            더블클릭으로 폴더 선택, 클릭으로 이동
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-ide-hover border border-ide-border rounded text-ide-text hover:bg-ide-border transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSelect}
              className="px-4 py-2 text-sm bg-ide-accent text-white rounded hover:bg-ide-accent/80 transition-colors"
            >
              {selectedPath ? '선택한 폴더 열기' : '현재 폴더 열기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
