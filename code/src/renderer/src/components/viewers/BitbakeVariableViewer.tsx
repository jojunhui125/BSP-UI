/**
 * BitBake 변수 추적기
 * 레시피 파일에서 변수의 정의와 오버라이드를 추적
 */

import { useState, useMemo } from 'react'

interface VariableDefinition {
  name: string
  value: string
  operator: string  // =, ?=, ??=, :=, +=, .=, _append, _prepend
  line: number
  condition?: string  // _class-target, _pn-xxx 등
}

interface BitbakeVariableViewerProps {
  content: string
  filePath: string
  onNavigateToLine: (line: number) => void
}

// 주요 BitBake 변수 카테고리
const VARIABLE_CATEGORIES: Record<string, string[]> = {
  '📦 패키지 정보': ['PN', 'PV', 'PR', 'PF', 'SUMMARY', 'DESCRIPTION', 'HOMEPAGE', 'LICENSE', 'SECTION'],
  '📥 소스': ['SRC_URI', 'SRCREV', 'S', 'B', 'WORKDIR'],
  '🔗 의존성': ['DEPENDS', 'RDEPENDS', 'RRECOMMENDS', 'PROVIDES', 'RPROVIDES'],
  '📁 파일': ['FILES', 'FILESEXTRAPATHS', 'FILESPATH'],
  '⚙️ 빌드': ['EXTRA_OECONF', 'EXTRA_OECMAKE', 'EXTRA_OEMAKE', 'CFLAGS', 'LDFLAGS'],
  '🖥️ 머신/배포': ['MACHINE', 'DISTRO', 'DISTRO_FEATURES', 'MACHINE_FEATURES'],
  '📀 이미지': ['IMAGE_INSTALL', 'IMAGE_FEATURES', 'IMAGE_FSTYPES'],
  '🔧 기타': ['inherit', 'require', 'include', 'COMPATIBLE_MACHINE', 'BBCLASSEXTEND'],
}

export function BitbakeVariableViewer({ content, filePath, onNavigateToLine }: BitbakeVariableViewerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showAllVariables, setShowAllVariables] = useState(false)

  // 변수 파싱
  const variables = useMemo(() => parseVariables(content), [content])

  // 카테고리별 변수
  const categorizedVariables = useMemo(() => {
    const result: Record<string, VariableDefinition[]> = {}
    
    for (const [category, varNames] of Object.entries(VARIABLE_CATEGORIES)) {
      const categoryVars = variables.filter(v => 
        varNames.some(name => v.name.startsWith(name) || v.name === name)
      )
      if (categoryVars.length > 0) {
        result[category] = categoryVars
      }
    }

    // 기타 변수
    const knownVars = Object.values(VARIABLE_CATEGORIES).flat()
    const otherVars = variables.filter(v => 
      !knownVars.some(name => v.name.startsWith(name) || v.name === name)
    )
    if (otherVars.length > 0) {
      result['📝 사용자 정의'] = otherVars
    }

    return result
  }, [variables])

  // 검색 필터
  const filteredVariables = useMemo(() => {
    if (!searchQuery) return null
    const query = searchQuery.toLowerCase()
    return variables.filter(v => 
      v.name.toLowerCase().includes(query) ||
      v.value.toLowerCase().includes(query)
    )
  }, [variables, searchQuery])

  // 변수 클릭
  const handleVariableClick = (variable: VariableDefinition) => {
    onNavigateToLine(variable.line)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="p-2 bg-ide-sidebar border-b border-ide-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ide-text">📊 BitBake 변수</h3>
          <span className="text-xs text-ide-text-muted">총 {variables.length}개</span>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 변수명/값 검색..."
          className="w-full px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text focus:border-ide-accent outline-none"
        />
      </div>

      {/* 카테고리 탭 */}
      <div className="flex flex-wrap gap-1 p-2 bg-ide-bg border-b border-ide-border">
        <button
          onClick={() => { setSelectedCategory(null); setShowAllVariables(false) }}
          className={`px-2 py-1 text-xs rounded ${!selectedCategory && !showAllVariables ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
        >
          전체
        </button>
        {Object.keys(categorizedVariables).map(category => (
          <button
            key={category}
            onClick={() => { setSelectedCategory(category); setShowAllVariables(false) }}
            className={`px-2 py-1 text-xs rounded ${selectedCategory === category ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
          >
            {category.split(' ')[0]} {categorizedVariables[category].length}
          </button>
        ))}
      </div>

      {/* 변수 목록 */}
      <div className="flex-1 overflow-auto p-2">
        {filteredVariables ? (
          // 검색 결과
          <div>
            <p className="text-xs text-ide-text-muted mb-2">검색 결과: {filteredVariables.length}개</p>
            {filteredVariables.map((variable, index) => (
              <VariableItem
                key={`${variable.name}-${variable.line}-${index}`}
                variable={variable}
                onClick={() => handleVariableClick(variable)}
                highlight={searchQuery}
              />
            ))}
          </div>
        ) : selectedCategory ? (
          // 선택된 카테고리
          <div>
            <h4 className="text-sm font-semibold text-ide-text mb-2">{selectedCategory}</h4>
            {categorizedVariables[selectedCategory]?.map((variable, index) => (
              <VariableItem
                key={`${variable.name}-${variable.line}-${index}`}
                variable={variable}
                onClick={() => handleVariableClick(variable)}
              />
            ))}
          </div>
        ) : (
          // 전체 카테고리
          <div className="space-y-4">
            {Object.entries(categorizedVariables).map(([category, vars]) => (
              <div key={category}>
                <h4 className="text-sm font-semibold text-ide-text mb-2 sticky top-0 bg-ide-panel py-1">
                  {category} ({vars.length})
                </h4>
                {vars.map((variable, index) => (
                  <VariableItem
                    key={`${variable.name}-${variable.line}-${index}`}
                    variable={variable}
                    onClick={() => handleVariableClick(variable)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 통계 */}
      <div className="p-2 bg-ide-sidebar border-t border-ide-border">
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <p className="text-ide-text-muted">할당 (=)</p>
            <p className="text-ide-text font-mono">{variables.filter(v => v.operator === '=').length}</p>
          </div>
          <div>
            <p className="text-ide-text-muted">기본값 (?=)</p>
            <p className="text-ide-text font-mono">{variables.filter(v => v.operator === '?=').length}</p>
          </div>
          <div>
            <p className="text-ide-text-muted">추가 (+=)</p>
            <p className="text-ide-text font-mono">{variables.filter(v => v.operator === '+=' || v.operator.includes('append')).length}</p>
          </div>
          <div>
            <p className="text-ide-text-muted">조건부</p>
            <p className="text-ide-text font-mono">{variables.filter(v => v.condition).length}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// 변수 아이템 컴포넌트
interface VariableItemProps {
  variable: VariableDefinition
  onClick: () => void
  highlight?: string
}

function VariableItem({ variable, onClick, highlight }: VariableItemProps) {
  const [expanded, setExpanded] = useState(false)
  const isLongValue = variable.value.length > 80

  const highlightText = (text: string) => {
    if (!highlight) return text
    const index = text.toLowerCase().indexOf(highlight.toLowerCase())
    if (index === -1) return text
    return (
      <>
        {text.slice(0, index)}
        <span className="bg-yellow-500/50">{text.slice(index, index + highlight.length)}</span>
        {text.slice(index + highlight.length)}
      </>
    )
  }

  const getOperatorColor = () => {
    switch (variable.operator) {
      case '=': return 'text-green-400'
      case '?=': return 'text-yellow-400'
      case '??=': return 'text-yellow-600'
      case ':=': return 'text-cyan-400'
      case '+=': return 'text-blue-400'
      case '.=': return 'text-blue-400'
      default:
        if (variable.operator.includes('append')) return 'text-purple-400'
        if (variable.operator.includes('prepend')) return 'text-pink-400'
        return 'text-ide-text'
    }
  }

  return (
    <div
      className="p-2 mb-1 bg-ide-bg rounded border border-ide-border hover:border-ide-accent cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* 변수명 + 조건 */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-sm font-mono text-ide-accent font-semibold">
              {highlightText(variable.name)}
            </span>
            {variable.condition && (
              <span className="text-xs bg-purple-500/30 text-purple-400 px-1 rounded">
                {variable.condition}
              </span>
            )}
            <span className={`text-sm font-mono ${getOperatorColor()}`}>
              {variable.operator}
            </span>
          </div>

          {/* 값 */}
          <div className="mt-1">
            <pre
              className={`text-xs font-mono text-green-400 whitespace-pre-wrap break-all ${!expanded && isLongValue ? 'line-clamp-2' : ''}`}
            >
              {highlightText(variable.value || '(empty)')}
            </pre>
            {isLongValue && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                className="text-xs text-ide-accent hover:underline mt-1"
              >
                {expanded ? '접기' : '더보기'}
              </button>
            )}
          </div>
        </div>

        {/* 라인 번호 */}
        <span className="text-xs text-ide-text-muted ml-2">:{variable.line}</span>
      </div>
    </div>
  )
}

// 변수 파싱
function parseVariables(content: string): VariableDefinition[] {
  const variables: VariableDefinition[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const lineNum = i + 1

    // 주석 스킵
    if (trimmed.startsWith('#') || !trimmed) continue

    // 변수 할당 패턴들
    const patterns = [
      // VAR = "value"
      /^([A-Z_][A-Z0-9_]*)(\s*)(=|:=|\?=|\?\?=|\+=|\.=)\s*(.*)$/,
      // VAR_append = "value" 또는 VAR:append = "value"
      /^([A-Z_][A-Z0-9_]*)([:_](?:append|prepend|remove)(?:[:_]\w+)?)\s*(=)\s*(.*)$/,
      // VAR_class-target = "value"
      /^([A-Z_][A-Z0-9_]*)([:_][\w-]+)\s*(=|\?=)\s*(.*)$/,
    ]

    for (const pattern of patterns) {
      const match = trimmed.match(pattern)
      if (match) {
        const [, name, condOrSpace, operator, value] = match
        
        // 조건 추출
        let condition: string | undefined
        if (condOrSpace && condOrSpace.trim() && condOrSpace !== ' ') {
          condition = condOrSpace.replace(/^[:_]/, '')
        }

        // 멀티라인 값 처리
        let fullValue = value?.replace(/\\$/, '').trim() || ''
        let j = i + 1
        while (j < lines.length && lines[j - 1].trimEnd().endsWith('\\')) {
          fullValue += ' ' + lines[j].trim().replace(/\\$/, '')
          j++
        }

        // 따옴표 제거
        fullValue = fullValue.replace(/^["']|["']$/g, '')

        variables.push({
          name,
          value: fullValue,
          operator: condition && condition.includes('append') ? `_${condition}` : operator,
          line: lineNum,
          condition: condition && !condition.includes('append') && !condition.includes('prepend') ? condition : undefined,
        })
        break
      }
    }
  }

  return variables
}
