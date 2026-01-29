/**
 * 매크로 해석 뷰어 (v2 - SQLite + FTS5 기반)
 * 
 * 핵심 변경사항:
 * - FTS5 전문 검색 (밀리초 응답)
 * - LRU 캐시 (반복 검색 즉시 응답)
 * - 서버 검색 폴백
 * - C-02: dt-bindings 매크로 특별 지원
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSshStore } from '../../stores/sshStore'
import { useProjectStore } from '../../stores/projectStore'
import { useIndexStore } from '../../stores/indexStore'
import { toast } from '../layout/Toast'

interface ResolvedMacro {
  name: string
  value: string
  definedIn: string
  line: number
  usageCount: number
  category?: 'dt-bindings' | 'pinctrl' | 'gpio' | 'clock' | 'interrupt' | 'general'
}

interface MacroResolverViewerProps {
  content: string
  filePath: string
  onNavigateToLine: (line: number) => void
}

export function MacroResolverViewer({ content, filePath, onNavigateToLine }: MacroResolverViewerProps) {
  const { activeProfile, connectionStatus } = useSshStore()
  const { serverProject } = useProjectStore()
  const { findDefinition, stats, isIndexing } = useIndexStore()

  const [resolvedMacros, setResolvedMacros] = useState<ResolvedMacro[]>([])
  const [isResolving, setIsResolving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [loadTime, setLoadTime] = useState<number | null>(null)
  const [resolveSource, setResolveSource] = useState<'index' | 'server' | null>(null)

  // 매크로 카테고리 분류
  const categorize = useCallback((name: string, definedIn: string): ResolvedMacro['category'] => {
    const lowerPath = definedIn.toLowerCase()
    const lowerName = name.toLowerCase()
    
    if (lowerPath.includes('dt-bindings') || lowerPath.includes('dt_bindings')) {
      return 'dt-bindings'
    }
    if (lowerPath.includes('pinctrl') || lowerName.includes('pin') || lowerName.includes('mux')) {
      return 'pinctrl'
    }
    if (lowerPath.includes('gpio') || lowerName.startsWith('gpio')) {
      return 'gpio'
    }
    if (lowerPath.includes('clock') || lowerName.includes('clk')) {
      return 'clock'
    }
    if (lowerPath.includes('interrupt') || lowerName.includes('irq') || lowerName.includes('int')) {
      return 'interrupt'
    }
    return 'general'
  }, [])

  // 파일에서 사용된 매크로 추출 (로컬, 즉시)
  const usedMacros = useMemo(() => {
    const macros = new Map<string, number>()
    
    // 대문자_숫자 패턴 (매크로)
    const macroPattern = /\b([A-Z][A-Z0-9_]{3,})\b/g
    let match
    
    while ((match = macroPattern.exec(content)) !== null) {
      const name = match[1]
      // 일반적인 키워드 제외
      const excludeList = [
        'NULL', 'TRUE', 'FALSE', 'EOF', 'OK', 'ERR', 'GPIO', 'SPI', 'I2C', 
        'UART', 'CAN', 'USB', 'DMA', 'IRQ', 'DEFINE', 'ENDIF', 'IFDEF', 
        'IFNDEF', 'ELSE', 'INCLUDE', 'PRAGMA', 'EXPORT', 'STATIC', 'CONST',
        'VOID', 'RETURN', 'STRUCT', 'ENUM', 'TYPEDEF', 'EXTERN'
      ]
      if (!excludeList.includes(name) && name.length <= 50) {
        macros.set(name, (macros.get(name) || 0) + 1)
      }
    }
    
    return Array.from(macros.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)  // 상위 50개로 증가
  }, [content])

  // FTS5 인덱스 기반 해석 (밀리초 응답!)
  const resolveFromIndex = useCallback(async () => {
    setIsResolving(true)
    const startTime = Date.now()
    const resolved: ResolvedMacro[] = []

    try {
      for (const { name, count } of usedMacros) {
        const def = await findDefinition(name)
        if (def) {
          const definedIn = def.file.replace(serverProject?.path + '/', '')
          resolved.push({
            name,
            value: def.value || '',
            definedIn,
            line: def.line,
            usageCount: count,
            category: categorize(name, definedIn),
          })
        }
      }

      setResolvedMacros(resolved)
      setLoadTime(Date.now() - startTime)
      setResolveSource('index')
    } catch (err) {
      console.error('[MacroResolver] Index resolve failed:', err)
    } finally {
      setIsResolving(false)
    }
    
    return resolved
  }, [usedMacros, findDefinition, serverProject, categorize])

  // 서버 기반 해석 (폴백)
  const resolveFromServer = useCallback(async () => {
    if (!activeProfile || !serverProject || usedMacros.length === 0) return []

    setIsResolving(true)
    const startTime = Date.now()

    try {
      const resolved: ResolvedMacro[] = []
      const uncached = usedMacros.slice(0, 30)

      if (uncached.length > 0) {
        const pattern = uncached.map(m => m.name).join('\\|')
        
        // tmp/work-shared는 포함 (kernel-source의 dt-bindings, pinctrl 헤더 등)
        const result = await window.electronAPI.ssh.exec(
          activeProfile.id,
          `cd "${serverProject.path}" && timeout 10 grep -rn --include="*.h" "#define\\s\\+\\(${pattern}\\)\\b" . 2>/dev/null | grep -v "/tmp/work/" | grep -v "/tmp/deploy/" | grep -v "/sstate-cache/" | head -150`
        )

        if (result.code === 0 && result.stdout.trim()) {
          for (const line of result.stdout.trim().split('\n')) {
            const match = line.match(/^\.\/(.+?):(\d+):\s*#define\s+(\S+)\s*(.*)$/)
            if (match) {
              const [, definedIn, lineStr, macroName, value] = match
              const cleanValue = value.trim().replace(/\/\*.*?\*\//, '').replace(/\/\/.*$/, '').trim() || '(값 없음)'
              
              const usage = usedMacros.find(m => m.name === macroName)
              if (usage && !resolved.some(r => r.name === macroName)) {
                resolved.push({
                  name: macroName,
                  value: cleanValue,
                  definedIn,
                  line: parseInt(lineStr),
                  usageCount: usage.count,
                  category: categorize(macroName, definedIn),
                })
              }
            }
          }
        }
      }

      resolved.sort((a, b) => b.usageCount - a.usageCount)
      setResolvedMacros(resolved)
      setLoadTime(Date.now() - startTime)
      setResolveSource('server')
      return resolved
    } catch (err) {
      console.error('[MacroResolver] Server resolve failed:', err)
      return []
    } finally {
      setIsResolving(false)
    }
  }, [activeProfile, serverProject, usedMacros])

  // 하이브리드 해석 (인덱스 + 서버 보완)
  const resolveHybrid = useCallback(async () => {
    if (!connectionStatus.connected || usedMacros.length === 0) return

    // 인덱스가 있으면 먼저 시도
    if (stats && stats.symbols > 0) {
      const indexResolved = await resolveFromIndex()
      
      // 인덱스 해석 후 미해석이 많으면 서버에서 추가 검색
      if (indexResolved.length < usedMacros.length * 0.5) {
        // 50% 미만 해석되면 서버 검색 추가
        const serverResolved = await resolveFromServer()
        
        // 병합 (인덱스 결과 우선)
        const merged = [...indexResolved]
        for (const sr of serverResolved) {
          if (!merged.some(r => r.name === sr.name)) {
            merged.push(sr)
          }
        }
        merged.sort((a, b) => b.usageCount - a.usageCount)
        setResolvedMacros(merged)
        setResolveSource('index')  // 하이브리드
      }
    } else {
      // 인덱스 없으면 서버 검색
      await resolveFromServer()
    }
  }, [connectionStatus.connected, stats, usedMacros, resolveFromIndex, resolveFromServer])

  // 파일 변경 시 자동 해석
  useEffect(() => {
    resolveHybrid()
  }, [filePath, stats?.symbols])

  // 필터링
  const filteredMacros = useMemo(() => {
    if (!searchQuery) return resolvedMacros
    const query = searchQuery.toLowerCase()
    return resolvedMacros.filter(m => 
      m.name.toLowerCase().includes(query) ||
      m.value.toLowerCase().includes(query)
    )
  }, [resolvedMacros, searchQuery])

  const unresolvedCount = usedMacros.length - resolvedMacros.length
  
  // 미해석 매크로 목록
  const unresolvedMacros = useMemo(() => {
    const resolvedNames = new Set(resolvedMacros.map(m => m.name))
    return usedMacros.filter(m => !resolvedNames.has(m.name))
  }, [usedMacros, resolvedMacros])

  const [showUnresolved, setShowUnresolved] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<ResolvedMacro['category'] | 'all'>('all')

  // 카테고리별 통계
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {
      'dt-bindings': 0,
      'pinctrl': 0,
      'gpio': 0,
      'clock': 0,
      'interrupt': 0,
      'general': 0,
    }
    for (const macro of resolvedMacros) {
      if (macro.category) {
        stats[macro.category]++
      }
    }
    return stats
  }, [resolvedMacros])

  // 카테고리 필터링
  const categoryFilteredMacros = useMemo(() => {
    if (categoryFilter === 'all') return filteredMacros
    return filteredMacros.filter(m => m.category === categoryFilter)
  }, [filteredMacros, categoryFilter])

  return (
    <div className="flex flex-col h-full bg-ide-bg">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-2 bg-ide-sidebar border-b border-ide-border">
        <h3 className="text-sm font-semibold text-ide-text">🔮 매크로 해석</h3>
        <div className="flex items-center gap-2">
          {isIndexing ? (
            <span className="text-[10px] text-yellow-400">🔄 인덱싱...</span>
          ) : resolveSource === 'index' ? (
            <span className="text-[10px] text-ide-success">⚡ FTS5</span>
          ) : resolveSource === 'server' ? (
            <span className="text-[10px] text-yellow-400">📡 서버</span>
          ) : null}
          {loadTime !== null && (
            <span className="text-[10px] text-ide-text-muted">{loadTime}ms</span>
          )}
          <button
            onClick={resolveHybrid}
            disabled={isResolving}
            className="px-2 py-1 text-xs bg-ide-hover text-ide-text rounded disabled:opacity-50"
          >
            🔄
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div className="p-2 border-b border-ide-border">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 매크로 검색..."
          className="w-full px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text focus:border-ide-accent outline-none font-mono"
        />
      </div>

      {/* 통계 + 탭 */}
      <div className="flex items-center justify-between p-2 bg-ide-bg border-b border-ide-border text-xs">
        <div className="flex gap-1">
          <button
            onClick={() => setShowUnresolved(false)}
            className={`px-2 py-1 rounded ${!showUnresolved ? 'bg-green-500/30 text-green-400' : 'bg-ide-hover text-ide-text'}`}
          >
            ✅ ({resolvedMacros.length})
          </button>
          <button
            onClick={() => setShowUnresolved(true)}
            className={`px-2 py-1 rounded ${showUnresolved ? 'bg-yellow-500/30 text-yellow-400' : 'bg-ide-hover text-ide-text'}`}
          >
            ❓ ({unresolvedCount})
          </button>
        </div>
        <span className="text-ide-text-muted">총 {usedMacros.length}개</span>
      </div>

      {/* 카테고리 필터 (C-02: dt-bindings 지원) */}
      {!showUnresolved && resolvedMacros.length > 0 && (
        <div className="flex items-center gap-1 p-2 bg-ide-sidebar border-b border-ide-border overflow-x-auto">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-2 py-0.5 text-[10px] rounded whitespace-nowrap ${
              categoryFilter === 'all' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'
            }`}
          >
            전체
          </button>
          {categoryStats['dt-bindings'] > 0 && (
            <button
              onClick={() => setCategoryFilter('dt-bindings')}
              className={`px-2 py-0.5 text-[10px] rounded whitespace-nowrap ${
                categoryFilter === 'dt-bindings' ? 'bg-purple-500 text-white' : 'bg-purple-500/20 text-purple-400'
              }`}
              title="Device Tree Bindings 매크로"
            >
              📋 dt-bindings ({categoryStats['dt-bindings']})
            </button>
          )}
          {categoryStats['pinctrl'] > 0 && (
            <button
              onClick={() => setCategoryFilter('pinctrl')}
              className={`px-2 py-0.5 text-[10px] rounded whitespace-nowrap ${
                categoryFilter === 'pinctrl' ? 'bg-orange-500 text-white' : 'bg-orange-500/20 text-orange-400'
              }`}
              title="Pin Control 매크로"
            >
              📌 pinctrl ({categoryStats['pinctrl']})
            </button>
          )}
          {categoryStats['gpio'] > 0 && (
            <button
              onClick={() => setCategoryFilter('gpio')}
              className={`px-2 py-0.5 text-[10px] rounded whitespace-nowrap ${
                categoryFilter === 'gpio' ? 'bg-green-500 text-white' : 'bg-green-500/20 text-green-400'
              }`}
              title="GPIO 매크로"
            >
              🔌 gpio ({categoryStats['gpio']})
            </button>
          )}
          {categoryStats['clock'] > 0 && (
            <button
              onClick={() => setCategoryFilter('clock')}
              className={`px-2 py-0.5 text-[10px] rounded whitespace-nowrap ${
                categoryFilter === 'clock' ? 'bg-cyan-500 text-white' : 'bg-cyan-500/20 text-cyan-400'
              }`}
              title="Clock 매크로"
            >
              ⏰ clock ({categoryStats['clock']})
            </button>
          )}
          {categoryStats['interrupt'] > 0 && (
            <button
              onClick={() => setCategoryFilter('interrupt')}
              className={`px-2 py-0.5 text-[10px] rounded whitespace-nowrap ${
                categoryFilter === 'interrupt' ? 'bg-red-500 text-white' : 'bg-red-500/20 text-red-400'
              }`}
              title="Interrupt 매크로"
            >
              ⚡ irq ({categoryStats['interrupt']})
            </button>
          )}
        </div>
      )}

      {/* 매크로 목록 */}
      <div className="flex-1 overflow-auto p-2">
        {isResolving ? (
          <div className="flex flex-col items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-ide-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-ide-text-muted mt-2">해석 중...</p>
          </div>
        ) : showUnresolved ? (
          /* 미해석 매크로 목록 */
          unresolvedMacros.length === 0 ? (
            <div className="text-center text-ide-text-muted py-4">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm">모든 매크로가 해석되었습니다!</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-ide-text-muted mb-2">
                💡 인덱스나 서버에서 정의를 찾지 못한 매크로입니다.
                <br />로컬 정의, 빌드 시 생성, 또는 다른 프로젝트에 정의되어 있을 수 있습니다.
              </p>
              {unresolvedMacros.map((macro, index) => (
                <div
                  key={index}
                  className="p-2 bg-ide-sidebar rounded border border-yellow-500/30 hover:border-yellow-500"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono text-yellow-400 font-semibold">
                      {macro.name}
                    </span>
                    <span className="text-[10px] text-ide-text-muted">×{macro.count}</span>
                  </div>
                  <p className="text-[10px] text-ide-text-muted mt-1">
                    정의를 찾을 수 없음 - 검색에서 직접 찾아보세요
                  </p>
                </div>
              ))}
            </div>
          )
        ) : (
          /* 해석된 매크로 목록 */
          categoryFilteredMacros.length === 0 ? (
            <div className="text-center text-ide-text-muted py-4">
              <p className="text-2xl mb-2">🔮</p>
              <p className="text-sm">
                {usedMacros.length === 0 ? '매크로가 없습니다' : '해석된 매크로가 없습니다'}
              </p>
              <p className="text-xs mt-2">
                인덱싱이 완료되었는지 확인하거나<br />🔄 버튼을 눌러 다시 시도해보세요
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {categoryFilteredMacros.map((macro, index) => (
                <div
                  key={index}
                  className={`p-2 bg-ide-sidebar rounded border hover:border-ide-accent ${getCategoryBorderColor(macro.category)}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-ide-accent font-semibold">
                        {macro.name}
                      </span>
                      {macro.category && macro.category !== 'general' && (
                        <span className={`text-[9px] px-1 rounded ${getCategoryBadgeColor(macro.category)}`}>
                          {macro.category}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-ide-text-muted">×{macro.usageCount}</span>
                  </div>
                  <div className="text-xs text-green-400 font-mono bg-ide-bg p-1 rounded truncate">
                    = {macro.value}
                  </div>
                  <p className="text-[10px] text-ide-text-muted mt-1 font-mono truncate">
                    📄 {macro.definedIn}:{macro.line}
                  </p>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

// 카테고리별 테두리 색상
function getCategoryBorderColor(category?: ResolvedMacro['category']): string {
  switch (category) {
    case 'dt-bindings': return 'border-purple-500/30'
    case 'pinctrl': return 'border-orange-500/30'
    case 'gpio': return 'border-green-500/30'
    case 'clock': return 'border-cyan-500/30'
    case 'interrupt': return 'border-red-500/30'
    default: return 'border-ide-border'
  }
}

// 카테고리별 배지 색상
function getCategoryBadgeColor(category?: ResolvedMacro['category']): string {
  switch (category) {
    case 'dt-bindings': return 'bg-purple-500/30 text-purple-400'
    case 'pinctrl': return 'bg-orange-500/30 text-orange-400'
    case 'gpio': return 'bg-green-500/30 text-green-400'
    case 'clock': return 'bg-cyan-500/30 text-cyan-400'
    case 'interrupt': return 'bg-red-500/30 text-red-400'
    default: return 'bg-ide-hover text-ide-text-muted'
  }
}
