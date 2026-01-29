/**
 * 서버 파일 탐색기
 * SSH를 통해 서버의 파일/폴더를 트리 구조로 표시
 */

import { useState, useEffect, useCallback } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useSshStore } from '../../stores/sshStore'
import { useEditorStore, FileTreeNode } from '../../stores/editorStore'

// 파일 확장자별 아이콘 매핑
const FILE_ICONS: Record<string, string> = {
  // Yocto/BitBake
  'bb': '📦',
  'bbappend': '📎',
  'bbclass': '🔷',
  'inc': '📄',
  'conf': '⚙️',
  
  // Device Tree
  'dts': '🌳',
  'dtsi': '🌿',
  
  // Scripts
  'sh': '💻',
  'py': '🐍',
  'pl': '🐪',
  
  // C/C++
  'c': '🔵',
  'h': '🔹',
  'cpp': '🟦',
  'hpp': '🔹',
  
  // Kernel
  'config': '🔧',
  'defconfig': '🔧',
  
  // Patch
  'patch': '🩹',
  'diff': '🩹',
  
  // Docs
  'md': '📝',
  'txt': '📄',
  'rst': '📑',
  
  // Config
  'json': '📋',
  'yaml': '📋',
  'yml': '📋',
  'xml': '📰',
  
  // Makefile
  'mk': '🔨',
  'Makefile': '🔨',
}

function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return ''  // 디렉토리 아이콘은 별도 처리
  
  // 특수 파일명
  if (name === 'Makefile' || name === 'makefile') return '🔨'
  if (name === 'Kconfig') return '⚙️'
  if (name === 'README' || name.startsWith('README.')) return '📖'
  if (name === 'LICENSE') return '📜'
  if (name.startsWith('.config')) return '🔧'
  
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || '📄'
}

export function ServerFileExplorer() {
  const { serverProject } = useProjectStore()
  const { activeProfile, connectionStatus } = useSshStore()
  const { 
    fileTree, 
    fileTreeRoot, 
    fileTreeLoading,
    setFileTree, 
    setFileTreeLoading,
    toggleDirectory,
    updateDirectoryChildren,
    openFile,
  } = useEditorStore()
  
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)

  // 디렉토리 내용 로드
  const loadDirectory = useCallback(async (path: string): Promise<FileTreeNode[]> => {
    if (!activeProfile || !connectionStatus.connected) return []

    try {
      // ls -la로 상세 정보 가져오기
      const result = await window.electronAPI.ssh.exec(
        activeProfile.id,
        `ls -la "${path}" 2>/dev/null | tail -n +2`
      )

      if (result.code !== 0) return []

      const lines = result.stdout.trim().split('\n').filter(Boolean)
      const nodes: FileTreeNode[] = []

      for (const line of lines) {
        const parts = line.split(/\s+/)
        if (parts.length >= 9) {
          const perms = parts[0]
          const size = parseInt(parts[4]) || 0
          const name = parts.slice(8).join(' ')
          
          // . 제외, .. 은 상위로 가는 용도로 제외
          if (name === '.' || name === '..') continue
          
          const isDirectory = perms.startsWith('d')
          const fullPath = path === '/' ? `/${name}` : `${path}/${name}`
          
          nodes.push({
            name,
            path: fullPath,
            isDirectory,
            size: isDirectory ? undefined : size,
            permissions: perms,
            isExpanded: false,
            children: isDirectory ? [] : undefined,
          })
        }
      }

      // 정렬: 디렉토리 먼저, 그 다음 이름순
      nodes.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      return nodes
    } catch (err: any) {
      console.error('Failed to load directory:', err)
      return []
    }
  }, [activeProfile, connectionStatus.connected])

  // 초기 로드
  useEffect(() => {
    const loadRoot = async () => {
      if (!serverProject || !connectionStatus.connected) {
        setFileTree([], '')
        return
      }

      setFileTreeLoading(true)
      setError(null)

      try {
        const nodes = await loadDirectory(serverProject.path)
        setFileTree(nodes, serverProject.path)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setFileTreeLoading(false)
      }
    }

    loadRoot()
  }, [serverProject?.path, connectionStatus.connected, loadDirectory, setFileTree, setFileTreeLoading])

  // 디렉토리 클릭 핸들러
  const handleDirectoryClick = async (node: FileTreeNode) => {
    if (!node.isDirectory) return

    // 이미 자식이 로드되어 있으면 토글만
    if (node.children && node.children.length > 0) {
      toggleDirectory(node.path)
      return
    }

    // 자식 로드
    const children = await loadDirectory(node.path)
    updateDirectoryChildren(node.path, children)
  }

  // 파일 클릭 핸들러
  const handleFileClick = async (node: FileTreeNode) => {
    if (node.isDirectory) {
      handleDirectoryClick(node)
      return
    }

    if (!activeProfile) return

    // 파일 내용 로드
    try {
      const content = await window.electronAPI.ssh.readFile(activeProfile.id, node.path)
      
      openFile({
        path: node.path,
        name: node.name,
        content,
        isDirty: false,
        isLoading: false,
        serverId: activeProfile.id,
      })
    } catch (err: any) {
      console.error('Failed to open file:', err)
    }
  }

  // 경로로 파일/디렉토리 열기 (디렉토리면 이동, 파일이면 열기)
  const openFilePath = async (filePath: string) => {
    if (!activeProfile) return
    
    setError(null)  // 이전 에러 초기화

    try {
      // 먼저 경로가 디렉토리인지 파일인지 확인
      const checkResult = await window.electronAPI.ssh.exec(
        activeProfile.id,
        `test -d "${filePath}" && echo "dir" || (test -f "${filePath}" && echo "file" || echo "notfound")`
      )
      
      const pathType = checkResult.stdout.trim()
      
      if (pathType === 'dir') {
        // 디렉토리면 해당 디렉토리로 이동
        await navigateToPath(filePath)
        setSearchQuery('')
        setShowSearchResults(false)
      } else if (pathType === 'file') {
        // 파일이면 파일 열기
        const content = await window.electronAPI.ssh.readFile(activeProfile.id, filePath)
        const name = filePath.split('/').pop() || filePath
        
        openFile({
          path: filePath,
          name,
          content,
          isDirty: false,
          isLoading: false,
          serverId: activeProfile.id,
        })
        
        setSearchQuery('')
        setShowSearchResults(false)
      } else {
        // 경로가 존재하지 않음 - 에러는 표시하지만 입력창은 유지
        setError(`경로를 찾을 수 없습니다: ${filePath}`)
        // 입력창은 초기화하지 않음 (사용자가 수정할 수 있도록)
      }
    } catch (err: any) {
      console.error('Failed to open path:', err)
      setError(`경로를 열 수 없습니다: ${filePath}`)
      // 입력창은 초기화하지 않음
    }
  }

  // 특정 디렉토리로 이동 (파일 트리 업데이트)
  const navigateToPath = async (dirPath: string) => {
    if (!activeProfile) return
    
    setFileTreeLoading(true)
    
    try {
      const nodes = await loadDirectory(dirPath)
      setFileTree(nodes, dirPath)
    } catch (err: any) {
      console.error('Failed to navigate:', err)
      setError(`디렉토리를 열 수 없습니다: ${dirPath}`)
    } finally {
      setFileTreeLoading(false)
    }
  }

  // 서버에서 파일/디렉토리 검색 (find 명령)
  const searchFilesOnServer = async (query: string) => {
    if (!activeProfile || !serverProject || query.length < 2) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }

    setIsSearching(true)
    setShowSearchResults(true)

    try {
      let searchPaths: string[] = []
      
      // 경로가 /로 시작하면 두 가지 검색:
      // 1. 해당 경로가 실제로 존재하는지
      // 2. 프로젝트 내에서 해당 이름을 가진 디렉토리/파일 검색
      if (query.startsWith('/')) {
        // 절대 경로 존재 확인
        const existsResult = await window.electronAPI.ssh.exec(
          activeProfile.id,
          `test -e "${query}" && echo "exists"`
        )
        if (existsResult.stdout.trim() === 'exists') {
          searchPaths.push(query)
        }
        
        // 프로젝트 내에서도 검색 (이름 기준)
        const searchName = query.split('/').pop() || query.slice(1)
        if (searchName) {
          const findResult = await window.electronAPI.ssh.exec(
            activeProfile.id,
            `find "${serverProject.path}" \\( -type d -o -type f \\) -name "*${searchName}*" 2>/dev/null | grep -v "/tmp/work/" | grep -v "/tmp/deploy/" | grep -v "/tmp/stamps/" | grep -v "/sstate-cache/" | head -20`
          )
          if (findResult.code === 0 && findResult.stdout.trim()) {
            const found = findResult.stdout.trim().split('\n').filter(Boolean)
            searchPaths.push(...found)
          }
        }
        
        // 중복 제거
        searchPaths = [...new Set(searchPaths)]
        setSearchResults(searchPaths)
        setIsSearching(false)
        return
      }

      // 일반 검색: 파일 및 디렉토리 검색 (최대 30개, 디렉토리 우선)
      const result = await window.electronAPI.ssh.exec(
        activeProfile.id,
        `(find "${serverProject.path}" -type d -name "*${query}*" 2>/dev/null | head -15; find "${serverProject.path}" -type f -name "*${query}*" 2>/dev/null | head -15) | grep -v "/tmp/work/" | grep -v "/tmp/deploy/" | grep -v "/tmp/stamps/" | grep -v "/sstate-cache/" | head -30`
      )

      if (result.code === 0 && result.stdout.trim()) {
        const paths = result.stdout.trim().split('\n').filter(Boolean)
        // 중복 제거
        const uniquePaths = [...new Set(paths)]
        setSearchResults(uniquePaths)
      } else {
        setSearchResults([])
      }
    } catch (err) {
      console.error('Search failed:', err)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // 검색 입력 핸들러
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    
    // 디바운스 검색
    if (value.length >= 2) {
      const timer = setTimeout(() => searchFilesOnServer(value), 300)
      return () => clearTimeout(timer)
    } else {
      setShowSearchResults(false)
      setSearchResults([])
    }
  }

  // Enter 키로 바로 열기
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery) {
      // 경로면 바로 열기, 검색결과 있으면 첫번째 열기
      if (searchQuery.startsWith('/')) {
        openFilePath(searchQuery)
      } else if (searchResults.length > 0) {
        openFilePath(searchResults[0])
      }
    } else if (e.key === 'Escape') {
      setShowSearchResults(false)
      setSearchQuery('')
    }
  }

  // 연결 안됨
  if (!connectionStatus.connected || !serverProject) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-ide-text-muted">서버에 연결되지 않았습니다</p>
        <p className="text-xs text-ide-text-muted mt-1">서버 연결 후 프로젝트를 열어주세요</p>
      </div>
    )
  }

  // 로딩 중
  if (fileTreeLoading) {
    return (
      <div className="p-4 text-center">
        <div className="inline-block w-5 h-5 border-2 border-ide-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-ide-text-muted mt-2">파일 목록 로딩 중...</p>
      </div>
    )
  }

  // 파일 필터링
  const filterNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    if (!searchQuery) return nodes
    
    const query = searchQuery.toLowerCase()
    return nodes.filter(node => {
      if (node.name.toLowerCase().includes(query)) return true
      if (node.children) {
        const filteredChildren = filterNodes(node.children)
        return filteredChildren.length > 0
      }
      return false
    })
  }

  const filteredTree = filterNodes(fileTree)

  return (
    <div className="flex flex-col h-full">
      {/* 검색 - 경로 직접 입력 또는 파일명 검색 */}
      <div className="p-2 border-b border-ide-border relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            handleSearchChange(e)
            setError(null)  // 입력 시 에러 초기화
          }}
          onKeyDown={handleSearchKeyDown}
          onFocus={() => searchQuery.length >= 2 && setShowSearchResults(true)}
          placeholder="🔍 경로 입력 (예: /tmp) 또는 파일명 검색..."
          className={`w-full px-2 py-1 bg-ide-bg border rounded text-xs text-ide-text focus:border-ide-accent outline-none font-mono ${error ? 'border-ide-error' : 'border-ide-border'}`}
        />
        
        {/* 에러 메시지 (입력창 아래에 표시) */}
        {error && (
          <div className="mt-1 p-1.5 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-xs text-ide-error">{error}</p>
            <p className="text-[10px] text-ide-text-muted mt-0.5">경로를 수정하고 Enter를 다시 눌러주세요</p>
          </div>
        )}
        
        {/* 검색 결과 드롭다운 */}
        {showSearchResults && (
          <div className="absolute left-2 right-2 top-full mt-1 bg-ide-sidebar border border-ide-border rounded shadow-lg z-50 max-h-60 overflow-auto">
            {isSearching ? (
              <div className="p-2 text-xs text-ide-text-muted text-center">
                🔍 검색 중...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-2 text-xs text-ide-text-muted text-center">
                검색 결과가 없습니다
              </div>
            ) : (
              <div>
                <div className="px-2 py-1 text-xs text-ide-text-muted border-b border-ide-border">
                  검색 결과 ({searchResults.length}개) - 클릭하여 열기/이동
                </div>
                {searchResults.map((filePath, index) => {
                  const name = filePath.split('/').pop() || filePath
                  const parentPath = filePath.replace(serverProject?.path || '', '').slice(0, -name.length - 1) || '/'
                  
                  return (
                    <button
                      key={index}
                      onClick={() => openFilePath(filePath)}
                      className="w-full text-left px-2 py-1.5 text-xs font-mono hover:bg-ide-hover border-b border-ide-border last:border-b-0 flex items-center gap-1"
                    >
                      <span className="text-ide-accent">{name}</span>
                      <span className="text-ide-text-muted text-[10px] truncate flex-1">
                        {parentPath}
                      </span>
                    </button>
                  )
                })}
                <div className="px-2 py-1 text-[10px] text-ide-text-muted bg-ide-bg">
                  💡 디렉토리 클릭 → 이동 | 파일 클릭 → 열기
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 현재 경로 + 상위 이동 버튼 */}
      <div className="px-2 py-1 bg-ide-bg border-b border-ide-border flex items-center gap-2">
        {/* 상위 디렉토리 이동 버튼 */}
        <button
          onClick={() => {
            if (fileTreeRoot && fileTreeRoot !== '/') {
              const parentPath = fileTreeRoot.split('/').slice(0, -1).join('/') || '/'
              navigateToPath(parentPath)
            }
          }}
          disabled={!fileTreeRoot || fileTreeRoot === '/'}
          className="px-1.5 py-0.5 text-xs bg-ide-hover rounded hover:bg-ide-accent disabled:opacity-30 disabled:cursor-not-allowed"
          title="상위 디렉토리로 이동"
        >
          ⬆️ ..
        </button>
        <p className="text-xs text-ide-text-muted font-mono truncate flex-1" title={fileTreeRoot}>
          📂 {fileTreeRoot}
        </p>
      </div>

      {/* 파일 트리 - 가로/세로 스크롤 지원 */}
      <div className="flex-1 overflow-auto">
        {filteredTree.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-ide-text-muted">
              {searchQuery ? '검색 결과가 없습니다' : '파일이 없습니다'}
            </p>
          </div>
        ) : (
          <div className="min-w-max">
            <TreeNodeList 
              nodes={filteredTree} 
              level={0} 
              onFileClick={handleFileClick}
              onDirectoryClick={handleDirectoryClick}
              onDirectoryDoubleClick={(node) => navigateToPath(node.path)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// 트리 노드 리스트
interface TreeNodeListProps {
  nodes: FileTreeNode[]
  level: number
  onFileClick: (node: FileTreeNode) => void
  onDirectoryClick: (node: FileTreeNode) => void
  onDirectoryDoubleClick: (node: FileTreeNode) => void
}

function TreeNodeList({ nodes, level, onFileClick, onDirectoryClick, onDirectoryDoubleClick }: TreeNodeListProps) {
  return (
    <div>
      {nodes.map((node) => (
        <TreeNodeItem
          key={node.path}
          node={node}
          level={level}
          onFileClick={onFileClick}
          onDirectoryClick={onDirectoryClick}
          onDirectoryDoubleClick={onDirectoryDoubleClick}
        />
      ))}
    </div>
  )
}

// 트리 노드 아이템
interface TreeNodeItemProps {
  node: FileTreeNode
  level: number
  onFileClick: (node: FileTreeNode) => void
  onDirectoryClick: (node: FileTreeNode) => void
  onDirectoryDoubleClick: (node: FileTreeNode) => void
}

function TreeNodeItem({ node, level, onFileClick, onDirectoryClick, onDirectoryDoubleClick }: TreeNodeItemProps) {
  // 싱글클릭: 디렉토리 확장/축소, 파일 열기
  const handleClick = () => {
    if (node.isDirectory) {
      onDirectoryClick(node)
    } else {
      onFileClick(node)
    }
  }
  
  // 더블클릭: 디렉토리면 해당 폴더로 이동
  const handleDoubleClick = () => {
    if (node.isDirectory) {
      onDirectoryDoubleClick(node)
    }
  }

  const icon = node.isDirectory
    ? (node.isExpanded ? '📂' : '📁')
    : getFileIcon(node.name, false)

  // 파일명 하이라이트 색상
  const getNameColor = () => {
    if (node.isDirectory) return 'text-ide-text'
    
    const ext = node.name.split('.').pop()?.toLowerCase() || ''
    
    // Yocto 파일들
    if (['bb', 'bbappend', 'bbclass', 'inc'].includes(ext)) return 'text-orange-400'
    // Device Tree
    if (['dts', 'dtsi'].includes(ext)) return 'text-green-400'
    // 설정 파일
    if (['conf', 'config', 'defconfig'].includes(ext)) return 'text-yellow-400'
    // 스크립트
    if (['sh', 'py'].includes(ext)) return 'text-blue-400'
    // 패치
    if (['patch', 'diff'].includes(ext)) return 'text-purple-400'
    // 숨김 파일
    if (node.name.startsWith('.')) return 'text-ide-text-muted'
    
    return 'text-ide-text'
  }

  return (
    <div>
      <button
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={`
          flex items-center text-left py-1 px-2 whitespace-nowrap
          hover:bg-ide-hover transition-colors
          ${node.isDirectory ? 'font-medium' : ''}
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        title={node.isDirectory ? '클릭: 펼치기/접기 | 더블클릭: 이동' : undefined}
      >
        {/* 확장/축소 아이콘 (디렉토리만) */}
        {node.isDirectory && (
          <span className="w-4 text-xs text-ide-text-muted mr-1 flex-shrink-0">
            {node.isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!node.isDirectory && <span className="w-4 mr-1 flex-shrink-0" />}
        
        {/* 파일/폴더 아이콘 */}
        <span className="mr-2 text-sm flex-shrink-0">{icon}</span>
        
        {/* 이름 - 잘리지 않음 */}
        <span className={`text-sm ${getNameColor()}`}>
          {node.name}
        </span>
        
        {/* 파일 크기 */}
        {!node.isDirectory && node.size !== undefined && (
          <span className="text-xs text-ide-text-muted ml-2 flex-shrink-0">
            {formatFileSize(node.size)}
          </span>
        )}
      </button>

      {/* 자식 노드 */}
      {node.isDirectory && node.isExpanded && node.children && (
        <TreeNodeList
          nodes={node.children}
          level={level + 1}
          onFileClick={onFileClick}
          onDirectoryClick={onDirectoryClick}
          onDirectoryDoubleClick={onDirectoryDoubleClick}
        />
      )}
    </div>
  )
}

// 파일 크기 포맷
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`
}
