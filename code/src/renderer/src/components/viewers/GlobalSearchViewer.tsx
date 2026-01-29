/**
 * 글로벌 검색 뷰어 (v3 - 경로 검색 + 디렉토리 이동 지원)
 * 
 * 핵심 기능:
 * - FTS5 전문 검색 (심볼, 매크로)
 * - 파일/디렉토리 경로 검색
 * - 검색 결과에서 디렉토리 이동
 * - 서버 검색 폴백 (find + grep)
 */

import { useState, useCallback, useEffect } from 'react'
import { useSshStore } from '../../stores/sshStore'
import { useProjectStore } from '../../stores/projectStore'
import { useEditorStore } from '../../stores/editorStore'
import { useIndexStore } from '../../stores/indexStore'

// 검색 결과 타입
interface SearchResult {
  file: string          // 파일 또는 디렉토리 경로
  line: number          // 파일의 경우 라인 번호
  column: number
  content: string       // 표시할 내용
  type: 'definition' | 'reference' | 'usage' | 'file' | 'directory'
  value?: string
  isDirectory?: boolean // 디렉토리 여부
}

// 검색 타입
type SearchType = 'all' | 'symbol' | 'path' | 'pin' | 'config' | 'define' | 'include'

export function GlobalSearchViewer() {
  const { activeProfile, connectionStatus } = useSshStore()
  const { serverProject } = useProjectStore()
  const { openFile, navigateToDirectory, setFileTree, setFileTreeLoading } = useEditorStore()
  const { searchSymbol, findDefinition, stats, isIndexing, indexProgress } = useIndexStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<SearchType>('all')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTime, setSearchTime] = useState<number | null>(null)
  const [searchSource, setSearchSource] = useState<'index' | 'server' | 'hybrid' | null>(null)

  // 인덱스에서 심볼 검색
  const searchFromIndex = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) return []
    
    const startTime = Date.now()
    
    try {
      const indexed = await searchSymbol(query, 100)
      
      const results: SearchResult[] = indexed.map(sym => ({
        file: sym.file,
        line: sym.line,
        column: 1,
        content: sym.type === 'define' 
          ? `#define ${sym.name} ${sym.value || ''}` 
          : `${sym.name} = ${sym.value || ''}`,
        type: 'definition' as const,
        value: sym.value,
        isDirectory: false,
      }))
      
      setSearchTime(Date.now() - startTime)
      setSearchSource('index')
      return results
    } catch (err) {
      console.error('[GlobalSearch] Index search failed:', err)
      return []
    }
  }, [searchSymbol])

  // 인덱스에서 파일/경로 검색
  const searchFilesFromIndex = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) return []
    
    try {
      const files = await window.electronAPI.lsp.searchFiles(query, 50)
      
      return files.map(f => ({
        file: f.path,
        line: 0,
        column: 0,
        content: f.name,
        type: 'file' as const,
        isDirectory: false,
      }))
    } catch (err) {
      console.error('[GlobalSearch] File search failed:', err)
      return []
    }
  }, [])

  // 서버에서 검색 (grep + find)
  const searchFromServer = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!activeProfile || !serverProject || !query.trim()) return []

    const startTime = Date.now()
    const results: SearchResult[] = []

    try {
      // 경로 검색 타입이면 find 명령 사용
      if (searchType === 'path' || query.startsWith('/') || query.includes('/')) {
        // 디렉토리/파일 검색
        const findCmd = query.startsWith('/') 
          ? `test -e "${query}" && echo "${query}" ; find "${query}" -maxdepth 1 -type f 2>/dev/null | head -10 ; find "${query}" -maxdepth 1 -type d 2>/dev/null | head -10`
          : `find "${serverProject.path}" \\( -name "*${query}*" -o -path "*${query}*" \\) 2>/dev/null | grep -v "/tmp/work/" | grep -v "/sstate-cache/" | head -50`
        
        const findResult = await window.electronAPI.ssh.exec(activeProfile.id, findCmd)
        
        if (findResult.code === 0 && findResult.stdout.trim()) {
          const paths = findResult.stdout.trim().split('\n').filter(Boolean)
          
          // 각 경로가 파일인지 디렉토리인지 확인
          for (const path of paths) {
            const checkCmd = `test -d "${path}" && echo "dir" || echo "file"`
            const checkResult = await window.electronAPI.ssh.exec(activeProfile.id, checkCmd)
            const isDir = checkResult.stdout.trim() === 'dir'
            
            results.push({
              file: path,
              line: 0,
              column: 0,
              content: path.split('/').pop() || path,
              type: isDir ? 'directory' : 'file',
              isDirectory: isDir,
            })
          }
        }
        
        setSearchTime(Date.now() - startTime)
        setSearchSource('server')
        return results
      }

      // 일반 심볼/내용 검색 (grep)
      let grepPattern = query
      let filePattern = ''
      let extraArgs = ''
      const excludeArgs = '--exclude-dir=sstate-cache --exclude-dir=downloads --exclude-dir=.git'
      const excludePipe = '| grep -v "/tmp/work/" | grep -v "/tmp/deploy/" | grep -v "/tmp/stamps/"'

      switch (searchType) {
        case 'symbol':
        case 'pin':
          grepPattern = `\\b${query}\\b`
          filePattern = '--include="*.h" --include="*.dts" --include="*.dtsi"'
          extraArgs = '-i'
          break
        case 'config':
          grepPattern = `CONFIG_${query.replace(/^CONFIG_/, '')}`
          filePattern = '--include="*.c" --include="*.h" --include="Kconfig" --include="*.defconfig"'
          break
        case 'define':
          grepPattern = `#define\\s+.*${query}`
          filePattern = '--include="*.h"'
          break
        case 'include':
          grepPattern = `(#include|require|include).*${query}`
          filePattern = '--include="*.h" --include="*.bb" --include="*.inc" --include="*.dts"'
          break
        default:
          // 특수문자 escape
          grepPattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          filePattern = '--include="*.h" --include="*.bb" --include="*.dts" --include="*.conf" --include="*.dtsi" --include="*.c"'
      }

      const cmd = `cd "${serverProject.path}" && timeout 10 grep -rn ${extraArgs} ${excludeArgs} ${filePattern} -E "${grepPattern}" . 2>/dev/null ${excludePipe} | head -100`
      const result = await window.electronAPI.ssh.exec(activeProfile.id, cmd)

      if (result.code === 0 && result.stdout.trim()) {
        for (const line of result.stdout.trim().split('\n')) {
          const match = line.match(/^\.\/(.+?):(\d+):(.*)$/)
          if (match) {
            const [, file, lineNum, content] = match
            results.push({
              file: `${serverProject.path}/${file}`,
              line: parseInt(lineNum),
              column: 1,
              content: content.trim(),
              type: content.includes('#define') ? 'definition' : 'usage',
              isDirectory: false,
            })
          }
        }
      }

      // 정의 우선 정렬
      results.sort((a, b) => {
        if (a.type === 'definition' && b.type !== 'definition') return -1
        if (a.type !== 'definition' && b.type === 'definition') return 1
        return 0
      })

      setSearchTime(Date.now() - startTime)
      setSearchSource('server')
      return results
    } catch (err: any) {
      throw err
    }
  }, [activeProfile, serverProject, searchType])

  // 검색 실행
  const performSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setError(null)
    setResults([])

    try {
      let allResults: SearchResult[] = []
      
      // 경로 검색 타입이거나 경로 형식인 경우
      if (searchType === 'path' || searchQuery.startsWith('/') || searchQuery.includes('/')) {
        // 인덱스에서 파일 검색
        if (stats && stats.files > 0) {
          const fileResults = await searchFilesFromIndex(searchQuery)
          allResults.push(...fileResults)
        }
        
        // 서버에서 경로 검색
        const serverPathResults = await searchFromServer(searchQuery)
        
        // 중복 제거 후 병합
        for (const sr of serverPathResults) {
          if (!allResults.some(r => r.file === sr.file)) {
            allResults.push(sr)
          }
        }
        
        setResults(allResults)
        setSearchSource(allResults.length > 0 ? 'hybrid' : 'server')
        setIsSearching(false)
        return
      }
      
      // 일반 심볼 검색
      if (stats && stats.symbols > 0) {
        const indexResults = await searchFromIndex(searchQuery)
        if (indexResults.length > 0) {
          allResults = indexResults
          
          // 인덱스 결과가 적으면 서버에서 추가 검색
          if (indexResults.length < 5) {
            try {
              const serverResults = await searchFromServer(searchQuery)
              for (const sr of serverResults) {
                if (!allResults.some(r => r.file === sr.file && r.line === sr.line)) {
                  allResults.push(sr)
                }
              }
              setSearchSource('hybrid')
            } catch {
              // 서버 검색 실패해도 인덱스 결과 유지
            }
          }
          setResults(allResults)
          setIsSearching(false)
          return
        }
      }
      
      // 인덱스에 없거나 인덱스 없으면 서버 검색
      const serverResults = await searchFromServer(searchQuery)
      setResults(serverResults)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, searchType, stats, searchFromIndex, searchFilesFromIndex, searchFromServer])

  // 결과 클릭 핸들러
  const handleResultClick = async (result: SearchResult) => {
    if (!activeProfile) return
    
    // 디렉토리인 경우 해당 디렉토리로 이동
    if (result.isDirectory || result.type === 'directory') {
      try {
        // 파일 트리 로드를 위해 navigateToDirectory 호출
        navigateToDirectory(result.file)
        
        // 디렉토리 내용 로드
        setFileTreeLoading(true)
        const lsResult = await window.electronAPI.ssh.exec(
          activeProfile.id,
          `ls -la "${result.file}" 2>/dev/null | tail -n +2`
        )
        
        if (lsResult.code === 0) {
          const lines = lsResult.stdout.trim().split('\n').filter(Boolean)
          const nodes = []
          
          for (const line of lines) {
            const parts = line.split(/\s+/)
            if (parts.length >= 9) {
              const perms = parts[0]
              const size = parseInt(parts[4]) || 0
              const name = parts.slice(8).join(' ')
              
              if (name === '.' || name === '..') continue
              
              const isDirectory = perms.startsWith('d')
              const fullPath = result.file === '/' ? `/${name}` : `${result.file}/${name}`
              
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
          
          setFileTreeLoading(false)
          // editorStore의 setFileTree로 트리 업데이트
          useEditorStore.getState().setFileTree(nodes, result.file)
        }
      } catch (err) {
        console.error('Failed to navigate to directory:', err)
        setFileTreeLoading(false)
      }
      return
    }
    
    // 파일인 경우 파일 열기
    try {
      const content = await window.electronAPI.ssh.readFile(activeProfile.id, result.file)
      const name = result.file.split('/').pop() || result.file
      openFile({
        path: result.file,
        name,
        content,
        isDirty: false,
        isLoading: false,
        serverId: activeProfile.id,
      })
    } catch (err) {
      console.error('Failed to open file:', err)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      performSearch()
    }
  }

  // 정의로 바로 이동
  const goToDefinition = async () => {
    if (!searchQuery.trim()) return
    
    const def = await findDefinition(searchQuery)
    if (def) {
      handleResultClick({
        file: def.file,
        line: def.line,
        column: 1,
        content: `#define ${def.name} ${def.value}`,
        type: 'definition',
        isDirectory: false,
      })
      return
    }
    
    const defResult = results.find(r => r.type === 'definition')
    if (defResult) {
      handleResultClick(defResult)
    }
  }

  if (!connectionStatus.connected || !serverProject) {
    return (
      <div className="p-4 text-center text-sm text-ide-text-muted">
        서버에 연결 후 프로젝트를 열어주세요.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 검색 입력 */}
      <div className="p-2 border-b border-ide-border">
        <div className="flex gap-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="심볼, 경로, 핀번호, CONFIG 검색..."
            className="flex-1 px-2 py-1.5 bg-ide-bg border border-ide-border rounded text-sm text-ide-text focus:border-ide-accent outline-none font-mono"
            autoFocus
          />
          <button
            onClick={performSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="px-3 py-1.5 bg-ide-accent text-white rounded text-sm hover:bg-ide-accent/80 disabled:opacity-50"
          >
            {isSearching ? '...' : '검색'}
          </button>
        </div>

        {/* 검색 타입 + 인덱스 상태 */}
        <div className="flex justify-between items-center mt-2">
          <div className="flex flex-wrap gap-1">
            {[
              { type: 'all' as const, label: '전체', icon: '🔍' },
              { type: 'path' as const, label: '경로', icon: '📁' },
              { type: 'define' as const, label: '#define', icon: '📝' },
              { type: 'pin' as const, label: '핀', icon: '🔌' },
              { type: 'config' as const, label: 'CONFIG', icon: '⚙️' },
            ].map(({ type, label, icon }) => (
              <button
                key={type}
                onClick={() => setSearchType(type)}
                className={`px-2 py-1 text-xs rounded ${searchType === type ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
          
          {/* 인덱스 상태 표시 */}
          <div className="flex items-center gap-1 text-[10px]">
            {isIndexing ? (
              <span className="text-yellow-400">
                🔄 {indexProgress.message}
              </span>
            ) : stats && stats.symbols > 0 ? (
              <span className="text-ide-success">
                ⚡ FTS5 ({stats.symbols.toLocaleString()} 심볼)
              </span>
            ) : (
              <span className="text-ide-text-muted">📡 서버 검색</span>
            )}
          </div>
        </div>

        {/* 빠른 검색 버튼 */}
        <div className="flex flex-wrap gap-1 mt-2">
          {/* 경로 퀵 검색 */}
          <button
            onClick={() => { setSearchQuery('/home/'); setSearchType('path') }}
            className="px-2 py-0.5 text-xs bg-blue-500/20 rounded text-blue-400 hover:bg-blue-500/30 font-mono"
          >
            /home/
          </button>
          <button
            onClick={() => { setSearchQuery(serverProject.path); setSearchType('path') }}
            className="px-2 py-0.5 text-xs bg-blue-500/20 rounded text-blue-400 hover:bg-blue-500/30 font-mono truncate max-w-[150px]"
            title={serverProject.path}
          >
            {serverProject.path.split('/').pop()}
          </button>
          <span className="text-ide-text-muted text-xs">|</span>
          {/* 심볼 퀵 검색 */}
          {['PA_', 'PB_', 'GPIO', 'CONFIG_', 'MSCR'].map(term => (
            <button
              key={term}
              onClick={() => { setSearchQuery(term); setSearchType(term.startsWith('CONFIG') ? 'config' : 'pin') }}
              className="px-2 py-0.5 text-xs bg-ide-hover rounded text-ide-text-muted hover:text-ide-text font-mono"
            >
              {term}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 영역 */}
      <div className="flex-1 overflow-auto">
        {isSearching ? (
          <div className="flex flex-col items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-ide-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-ide-text-muted mt-2">검색 중...</p>
          </div>
        ) : error ? (
          <div className="p-4 text-center text-ide-error text-sm">{error}</div>
        ) : results.length > 0 ? (
          <div>
            {/* 결과 요약 */}
            <div className="sticky top-0 p-2 bg-ide-sidebar border-b border-ide-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ide-text-muted">
                  {results.length}개 결과
                  {searchTime !== null && (
                    <span className={`ml-1 ${searchSource === 'index' ? 'text-ide-success' : searchSource === 'hybrid' ? 'text-blue-400' : 'text-yellow-400'}`}>
                      {searchSource === 'index' ? '⚡' : searchSource === 'hybrid' ? '🔄' : '📡'} {searchTime}ms
                    </span>
                  )}
                </span>
                {results.some(r => r.type === 'definition') && (
                  <button
                    onClick={goToDefinition}
                    className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                  >
                    → 정의로 이동
                  </button>
                )}
              </div>
            </div>

            {/* 결과 목록 */}
            <div className="divide-y divide-ide-border">
              {results.map((result, index) => (
                <div
                  key={index}
                  onClick={() => handleResultClick(result)}
                  className="p-2 hover:bg-ide-hover cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1 rounded ${
                      result.type === 'definition' ? 'bg-green-500/30 text-green-400' :
                      result.type === 'directory' ? 'bg-blue-500/30 text-blue-400' :
                      result.type === 'file' ? 'bg-purple-500/30 text-purple-400' :
                      'bg-ide-hover text-ide-text-muted'
                    }`}>
                      {result.type === 'definition' ? '정의' : 
                       result.type === 'directory' ? '📁 디렉토리' :
                       result.type === 'file' ? '📄 파일' : '사용'}
                    </span>
                    <span className="text-xs text-ide-accent font-mono truncate flex-1">
                      {result.file.replace(serverProject.path + '/', '')}
                    </span>
                    {result.line > 0 && (
                      <span className="text-xs text-ide-text-muted">:{result.line}</span>
                    )}
                  </div>
                  <pre className="text-xs font-mono text-ide-text whitespace-pre-wrap break-all bg-ide-bg p-1 rounded">
                    {highlightQuery(result.content, searchQuery)}
                  </pre>
                  {result.isDirectory && (
                    <p className="text-[10px] text-blue-400 mt-1">
                      💡 클릭하면 파일 탐색기에서 이 디렉토리로 이동합니다
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-ide-text-muted">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-sm">검색어를 입력하세요</p>
            <p className="text-xs mt-1">
              경로 검색: <code className="text-ide-accent">/home/master/...</code> 또는 
              <code className="text-ide-accent ml-1">build_s32g</code>
            </p>
            {stats && stats.symbols > 0 && (
              <p className="text-xs mt-1 text-ide-success">⚡ SQLite FTS5 활성화 (밀리초 검색)</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// 검색어 하이라이트
function highlightQuery(text: string, query: string) {
  if (!query) return text
  
  // 경로 쿼리의 경우 마지막 부분만 하이라이트
  const searchTerm = query.includes('/') ? query.split('/').pop() || query : query
  const index = text.toLowerCase().indexOf(searchTerm.toLowerCase())
  if (index === -1) return text
  
  return (
    <>
      {text.slice(0, index)}
      <span className="bg-yellow-500/50 text-yellow-200">{text.slice(index, index + searchTerm.length)}</span>
      {text.slice(index + searchTerm.length)}
    </>
  )
}
