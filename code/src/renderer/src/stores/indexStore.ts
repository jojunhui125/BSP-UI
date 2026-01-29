/**
 * 프로젝트 인덱스 스토어 (v2 - SQLite + FTS5 기반)
 * 
 * 핵심 변경사항:
 * - SQLite + FTS5 전문 검색 (밀리초 응답)
 * - 증분 인덱싱 (변경된 파일만)
 * - LRU 캐시 (반복 검색 즉시 응답)
 * - Worker Threads (UI 반응성 유지)
 */

import { create } from 'zustand'

// 파일 정보
export interface FileIndex {
  path: string
  name: string
  type: 'recipe' | 'header' | 'dts' | 'config' | 'source' | 'other'
  size?: number
}

// 심볼/매크로 인덱스
export interface SymbolIndex {
  name: string
  type: 'define' | 'function' | 'variable' | 'node' | 'label'
  file: string
  line: number
  value?: string
}

// Include 관계
export interface IncludeRelation {
  from: string
  to: string
  type: 'require' | 'include' | 'inherit' | '#include'
  line: number
}

// 인덱싱 진행 상태
export interface IndexProgress {
  phase: 'init' | 'files' | 'symbols' | 'includes' | 'dt' | 'gpio' | 'done' | 'error'
  current: number
  total: number
  message: string
  speed?: number  // files/sec
}

// 인덱스 통계
export interface IndexStats {
  files: number
  symbols: number
  includes: number
  dtNodes: number
  gpioPins: number
  lastIndexTime: string | null
}

interface IndexState {
  // 상태
  isIndexing: boolean
  indexProgress: IndexProgress
  stats: IndexStats | null
  projectPath: string | null
  pythonAvailable: boolean
  
  // 레거시 호환용 (기존 뷰어 지원)
  files: FileIndex[]
  symbols: Map<string, SymbolIndex[]>
  includes: IncludeRelation[]
  reverseIncludes: Map<string, string[]>
  lastIndexTime: number | null
  
  // 액션
  startIndexing: (projectPath: string, serverId: string, fullReindex?: boolean) => Promise<void>
  cancelIndexing: () => Promise<void>
  clearIndex: () => Promise<void>
  refreshStats: () => Promise<void>
  
  // 🚀 서버 측 인덱싱 (핵폭탄급 성능!)
  startServerSideIndexing: (projectPath: string, serverId: string) => Promise<void>
  checkPython: (serverId: string) => Promise<boolean>
  
  // 검색 (SQLite FTS5 기반 - 밀리초 응답)
  searchSymbol: (query: string, limit?: number) => Promise<SymbolIndex[]>
  findDefinition: (symbol: string) => Promise<SymbolIndex | null>
  findReferences: (symbol: string) => Promise<SymbolIndex[]>
  getFilesIncluding: (filePath: string) => string[]  // 레거시 호환
  getIncludedFiles: (filePath: string) => IncludeRelation[]  // 레거시 호환
  
  // 내부
  _setupProgressListener: () => () => void
}

export const useIndexStore = create<IndexState>((set, get) => ({
  // 상태 초기값
  isIndexing: false,
  indexProgress: { phase: 'init', current: 0, total: 0, message: '' },
  stats: null,
  projectPath: null,
  pythonAvailable: false,
  
  // 레거시 호환용
  files: [],
  symbols: new Map(),
  includes: [],
  reverseIncludes: new Map(),
  lastIndexTime: null,
  
  /**
   * 인덱싱 시작 (SQLite + FTS5)
   */
  startIndexing: async (projectPath: string, serverId: string, fullReindex: boolean = false) => {
    // 이미 인덱싱 중이면 현재 상태 유지 (중복 호출 방지)
    if (get().isIndexing) {
      console.log('[IndexStore] Already indexing, skipping duplicate call')
      return
    }
    
    set({ 
      isIndexing: true, 
      projectPath,
      indexProgress: { phase: 'init', current: 0, total: 0, message: '인덱싱 시작...' }
    })
    
    const startTime = Date.now()
    
    // 진행률 리스너 설정 (await 전에 설정해야 이벤트를 놓치지 않음)
    const unsubscribe = get()._setupProgressListener()
    
    try {
      // SQLite 인덱싱 시작
      const success = await window.electronAPI.index.startIndex(projectPath, serverId, fullReindex)
      
      if (success) {
        // 통계 갱신
        await get().refreshStats()
        
        const elapsed = Date.now() - startTime
        set({
          isIndexing: false,
          lastIndexTime: elapsed,
          indexProgress: { 
            phase: 'done', 
            current: 0, 
            total: 0, 
            message: `완료! (${elapsed}ms)` 
          }
        })
        
        console.log(`[IndexStore] Indexing completed in ${elapsed}ms`)
      } else {
        // 백엔드에서 이미 인덱싱 중일 수 있음 - 상태 확인
        const status = await window.electronAPI.index.getStatus()
        if (status.isIndexing) {
          // 이미 진행 중이면 리스너만 유지하고 대기
          console.log('[IndexStore] Backend already indexing, waiting...')
          set({ 
            isIndexing: true,
            indexProgress: { phase: 'files', current: 0, total: 0, message: '인덱싱 진행 중...' }
          })
          return  // 리스너는 해제하지 않음
        } else {
          throw new Error('Indexing failed')
        }
      }
      
    } catch (err: any) {
      console.error('[IndexStore] Indexing failed:', err)
      set({
        isIndexing: false,
        indexProgress: { 
          phase: 'error', 
          current: 0, 
          total: 0, 
          message: err.message || '인덱싱 실패' 
        }
      })
    } finally {
      // 정상 완료 또는 에러 시에만 리스너 해제
      if (!get().isIndexing) {
        unsubscribe()
      }
    }
  },
  
  /**
   * 인덱싱 취소
   */
  cancelIndexing: async () => {
    await window.electronAPI.index.cancelIndex()
    set({ 
      isIndexing: false,
      indexProgress: { phase: 'init', current: 0, total: 0, message: '취소됨' }
    })
  },
  
  /**
   * 인덱스 초기화
   */
  clearIndex: async () => {
    await window.electronAPI.index.clearIndex()
    set({
      stats: null,
      files: [],
      symbols: new Map(),
      includes: [],
      reverseIncludes: new Map(),
      lastIndexTime: null,
    })
  },
  
  /**
   * 통계 갱신
   */
  refreshStats: async () => {
    const stats = await window.electronAPI.index.getStats()
    set({ stats })
  },

  /**
   * 🚀 서버 측 인덱싱 (핵폭탄급 성능!)
   * Python 스크립트를 서버에서 직접 실행하여 초고속 인덱싱
   * 10,000개 파일 기준: ~30초 (vs SSH 개별 읽기 ~10분)
   */
  startServerSideIndexing: async (projectPath: string, serverId: string) => {
    if (get().isIndexing) {
      console.log('[IndexStore] Already indexing, skipping')
      return
    }

    set({
      isIndexing: true,
      projectPath,
      indexProgress: { phase: 'init', current: 0, total: 0, message: '🚀 서버 측 인덱싱 준비 중...' }
    })

    const startTime = Date.now()
    const unsubscribe = get()._setupProgressListener()

    try {
      const success = await window.electronAPI.index.serverSideIndex(projectPath, serverId)

      if (success) {
        await get().refreshStats()
        const elapsed = Date.now() - startTime

        set({
          isIndexing: false,
          lastIndexTime: elapsed,
          indexProgress: {
            phase: 'done',
            current: 0,
            total: 0,
            message: `🎉 완료! (${(elapsed / 1000).toFixed(1)}초)`
          }
        })

        console.log(`[IndexStore] Server-side indexing completed in ${elapsed}ms`)
      } else {
        throw new Error('Server-side indexing failed')
      }

    } catch (err: any) {
      console.error('[IndexStore] Server-side indexing failed:', err)
      set({
        isIndexing: false,
        indexProgress: {
          phase: 'error',
          current: 0,
          total: 0,
          message: err.message || '서버 측 인덱싱 실패'
        }
      })
    } finally {
      if (!get().isIndexing) {
        unsubscribe()
      }
    }
  },

  /**
   * Python 사용 가능 여부 확인
   */
  checkPython: async (serverId: string): Promise<boolean> => {
    const result = await window.electronAPI.index.checkPython(serverId)
    set({ pythonAvailable: result.available })
    return result.available
  },
  
  /**
   * 심볼 검색 (FTS5 전문 검색 - 밀리초 응답!)
   */
  searchSymbol: async (query: string, limit: number = 50): Promise<SymbolIndex[]> => {
    if (!query.trim()) return []
    
    const results = await window.electronAPI.lsp.searchSymbols(query, limit)
    
    return results.map(r => ({
      name: r.name,
      type: r.type as SymbolIndex['type'],
      file: r.file_path,
      line: r.line,
      value: r.value,
    }))
  },
  
  /**
   * 정의 찾기 (캐시 + DB - 밀리초 응답!)
   */
  findDefinition: async (symbol: string): Promise<SymbolIndex | null> => {
    const result = await window.electronAPI.lsp.findDefinition(symbol)
    
    if (!result) return null
    
    return {
      name: result.name,
      type: result.type as SymbolIndex['type'],
      file: result.file_path,
      line: result.line,
      value: result.value,
    }
  },
  
  /**
   * 참조 찾기 (FTS5 검색)
   */
  findReferences: async (symbol: string): Promise<SymbolIndex[]> => {
    const results = await window.electronAPI.lsp.searchSymbols(symbol, 100)
    
    return results.map(r => ({
      name: r.name,
      type: r.type as SymbolIndex['type'],
      file: r.file_path,
      line: r.line,
      value: r.value,
    }))
  },
  
  /**
   * 이 파일을 include하는 파일들 (레거시 호환)
   */
  getFilesIncluding: (filePath: string): string[] => {
    const { reverseIncludes } = get()
    const fileName = filePath.split('/').pop() || ''
    
    const byPath = reverseIncludes.get(filePath) || []
    const byName = reverseIncludes.get(fileName) || []
    
    return [...new Set([...byPath, ...byName])]
  },
  
  /**
   * 이 파일이 include하는 파일들 (레거시 호환)
   */
  getIncludedFiles: (filePath: string): IncludeRelation[] => {
    const { includes } = get()
    return includes.filter(inc => inc.from === filePath)
  },
  
  /**
   * 진행률 리스너 설정
   */
  _setupProgressListener: () => {
    return window.electronAPI.index.onProgress((progress) => {
      set({
        indexProgress: {
          phase: progress.phase as IndexProgress['phase'],
          current: progress.current,
          total: progress.total,
          message: progress.message,
          speed: progress.speed,
        }
      })
    })
  },
}))

// 파일 타입 판단 (유틸리티)
export function getFileType(name: string): FileIndex['type'] {
  if (name.endsWith('.bb') || name.endsWith('.bbappend') || name.endsWith('.inc')) return 'recipe'
  if (name.endsWith('.h')) return 'header'
  if (name.endsWith('.dts') || name.endsWith('.dtsi')) return 'dts'
  if (name.endsWith('.conf')) return 'config'
  if (name.endsWith('.c') || name.endsWith('.cpp')) return 'source'
  return 'other'
}
