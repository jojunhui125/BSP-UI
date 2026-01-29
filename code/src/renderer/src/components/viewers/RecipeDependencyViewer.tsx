/**
 * 레시피 의존성 뷰어
 * BitBake 레시피의 DEPENDS/RDEPENDS를 시각화
 */

import { useState, useMemo } from 'react'

interface Dependency {
  name: string
  type: 'build' | 'runtime' | 'provides' | 'recommends'
  version?: string
  line: number
}

interface RecipeDependencyViewerProps {
  content: string
  filePath: string
  onNavigateToLine: (line: number) => void
}

export function RecipeDependencyViewer({ content, filePath, onNavigateToLine }: RecipeDependencyViewerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list')

  // 의존성 파싱
  const dependencies = useMemo(() => parseDependencies(content), [content])

  // 필터링
  const filteredDeps = useMemo(() => {
    let deps = dependencies
    
    if (selectedType) {
      deps = deps.filter(d => d.type === selectedType)
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      deps = deps.filter(d => d.name.toLowerCase().includes(query))
    }
    
    return deps
  }, [dependencies, selectedType, searchQuery])

  // 타입별 개수
  const counts = useMemo(() => ({
    build: dependencies.filter(d => d.type === 'build').length,
    runtime: dependencies.filter(d => d.type === 'runtime').length,
    provides: dependencies.filter(d => d.type === 'provides').length,
    recommends: dependencies.filter(d => d.type === 'recommends').length,
  }), [dependencies])

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="p-2 bg-ide-sidebar border-b border-ide-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ide-text">🔗 의존성</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 text-xs rounded ${viewMode === 'list' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
            >
              📋 목록
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={`px-2 py-1 text-xs rounded ${viewMode === 'graph' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
            >
              🕸️ 그래프
            </button>
          </div>
        </div>
        
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 패키지 검색..."
          className="w-full px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text focus:border-ide-accent outline-none"
        />
      </div>

      {/* 타입 필터 */}
      <div className="flex flex-wrap gap-1 p-2 bg-ide-bg border-b border-ide-border">
        <button
          onClick={() => setSelectedType(null)}
          className={`px-2 py-1 text-xs rounded ${!selectedType ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
        >
          전체 ({dependencies.length})
        </button>
        <button
          onClick={() => setSelectedType('build')}
          className={`px-2 py-1 text-xs rounded ${selectedType === 'build' ? 'bg-orange-500 text-white' : 'bg-orange-500/20 text-orange-400'}`}
        >
          🔨 빌드 ({counts.build})
        </button>
        <button
          onClick={() => setSelectedType('runtime')}
          className={`px-2 py-1 text-xs rounded ${selectedType === 'runtime' ? 'bg-green-500 text-white' : 'bg-green-500/20 text-green-400'}`}
        >
          ▶️ 런타임 ({counts.runtime})
        </button>
        <button
          onClick={() => setSelectedType('provides')}
          className={`px-2 py-1 text-xs rounded ${selectedType === 'provides' ? 'bg-blue-500 text-white' : 'bg-blue-500/20 text-blue-400'}`}
        >
          📦 제공 ({counts.provides})
        </button>
        <button
          onClick={() => setSelectedType('recommends')}
          className={`px-2 py-1 text-xs rounded ${selectedType === 'recommends' ? 'bg-purple-500 text-white' : 'bg-purple-500/20 text-purple-400'}`}
        >
          💡 권장 ({counts.recommends})
        </button>
      </div>

      {/* 메인 뷰 */}
      <div className="flex-1 overflow-auto p-2">
        {filteredDeps.length === 0 ? (
          <div className="text-center text-ide-text-muted py-8">
            <p className="text-4xl mb-2">🔗</p>
            <p>의존성 정보가 없습니다</p>
            <p className="text-xs mt-1">DEPENDS, RDEPENDS 등의 변수를 찾을 수 없습니다</p>
          </div>
        ) : viewMode === 'list' ? (
          <DependencyList deps={filteredDeps} onNavigateToLine={onNavigateToLine} />
        ) : (
          <DependencyGraph deps={filteredDeps} onNavigateToLine={onNavigateToLine} fileName={filePath.split('/').pop() || ''} />
        )}
      </div>
    </div>
  )
}

// 목록 뷰
interface DependencyListProps {
  deps: Dependency[]
  onNavigateToLine: (line: number) => void
}

function DependencyList({ deps, onNavigateToLine }: DependencyListProps) {
  // 타입별로 그룹화
  const grouped = deps.reduce((acc, dep) => {
    if (!acc[dep.type]) acc[dep.type] = []
    acc[dep.type].push(dep)
    return acc
  }, {} as Record<string, Dependency[]>)

  const typeInfo = {
    build: { label: '🔨 빌드 의존성 (DEPENDS)', color: 'orange' },
    runtime: { label: '▶️ 런타임 의존성 (RDEPENDS)', color: 'green' },
    provides: { label: '📦 제공 (PROVIDES)', color: 'blue' },
    recommends: { label: '💡 권장 (RRECOMMENDS)', color: 'purple' },
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([type, typeDeps]) => (
        <div key={type} className="bg-ide-bg rounded border border-ide-border p-3">
          <h4 className={`text-sm font-semibold mb-2 text-${typeInfo[type as keyof typeof typeInfo]?.color}-400`}>
            {typeInfo[type as keyof typeof typeInfo]?.label || type}
          </h4>
          <div className="flex flex-wrap gap-2">
            {typeDeps.map((dep, index) => (
              <button
                key={index}
                onClick={() => onNavigateToLine(dep.line)}
                className={`
                  px-2 py-1 text-xs rounded font-mono
                  bg-${typeInfo[type as keyof typeof typeInfo]?.color}-500/20
                  text-${typeInfo[type as keyof typeof typeInfo]?.color}-400
                  hover:bg-${typeInfo[type as keyof typeof typeInfo]?.color}-500/30
                  transition-colors
                `}
                title={`행 ${dep.line}${dep.version ? ` | 버전: ${dep.version}` : ''}`}
              >
                {dep.name}
                {dep.version && <span className="text-ide-text-muted ml-1">({dep.version})</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// 그래프 뷰 (간단한 방사형)
interface DependencyGraphProps {
  deps: Dependency[]
  onNavigateToLine: (line: number) => void
  fileName: string
}

function DependencyGraph({ deps, onNavigateToLine, fileName }: DependencyGraphProps) {
  const typeColors = {
    build: { bg: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500' },
    runtime: { bg: 'bg-green-500', text: 'text-green-400', border: 'border-green-500' },
    provides: { bg: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500' },
    recommends: { bg: 'bg-purple-500', text: 'text-purple-400', border: 'border-purple-500' },
  }

  // 타입별로 그룹화
  const grouped = deps.reduce((acc, dep) => {
    if (!acc[dep.type]) acc[dep.type] = []
    acc[dep.type].push(dep)
    return acc
  }, {} as Record<string, Dependency[]>)

  return (
    <div className="relative w-full h-full min-h-[400px] flex items-center justify-center">
      {/* 중앙 노드 */}
      <div className="absolute z-10 px-4 py-2 bg-ide-accent text-white rounded-lg shadow-lg text-sm font-semibold">
        📦 {fileName.replace(/\.(bb|bbappend|inc)$/, '')}
      </div>

      {/* 의존성 노드들 - 방사형 배치 */}
      {Object.entries(grouped).map(([type, typeDeps], typeIndex) => {
        const totalTypes = Object.keys(grouped).length
        const baseAngle = (typeIndex / totalTypes) * 360
        const colors = typeColors[type as keyof typeof typeColors] || typeColors.build
        
        return typeDeps.map((dep, depIndex) => {
          const angle = baseAngle + (depIndex / typeDeps.length) * (360 / totalTypes) - 45
          const radius = 120 + (depIndex % 3) * 40
          const x = Math.cos((angle * Math.PI) / 180) * radius
          const y = Math.sin((angle * Math.PI) / 180) * radius

          return (
            <div
              key={`${type}-${dep.name}`}
              onClick={() => onNavigateToLine(dep.line)}
              className={`
                absolute cursor-pointer transform -translate-x-1/2 -translate-y-1/2
                px-2 py-1 text-xs rounded border-2 ${colors.border}
                bg-ide-bg ${colors.text}
                hover:scale-110 transition-transform
                max-w-[100px] truncate
              `}
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
              }}
              title={`${dep.name} (${type})\n행 ${dep.line}`}
            >
              {dep.name}
            </div>
          )
        })
      })}

      {/* 연결선 (SVG) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        <defs>
          <marker id="arrow-orange" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#f97316" />
          </marker>
          <marker id="arrow-green" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#22c55e" />
          </marker>
        </defs>
        
        {Object.entries(grouped).map(([type, typeDeps], typeIndex) => {
          const totalTypes = Object.keys(grouped).length
          const baseAngle = (typeIndex / totalTypes) * 360
          const color = type === 'build' ? '#f97316' : type === 'runtime' ? '#22c55e' : type === 'provides' ? '#3b82f6' : '#a855f7'
          
          return typeDeps.slice(0, 10).map((dep, depIndex) => {
            const angle = baseAngle + (depIndex / typeDeps.length) * (360 / totalTypes) - 45
            const radius = 120 + (depIndex % 3) * 40
            const x = Math.cos((angle * Math.PI) / 180) * (radius - 30)
            const y = Math.sin((angle * Math.PI) / 180) * (radius - 30)

            return (
              <line
                key={`line-${type}-${dep.name}`}
                x1="50%"
                y1="50%"
                x2={`calc(50% + ${x}px)`}
                y2={`calc(50% + ${y}px)`}
                stroke={color}
                strokeWidth="1"
                strokeOpacity="0.5"
                strokeDasharray={type === 'recommends' ? '4,4' : undefined}
              />
            )
          })
        })}
      </svg>

      {/* 범례 */}
      <div className="absolute bottom-2 left-2 bg-ide-sidebar rounded border border-ide-border p-2 text-xs">
        <div className="flex flex-wrap gap-2">
          <span className="text-orange-400">■ 빌드</span>
          <span className="text-green-400">■ 런타임</span>
          <span className="text-blue-400">■ 제공</span>
          <span className="text-purple-400">■ 권장</span>
        </div>
      </div>
    </div>
  )
}

// 의존성 파싱
function parseDependencies(content: string): Dependency[] {
  const deps: Dependency[] = []
  const lines = content.split('\n')
  
  const varPatterns = [
    { var: 'DEPENDS', type: 'build' as const },
    { var: 'RDEPENDS', type: 'runtime' as const },
    { var: 'RDEPENDS_\\${PN}', type: 'runtime' as const },
    { var: 'PROVIDES', type: 'provides' as const },
    { var: 'RPROVIDES', type: 'provides' as const },
    { var: 'RRECOMMENDS', type: 'recommends' as const },
    { var: 'RRECOMMENDS_\\${PN}', type: 'recommends' as const },
    { var: 'RSUGGESTS', type: 'recommends' as const },
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNum = i + 1

    // 주석 스킵
    if (line.startsWith('#') || !line) continue

    for (const { var: varName, type } of varPatterns) {
      const pattern = new RegExp(`^${varName}[^=]*[=+]\\s*["']?(.*)["']?$`)
      const match = line.match(pattern)
      
      if (match) {
        const value = match[1]
        
        // 멀티라인 처리
        let fullValue = value.replace(/\\$/, '')
        let j = i + 1
        while (j < lines.length && lines[j - 1].trimEnd().endsWith('\\')) {
          fullValue += ' ' + lines[j].trim().replace(/\\$/, '')
          j++
        }
        
        // 패키지 추출
        const packages = fullValue
          .split(/\s+/)
          .filter(p => p && !p.startsWith('$') && !p.startsWith('"') && !p.startsWith("'"))
          .map(p => p.replace(/["']/g, ''))
        
        for (const pkg of packages) {
          // 버전 조건 파싱
          const versionMatch = pkg.match(/^([a-zA-Z0-9_-]+)\s*\(([<>=!]+)\s*([\d.]+)\)$/)
          if (versionMatch) {
            deps.push({
              name: versionMatch[1],
              type,
              version: `${versionMatch[2]} ${versionMatch[3]}`,
              line: lineNum,
            })
          } else if (pkg && !pkg.includes('(') && !pkg.includes(')')) {
            deps.push({
              name: pkg,
              type,
              line: lineNum,
            })
          }
        }
      }
    }
  }

  // 중복 제거 및 정렬
  const unique = deps.reduce((acc, dep) => {
    const key = `${dep.name}-${dep.type}`
    if (!acc.has(key)) {
      acc.set(key, dep)
    }
    return acc
  }, new Map<string, Dependency>())

  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name))
}
