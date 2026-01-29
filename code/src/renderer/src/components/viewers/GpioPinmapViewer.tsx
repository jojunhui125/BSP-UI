/**
 * GPIO/핀맵 뷰어
 * Device Tree에서 GPIO 설정을 추출하여 시각화
 */

import { useState, useMemo } from 'react'

interface GpioPin {
  controller: string
  pin: number
  label?: string
  direction?: 'in' | 'out' | 'inout'
  activeLevel?: 'high' | 'low'
  default?: boolean
  node: string
  property: string
  line: number
}

interface GpioPinmapViewerProps {
  content: string
  filePath: string
  onNavigateToLine: (line: number) => void
}

export function GpioPinmapViewer({ content, filePath, onNavigateToLine }: GpioPinmapViewerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedController, setSelectedController] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'visual'>('table')

  // GPIO 핀 파싱
  const gpioData = useMemo(() => parseGpioPins(content), [content])

  // 컨트롤러 목록
  const controllers = useMemo(() => 
    [...new Set(gpioData.pins.map(p => p.controller))].sort(),
    [gpioData.pins]
  )

  // 필터링
  const filteredPins = useMemo(() => {
    let pins = gpioData.pins
    
    if (selectedController) {
      pins = pins.filter(p => p.controller === selectedController)
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      pins = pins.filter(p => 
        p.label?.toLowerCase().includes(query) ||
        p.controller.toLowerCase().includes(query) ||
        p.node.toLowerCase().includes(query) ||
        p.property.toLowerCase().includes(query)
      )
    }
    
    return pins
  }, [gpioData.pins, selectedController, searchQuery])

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="p-2 bg-ide-sidebar border-b border-ide-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ide-text">📌 GPIO 핀맵</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 text-xs rounded ${viewMode === 'table' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
            >
              📋 테이블
            </button>
            <button
              onClick={() => setViewMode('visual')}
              className={`px-2 py-1 text-xs rounded ${viewMode === 'visual' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
            >
              🎨 시각화
            </button>
          </div>
        </div>
        
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 핀 검색..."
          className="w-full px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text focus:border-ide-accent outline-none"
        />
      </div>

      {/* 컨트롤러 필터 */}
      <div className="flex flex-wrap gap-1 p-2 bg-ide-bg border-b border-ide-border">
        <button
          onClick={() => setSelectedController(null)}
          className={`px-2 py-1 text-xs rounded ${!selectedController ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
        >
          전체 ({gpioData.pins.length})
        </button>
        {controllers.map(ctrl => (
          <button
            key={ctrl}
            onClick={() => setSelectedController(ctrl)}
            className={`px-2 py-1 text-xs rounded font-mono ${selectedController === ctrl ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
          >
            {ctrl} ({gpioData.pins.filter(p => p.controller === ctrl).length})
          </button>
        ))}
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-4 gap-2 p-2 bg-ide-sidebar border-b border-ide-border text-center text-xs">
        <div>
          <p className="text-ide-text-muted">총 핀</p>
          <p className="text-lg font-bold text-ide-text">{filteredPins.length}</p>
        </div>
        <div>
          <p className="text-ide-text-muted">출력</p>
          <p className="text-lg font-bold text-green-400">
            {filteredPins.filter(p => p.direction === 'out').length}
          </p>
        </div>
        <div>
          <p className="text-ide-text-muted">입력</p>
          <p className="text-lg font-bold text-blue-400">
            {filteredPins.filter(p => p.direction === 'in').length}
          </p>
        </div>
        <div>
          <p className="text-ide-text-muted">양방향</p>
          <p className="text-lg font-bold text-purple-400">
            {filteredPins.filter(p => !p.direction || p.direction === 'inout').length}
          </p>
        </div>
      </div>

      {/* 메인 뷰 */}
      <div className="flex-1 overflow-auto p-2">
        {filteredPins.length === 0 ? (
          <div className="text-center text-ide-text-muted py-8">
            <p className="text-4xl mb-2">📌</p>
            <p>GPIO 정보가 없습니다</p>
            <p className="text-xs mt-1">Device Tree 파일(.dts/.dtsi)에서 GPIO 속성을 찾을 수 없습니다</p>
          </div>
        ) : viewMode === 'table' ? (
          <GpioTable pins={filteredPins} onNavigateToLine={onNavigateToLine} />
        ) : (
          <GpioVisual pins={filteredPins} onNavigateToLine={onNavigateToLine} />
        )}
      </div>
    </div>
  )
}

// 테이블 뷰
interface GpioTableProps {
  pins: GpioPin[]
  onNavigateToLine: (line: number) => void
}

function GpioTable({ pins, onNavigateToLine }: GpioTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-ide-sidebar sticky top-0">
          <tr>
            <th className="p-2 text-left text-ide-text-muted">컨트롤러</th>
            <th className="p-2 text-left text-ide-text-muted">핀</th>
            <th className="p-2 text-left text-ide-text-muted">라벨</th>
            <th className="p-2 text-left text-ide-text-muted">방향</th>
            <th className="p-2 text-left text-ide-text-muted">활성 레벨</th>
            <th className="p-2 text-left text-ide-text-muted">노드</th>
            <th className="p-2 text-left text-ide-text-muted">행</th>
          </tr>
        </thead>
        <tbody>
          {pins.map((pin, index) => (
            <tr 
              key={index}
              onClick={() => onNavigateToLine(pin.line)}
              className="hover:bg-ide-hover cursor-pointer border-b border-ide-border"
            >
              <td className="p-2 font-mono text-purple-400">{pin.controller}</td>
              <td className="p-2 font-mono text-cyan-400">{pin.pin}</td>
              <td className="p-2 text-ide-text">{pin.label || '-'}</td>
              <td className="p-2">
                <DirectionBadge direction={pin.direction} />
              </td>
              <td className="p-2">
                <ActiveLevelBadge level={pin.activeLevel} />
              </td>
              <td className="p-2 font-mono text-ide-text-muted truncate max-w-[150px]" title={pin.node}>
                {pin.node}
              </td>
              <td className="p-2 text-ide-accent">{pin.line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 시각화 뷰
interface GpioVisualProps {
  pins: GpioPin[]
  onNavigateToLine: (line: number) => void
}

function GpioVisual({ pins, onNavigateToLine }: GpioVisualProps) {
  // 컨트롤러별로 그룹화
  const grouped = pins.reduce((acc, pin) => {
    if (!acc[pin.controller]) {
      acc[pin.controller] = []
    }
    acc[pin.controller].push(pin)
    return acc
  }, {} as Record<string, GpioPin[]>)

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([controller, controllerPins]) => (
        <div key={controller} className="bg-ide-bg rounded border border-ide-border p-3">
          <h4 className="text-sm font-mono font-semibold text-purple-400 mb-3">
            🎛️ {controller}
          </h4>
          
          {/* 핀 그리드 */}
          <div className="grid grid-cols-8 gap-1">
            {Array.from({ length: 32 }, (_, i) => {
              const pin = controllerPins.find(p => p.pin === i)
              return (
                <button
                  key={i}
                  onClick={() => pin && onNavigateToLine(pin.line)}
                  className={`
                    aspect-square flex flex-col items-center justify-center rounded text-xs
                    ${pin 
                      ? getDirectionStyle(pin.direction)
                      : 'bg-ide-hover text-ide-text-muted opacity-30'
                    }
                    ${pin ? 'cursor-pointer hover:ring-2 ring-ide-accent' : 'cursor-default'}
                  `}
                  title={pin ? `${pin.label || `GPIO${i}`}\n${pin.property}` : `GPIO${i} (미사용)`}
                >
                  <span className="font-mono font-bold">{i}</span>
                  {pin?.label && (
                    <span className="text-[8px] truncate max-w-full px-0.5">{pin.label}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* 범례 */}
          <div className="flex gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 bg-green-500/30 rounded"></span>
              <span className="text-ide-text-muted">출력</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 bg-blue-500/30 rounded"></span>
              <span className="text-ide-text-muted">입력</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 bg-purple-500/30 rounded"></span>
              <span className="text-ide-text-muted">양방향</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// 방향 배지
function DirectionBadge({ direction }: { direction?: 'in' | 'out' | 'inout' }) {
  if (!direction) return <span className="text-ide-text-muted">-</span>
  
  const styles = {
    in: 'bg-blue-500/30 text-blue-400',
    out: 'bg-green-500/30 text-green-400',
    inout: 'bg-purple-500/30 text-purple-400',
  }
  
  const labels = {
    in: '입력',
    out: '출력',
    inout: '양방향',
  }
  
  return (
    <span className={`px-1 rounded ${styles[direction]}`}>
      {labels[direction]}
    </span>
  )
}

// 활성 레벨 배지
function ActiveLevelBadge({ level }: { level?: 'high' | 'low' }) {
  if (!level) return <span className="text-ide-text-muted">-</span>
  
  return (
    <span className={`px-1 rounded ${level === 'high' ? 'bg-yellow-500/30 text-yellow-400' : 'bg-gray-500/30 text-gray-400'}`}>
      {level === 'high' ? 'HIGH' : 'LOW'}
    </span>
  )
}

// 방향에 따른 스타일
function getDirectionStyle(direction?: 'in' | 'out' | 'inout') {
  switch (direction) {
    case 'out': return 'bg-green-500/30 text-green-400'
    case 'in': return 'bg-blue-500/30 text-blue-400'
    default: return 'bg-purple-500/30 text-purple-400'
  }
}

// GPIO 핀 파싱
interface GpioParseResult {
  pins: GpioPin[]
  controllers: string[]
}

function parseGpioPins(content: string): GpioParseResult {
  const pins: GpioPin[] = []
  const lines = content.split('\n')
  
  let currentNode = ''
  let nodeStartLine = 0
  const nodeStack: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const lineNum = i + 1

    // 노드 시작
    const nodeMatch = trimmed.match(/^(?:(\w+)\s*:\s*)?(\w+[-\w]*)(?:@([0-9a-fA-F]+))?\s*\{/)
    if (nodeMatch) {
      const [, label, name] = nodeMatch
      nodeStack.push(currentNode)
      currentNode = label || name
      nodeStartLine = lineNum
      continue
    }

    // 노드 종료
    if (trimmed === '};' || trimmed === '}') {
      currentNode = nodeStack.pop() || ''
      continue
    }

    // GPIO 속성 패턴들
    
    // gpio = <&gpio0 5 GPIO_ACTIVE_HIGH>;
    const gpioMatch = trimmed.match(/^(\w*-?gpio[s]?)\s*=\s*<\s*&(\w+)\s+(\d+)\s*(?:(\d+|GPIO_\w+))?\s*(?:(\d+|GPIO_\w+))?\s*>/)
    if (gpioMatch) {
      const [, property, controller, pinStr, flags1, flags2] = gpioMatch
      const pin = parseInt(pinStr)
      
      let activeLevel: 'high' | 'low' | undefined
      let direction: 'in' | 'out' | undefined
      
      const flagsStr = `${flags1 || ''} ${flags2 || ''}`.toLowerCase()
      if (flagsStr.includes('active_low') || flagsStr.includes('0')) {
        activeLevel = 'low'
      } else if (flagsStr.includes('active_high') || flagsStr.includes('1')) {
        activeLevel = 'high'
      }
      
      if (property.includes('input')) direction = 'in'
      if (property.includes('output') || property.includes('enable') || property.includes('reset')) direction = 'out'
      
      pins.push({
        controller,
        pin,
        label: property.replace(/-?gpio[s]?$/, ''),
        direction,
        activeLevel,
        node: currentNode,
        property,
        line: lineNum,
      })
      continue
    }

    // gpios = <&gpio0 5 0>, <&gpio1 10 1>;
    const gpiosMatch = trimmed.match(/^(\w+)\s*=\s*(.+);$/)
    if (gpiosMatch && gpiosMatch[2].includes('&gpio')) {
      const [, property, value] = gpiosMatch
      
      // 여러 GPIO 참조 추출
      const refs = value.matchAll(/<\s*&(\w+)\s+(\d+)\s*(?:(\d+|GPIO_\w+))?\s*>/g)
      for (const ref of refs) {
        const [, controller, pinStr, flags] = ref
        const pin = parseInt(pinStr)
        
        let activeLevel: 'high' | 'low' | undefined
        if (flags) {
          const flagsLower = flags.toLowerCase()
          if (flagsLower.includes('low') || flags === '0') activeLevel = 'low'
          else if (flagsLower.includes('high') || flags === '1') activeLevel = 'high'
        }
        
        pins.push({
          controller,
          pin,
          label: currentNode,
          activeLevel,
          node: currentNode,
          property,
          line: lineNum,
        })
      }
    }
  }

  const controllers = [...new Set(pins.map(p => p.controller))].sort()

  return { pins, controllers }
}
