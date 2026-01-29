/**
 * 에디터/파일 상태 스토어
 * 열린 파일, 탭 관리, 파일 내용 캐시
 */

import { create } from 'zustand'

export interface OpenFile {
  id: string
  path: string
  name: string
  content: string
  language: string
  isDirty: boolean
  isLoading: boolean
  serverId: string
}

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  isExpanded?: boolean
  isLoading?: boolean
  children?: FileTreeNode[]
  size?: number
  permissions?: string
}

interface EditorState {
  // 파일 탭
  openFiles: OpenFile[]
  activeFileId: string | null
  
  // 파일 트리
  fileTree: FileTreeNode[]
  fileTreeRoot: string
  fileTreeLoading: boolean
  
  // 검색
  searchQuery: string
  searchResults: string[]
  
  // Go to Line (파일별 이동할 라인 번호)
  gotoLine: Record<string, number>

  // 액션 - 파일 탭
  openFile: (file: Omit<OpenFile, 'id' | 'language'> & { language?: string }) => void
  closeFile: (fileId: string) => void
  setActiveFile: (fileId: string) => void
  updateFileContent: (fileId: string, content: string) => void
  markFileSaved: (fileId: string) => void
  
  // 액션 - 파일 트리
  setFileTree: (tree: FileTreeNode[], root: string) => void
  setFileTreeLoading: (loading: boolean) => void
  toggleDirectory: (path: string) => void
  updateDirectoryChildren: (path: string, children: FileTreeNode[]) => void
  
  // 액션 - 검색
  setSearchQuery: (query: string) => void
  setSearchResults: (results: string[]) => void
  
  // 액션 - 디렉토리 이동
  navigateToDirectory: (dirPath: string) => void
  expandPathToDirectory: (dirPath: string) => void
  
  // 액션 - Go to Line
  setGotoLine: (filePath: string, line: number) => void
}

// 파일 확장자로 언어 감지
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const languageMap: Record<string, string> = {
    // Yocto/BitBake
    'bb': 'bitbake',
    'bbappend': 'bitbake',
    'bbclass': 'bitbake',
    'inc': 'bitbake',
    'conf': 'ini',
    
    // Device Tree
    'dts': 'dts',
    'dtsi': 'dts',
    
    // Scripts
    'sh': 'shell',
    'bash': 'shell',
    'py': 'python',
    'pl': 'perl',
    
    // C/C++
    'c': 'c',
    'h': 'c',
    'cpp': 'cpp',
    'hpp': 'cpp',
    'cc': 'cpp',
    
    // Config
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'toml': 'toml',
    
    // Kernel
    'config': 'ini',
    'defconfig': 'ini',
    'Kconfig': 'kconfig',
    
    // Web
    'html': 'html',
    'css': 'css',
    'js': 'javascript',
    'ts': 'typescript',
    
    // Docs
    'md': 'markdown',
    'txt': 'plaintext',
    'rst': 'restructuredtext',
    
    // Patch
    'patch': 'diff',
    'diff': 'diff',
    
    // Makefile
    'mk': 'makefile',
  }
  
  // 특수 파일명
  if (filename === 'Makefile' || filename === 'makefile') return 'makefile'
  if (filename === 'Kconfig') return 'kconfig'
  if (filename === 'Dockerfile') return 'dockerfile'
  if (filename.startsWith('.config')) return 'ini'
  
  return languageMap[ext] || 'plaintext'
}

// 고유 ID 생성
const generateFileId = (path: string, serverId: string) => 
  `${serverId}:${path}`.replace(/[^a-zA-Z0-9]/g, '_')

export const useEditorStore = create<EditorState>()((set, get) => ({
  // 초기 상태
  openFiles: [],
  activeFileId: null,
  fileTree: [],
  fileTreeRoot: '',
  fileTreeLoading: false,
  searchQuery: '',
  searchResults: [],
  gotoLine: {},

  // 파일 열기
  openFile: (file) => {
    const id = generateFileId(file.path, file.serverId)
    const { openFiles } = get()
    
    // 이미 열려있는지 확인
    const existing = openFiles.find(f => f.id === id)
    if (existing) {
      set({ activeFileId: id })
      return
    }
    
    const newFile: OpenFile = {
      ...file,
      id,
      language: detectLanguage(file.name),
    }
    
    set({
      openFiles: [...openFiles, newFile],
      activeFileId: id,
    })
  },

  // 파일 닫기
  closeFile: (fileId) => {
    const { openFiles, activeFileId } = get()
    const newFiles = openFiles.filter(f => f.id !== fileId)
    
    let newActiveId = activeFileId
    if (activeFileId === fileId) {
      // 닫힌 파일이 활성 파일이면 다른 파일 선택
      const index = openFiles.findIndex(f => f.id === fileId)
      if (newFiles.length > 0) {
        newActiveId = newFiles[Math.min(index, newFiles.length - 1)].id
      } else {
        newActiveId = null
      }
    }
    
    set({
      openFiles: newFiles,
      activeFileId: newActiveId,
    })
  },

  // 활성 파일 설정
  setActiveFile: (fileId) => {
    set({ activeFileId: fileId })
  },

  // 파일 내용 업데이트
  updateFileContent: (fileId, content) => {
    set({
      openFiles: get().openFiles.map(f =>
        f.id === fileId ? { ...f, content, isDirty: true } : f
      ),
    })
  },

  // 파일 저장됨 표시
  markFileSaved: (fileId) => {
    set({
      openFiles: get().openFiles.map(f =>
        f.id === fileId ? { ...f, isDirty: false } : f
      ),
    })
  },

  // 파일 트리 설정
  setFileTree: (tree, root) => {
    set({ fileTree: tree, fileTreeRoot: root })
  },

  // 파일 트리 로딩 상태
  setFileTreeLoading: (loading) => {
    set({ fileTreeLoading: loading })
  },

  // 디렉토리 토글
  toggleDirectory: (path) => {
    const toggleNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
      return nodes.map(node => {
        if (node.path === path && node.isDirectory) {
          return { ...node, isExpanded: !node.isExpanded }
        }
        if (node.children) {
          return { ...node, children: toggleNode(node.children) }
        }
        return node
      })
    }
    
    set({ fileTree: toggleNode(get().fileTree) })
  },

  // 디렉토리 자식 업데이트
  updateDirectoryChildren: (path, children) => {
    const updateNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
      return nodes.map(node => {
        if (node.path === path && node.isDirectory) {
          return { ...node, children, isLoading: false, isExpanded: true }
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) }
        }
        return node
      })
    }
    
    set({ fileTree: updateNode(get().fileTree) })
  },

  // 검색 쿼리 설정
  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },

  // 검색 결과 설정
  setSearchResults: (results) => {
    set({ searchResults: results })
  },

  // 디렉토리로 이동 (트리 루트 변경)
  navigateToDirectory: (dirPath) => {
    set({ 
      fileTreeRoot: dirPath,
      fileTree: [],  // 트리 초기화 (다시 로드 필요)
      fileTreeLoading: true
    })
  },

  // 특정 경로까지 트리 펼치기
  expandPathToDirectory: (dirPath) => {
    const { fileTree, fileTreeRoot } = get()
    
    // 루트 경로로부터 상대 경로 계산
    if (!dirPath.startsWith(fileTreeRoot)) {
      // 루트 밖의 경로면 navigateToDirectory 사용
      return
    }
    
    const relativePath = dirPath.slice(fileTreeRoot.length)
    const pathParts = relativePath.split('/').filter(Boolean)
    
    // 각 경로 부분을 펼침
    const expandNode = (nodes: FileTreeNode[], depth: number): FileTreeNode[] => {
      if (depth >= pathParts.length) return nodes
      
      const targetName = pathParts[depth]
      return nodes.map(node => {
        if (node.isDirectory && node.name === targetName) {
          return {
            ...node,
            isExpanded: true,
            children: node.children ? expandNode(node.children, depth + 1) : []
          }
        }
        return node
      })
    }
    
    set({ fileTree: expandNode(fileTree, 0) })
  },

  // Go to Line 설정 (파일 열기 후 특정 라인으로 이동)
  setGotoLine: (filePath, line) => {
    set({
      gotoLine: {
        ...get().gotoLine,
        [filePath]: line
      }
    })
  },
}))
