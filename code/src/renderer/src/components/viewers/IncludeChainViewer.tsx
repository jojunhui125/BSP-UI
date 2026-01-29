/**
 * Include Chain 추적기 (초고속 버전)
 * - 인덱스 기반 역방향 검색 (즉시!)
 * - 로컬 파싱으로 정방향 검색
 * - C-01: Include 병합 뷰 (DTS 파일 통합)
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSshStore } from '../../stores/sshStore'
import { useProjectStore } from '../../stores/projectStore'
import { useEditorStore } from '../../stores/editorStore'
import { useIndexStore } from '../../stores/indexStore'
import { toast } from '../layout/Toast'

interface IncludeInfo {
  path: string
  name: string
  type: 'require' | 'include' | 'inherit' | '#include'
  line: number
}

interface MergedSection {
  source: string
  startLine: number
  endLine: number
  content: string
}

interface IncludeChainViewerProps {
  filePath: string
}

export function IncludeChainViewer({ filePath }: IncludeChainViewerProps) {
  const { activeProfile } = useSshStore()
  const { serverProject } = useProjectStore()
  const { openFile, openFiles } = useEditorStore()
  const { getFilesIncluding, lastIndexTime } = useIndexStore()
  
  const [viewMode, setViewMode] = useState<'forward' | 'reverse' | 'merged'>('forward')
  const [forwardIncludes, setForwardIncludes] = useState<IncludeInfo[]>([])
  const [reverseRefs, setReverseRefs] = useState<string[]>([])
  const [mergedContent, setMergedContent] = useState<MergedSection[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadTime, setLoadTime] = useState<number | null>(null)
  const [mergeDepth, setMergeDepth] = useState(3) // 최대 include 깊이
  
  // 현재 파일의 content 가져오기
  const currentFileContent = useMemo(() => {
    const file = openFiles.find(f => f.path === filePath)
    return file?.content || null
  }, [openFiles, filePath])

  // 로컬에서 include 파싱 (즉시)
  const parseIncludesLocal = useCallback((content: string): IncludeInfo[] => {
    const includes: IncludeInfo[] = []
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const lineNum = i + 1
      
      // BitBake require
      let match = line.match(/^require\s+["']?([^"'\s]+)["']?/)
      if (match) {
        includes.push({
          path: match[1],
          name: match[1].split('/').pop() || match[1],
          type: 'require',
          line: lineNum,
        })
        continue
      }
      
      // BitBake include
      match = line.match(/^include\s+["']?([^"'\s]+)["']?/)
      if (match) {
        includes.push({
          path: match[1],
          name: match[1].split('/').pop() || match[1],
          type: 'include',
          line: lineNum,
        })
        continue
      }
      
      // BitBake inherit
      match = line.match(/^inherit\s+(.+)/)
      if (match) {
        const classes = match[1].split(/\s+/).filter(c => c && !c.startsWith('$'))
        for (const cls of classes) {
          includes.push({
            path: `classes/${cls}.bbclass`,
            name: `${cls}.bbclass`,
            type: 'inherit',
            line: lineNum,
          })
        }
        continue
      }
      
      // C/DTS #include
      match = line.match(/^#include\s*[<"]([^>"]+)[>"]/)
      if (match) {
        includes.push({
          path: match[1],
          name: match[1].split('/').pop() || match[1],
          type: '#include',
          line: lineNum,
        })
      }
      
      // DTS /include/
      match = line.match(/\/include\/\s*"([^"]+)"/)
      if (match) {
        includes.push({
          path: match[1],
          name: match[1].split('/').pop() || match[1],
          type: '#include',
          line: lineNum,
        })
      }
    }
    
    return includes
  }, [])

  // Forward includes 분석 (로컬 우선)
  useEffect(() => {
    if (!currentFileContent) return
    
    const startTime = Date.now()
    const includes = parseIncludesLocal(currentFileContent)
    setForwardIncludes(includes)
    setLoadTime(Date.now() - startTime)
  }, [filePath, currentFileContent, parseIncludesLocal])

  // Reverse refs (인덱스 기반 - 즉시!)
  useEffect(() => {
    if (viewMode !== 'reverse') return
    
    const startTime = Date.now()
    
    // 인덱스에서 검색
    if (lastIndexTime) {
      const refs = getFilesIncluding(filePath)
      setReverseRefs(refs)
      setLoadTime(Date.now() - startTime)
      return
    }
    
    // 인덱스 없으면 서버 검색 (폴백)
    if (activeProfile && serverProject) {
      loadReverseFromServer()
    }
  }, [viewMode, filePath, lastIndexTime])

  // Include 병합 뷰 로드 (C-01)
  const loadMergedView = useCallback(async () => {
    if (!activeProfile || !currentFileContent) return
    
    setIsLoading(true)
    const startTime = Date.now()
    const sections: MergedSection[] = []
    const loadedPaths = new Set<string>()
    
    // 재귀적으로 include 파일 로드
    const loadFileRecursive = async (
      content: string, 
      sourcePath: string, 
      depth: number
    ): Promise<string> => {
      if (depth > mergeDepth) return content
      if (loadedPaths.has(sourcePath)) return `/* 순환 참조: ${sourcePath} */`
      loadedPaths.add(sourcePath)
      
      const lines = content.split('\n')
      const resultLines: string[] = []
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        
        // DTS /include/ 또는 #include 감지
        const includeMatch = trimmed.match(/(?:\/include\/\s*"|#include\s*[<"])([^">]+)[">]/)
        
        if (includeMatch) {
          const includePath = includeMatch[1]
          let fullPath = includePath
          
          // 상대 경로 해석
          if (!includePath.startsWith('/')) {
            const dir = sourcePath.substring(0, sourcePath.lastIndexOf('/'))
            fullPath = `${dir}/${includePath}`
          }
          
          try {
            const includeContent = await window.electronAPI.ssh.readFile(activeProfile.id, fullPath)
            const fileName = fullPath.split('/').pop() || fullPath
            
            // 병합된 내용 추가
            resultLines.push(`/* ========== BEGIN: ${fileName} ========== */`)
            
            // 재귀적으로 처리
            const mergedInclude = await loadFileRecursive(includeContent, fullPath, depth + 1)
            resultLines.push(mergedInclude)
            
            resultLines.push(`/* ========== END: ${fileName} ========== */`)
            
            // 섹션 기록
            sections.push({
              source: fullPath,
              startLine: resultLines.length - mergedInclude.split('\n').length - 1,
              endLine: resultLines.length - 1,
              content: includeContent
            })
          } catch (err) {
            resultLines.push(`/* ERROR: Failed to load ${fullPath} */`)
            resultLines.push(line) // 원래 include 문 유지
          }
        } else {
          resultLines.push(line)
        }
      }
      
      return resultLines.join('\n')
    }
    
    try {
      const merged = await loadFileRecursive(currentFileContent, filePath, 0)
      
      // 메인 파일 섹션
      sections.unshift({
        source: filePath,
        startLine: 0,
        endLine: merged.split('\n').length,
        content: currentFileContent
      })
      
      setMergedContent(sections)
      setLoadTime(Date.now() - startTime)
      toast.success('병합 완료', `${sections.length}개 파일 통합`)
    } catch (err: any) {
      toast.error('병합 실패', err.message)
    } finally {
      setIsLoading(false)
    }
  }, [activeProfile, currentFileContent, filePath, mergeDepth])

  // 병합 뷰 모드 변경 시 로드
  useEffect(() => {
    if (viewMode === 'merged' && mergedContent.length === 0) {
      loadMergedView()
    }
  }, [viewMode, loadMergedView, mergedContent.length])

  // 서버에서 역방향 검색 (폴백)
  const loadReverseFromServer = async () => {
    if (!activeProfile || !serverProject) return
    
    setIsLoading(true)
    const startTime = Date.now()
    
    try {
      const fileName = filePath.split('/').pop() || ''
      const result = await window.electronAPI.ssh.exec(
        activeProfile.id,
        `cd "${serverProject.path}" && timeout 3 grep -rn --include="*.bb" --include="*.bbappend" --include="*.inc" --include="*.h" --include="*.dts" --include="*.dtsi" --exclude-dir=tmp --exclude-dir=build --exclude-dir=sstate-cache --exclude-dir=.git -E "(require|include|#include).*${fileName}" . 2>/dev/null | head -20`
      )
      
      const refs: string[] = []
      if (result.code === 0 && result.stdout.trim()) {
        for (const line of result.stdout.trim().split('\n')) {
          const match = line.match(/^\.\/(.+?):/)
          if (match) {
            const fullPath = `${serverProject.path}/${match[1]}`
            if (fullPath !== filePath && !refs.includes(fullPath)) {
              refs.push(fullPath)
            }
          }
        }
      }
      
      setReverseRefs(refs)
      setLoadTime(Date.now() - startTime)
    } catch (err) {
      console.error('Reverse search failed:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // 파일 열기
  const handleOpenFile = async (path: string) => {
    if (!activeProfile) return
    
    try {
      // 상대 경로를 절대 경로로 변환
      let fullPath = path
      if (!path.startsWith('/')) {
        const dir = filePath.substring(0, filePath.lastIndexOf('/'))
        fullPath = `${dir}/${path}`
      }
      
      const content = await window.electronAPI.ssh.readFile(activeProfile.id, fullPath)
      openFile({
        path: fullPath,
        name: path.split('/').pop() || path,
        content,
        isDirty: false,
        isLoading: false,
        serverId: activeProfile.id,
      })
    } catch (err) {
      console.error('Failed to open file:', err)
    }
  }

  return (
    <div className="flex flex-col h-full bg-ide-bg">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-2 bg-ide-sidebar border-b border-ide-border">
        <h3 className="text-sm font-semibold text-ide-text">🔗 Include Chain</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('forward')}
            className={`px-2 py-1 text-xs rounded ${viewMode === 'forward' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
            title="이 파일이 포함하는 파일들"
          >
            ➡️ ({forwardIncludes.length})
          </button>
          <button
            onClick={() => setViewMode('reverse')}
            className={`px-2 py-1 text-xs rounded ${viewMode === 'reverse' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
            title="이 파일을 참조하는 파일들"
          >
            ⬅️ ({reverseRefs.length})
          </button>
          <button
            onClick={() => setViewMode('merged')}
            className={`px-2 py-1 text-xs rounded ${viewMode === 'merged' ? 'bg-green-500 text-white' : 'bg-ide-hover text-ide-text'}`}
            title="Include 병합 뷰 (모든 include 통합)"
          >
            🔀 병합
          </button>
        </div>
      </div>

      {/* 현재 파일 + 상태 */}
      <div className="px-2 py-1 bg-ide-bg border-b border-ide-border flex items-center justify-between">
        <p className="text-xs font-mono text-ide-text-muted truncate flex-1" title={filePath}>
          📄 {filePath.split('/').pop()}
        </p>
        <div className="flex items-center gap-2">
          {lastIndexTime ? (
            <span className="text-[10px] text-ide-success">⚡ 인덱스</span>
          ) : (
            <span className="text-[10px] text-ide-text-muted">📡 서버</span>
          )}
          {loadTime !== null && (
            <span className="text-[10px] text-ide-text-muted">{loadTime}ms</span>
          )}
        </div>
      </div>

      {/* 내용 */}
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-ide-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-ide-text-muted mt-2">검색 중...</p>
          </div>
        ) : viewMode === 'forward' ? (
          /* Forward: 이 파일이 포함하는 파일들 */
          forwardIncludes.length === 0 ? (
            <div className="text-center text-ide-text-muted py-4">
              <p className="text-2xl mb-2">📄</p>
              <p className="text-sm">include/require가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-1">
              {forwardIncludes.map((inc, index) => (
                <div
                  key={index}
                  onClick={() => handleOpenFile(inc.path)}
                  className="p-2 bg-ide-sidebar rounded border border-ide-border hover:border-ide-accent cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1 rounded ${getTypeColor(inc.type)}`}>
                      {inc.type}
                    </span>
                    <span className="text-sm text-ide-text font-mono">{inc.name}</span>
                    <span className="text-xs text-ide-text-muted ml-auto">:{inc.line}</span>
                  </div>
                  <p className="text-[10px] text-ide-text-muted mt-1 font-mono truncate">
                    {inc.path}
                  </p>
                </div>
              ))}
            </div>
          )
        ) : viewMode === 'reverse' ? (
          /* Reverse: 이 파일을 포함하는 파일들 */
          reverseRefs.length === 0 ? (
            <div className="text-center text-ide-text-muted py-4">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm">이 파일을 참조하는 곳이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-1">
              {reverseRefs.map((ref, index) => (
                <div
                  key={index}
                  onClick={() => handleOpenFile(ref)}
                  className="p-2 bg-ide-sidebar rounded border border-ide-border hover:border-ide-accent cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ide-text font-mono">
                      {ref.split('/').pop()}
                    </span>
                  </div>
                  <p className="text-[10px] text-ide-text-muted mt-1 font-mono truncate">
                    {ref.replace(serverProject?.path + '/', '')}
                  </p>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Merged: Include 병합 뷰 */
          <div className="space-y-2">
            {/* 병합 옵션 */}
            <div className="flex items-center gap-2 p-2 bg-ide-sidebar rounded border border-ide-border">
              <span className="text-xs text-ide-text-muted">깊이:</span>
              <select
                value={mergeDepth}
                onChange={(e) => {
                  setMergeDepth(Number(e.target.value))
                  setMergedContent([]) // 리셋
                }}
                className="px-2 py-1 text-xs bg-ide-bg border border-ide-border rounded text-ide-text"
              >
                <option value={1}>1단계</option>
                <option value={2}>2단계</option>
                <option value={3}>3단계</option>
                <option value={5}>5단계</option>
              </select>
              <button
                onClick={() => {
                  setMergedContent([])
                  loadMergedView()
                }}
                className="px-2 py-1 text-xs bg-ide-accent text-white rounded hover:bg-ide-accent/80"
              >
                🔄 새로고침
              </button>
            </div>

            {/* 병합된 파일 목록 */}
            {mergedContent.length === 0 ? (
              <div className="text-center text-ide-text-muted py-4">
                <p className="text-2xl mb-2">🔀</p>
                <p className="text-sm">병합 버튼을 눌러 시작하세요</p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded">
                  <p className="text-xs text-green-400 font-medium">
                    ✅ {mergedContent.length}개 파일 병합됨
                  </p>
                </div>
                
                {mergedContent.map((section, index) => (
                  <div
                    key={index}
                    onClick={() => handleOpenFile(section.source)}
                    className={`p-2 rounded border cursor-pointer transition-colors ${
                      index === 0 
                        ? 'bg-ide-accent/10 border-ide-accent/30 hover:border-ide-accent'
                        : 'bg-ide-sidebar border-ide-border hover:border-ide-accent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{index === 0 ? '📄' : '📎'}</span>
                      <span className="text-sm text-ide-text font-mono truncate">
                        {section.source.split('/').pop()}
                      </span>
                      <span className="text-[10px] text-ide-text-muted ml-auto">
                        {section.content.split('\n').length} lines
                      </span>
                    </div>
                    <p className="text-[10px] text-ide-text-muted mt-1 font-mono truncate">
                      {section.source.replace(serverProject?.path + '/', '')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'require': return 'bg-purple-500/30 text-purple-400'
    case 'include': return 'bg-blue-500/30 text-blue-400'
    case 'inherit': return 'bg-orange-500/30 text-orange-400'
    case '#include': return 'bg-cyan-500/30 text-cyan-400'
    default: return 'bg-ide-hover text-ide-text'
  }
}
