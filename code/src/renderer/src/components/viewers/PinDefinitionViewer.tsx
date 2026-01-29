/**
 * 핀 정의 뷰어
 * C 헤더 파일의 #define 매크로에서 핀 정의를 추출하여 시각화
 * (pinctrl.h, gpio.h, mux.h 등)
 */

import { useState, useMemo } from 'react'

interface PinDefinition {
  name: string
  value: string | number
  port?: string      // PA, PB, PC 등
  pin?: number       // 0, 1, 2 등
  function?: string  // GPIO, UART, SPI 등
  line: number
  comment?: string
}

interface PinGroup {
  name: string
  pins: PinDefinition[]
}

interface PinDefinitionViewerProps {
  content: string
  filePath: string
  onNavigateToLine: (line: number) => void
}

export function PinDefinitionViewer({ content, filePath, onNavigateToLine }: PinDefinitionViewerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')

  // 핀 정의 파싱
  const { definitions, groups } = useMemo(() => parseHeaderFile(content), [content])

  // 필터링
  const filteredDefs = useMemo(() => {
    let defs = definitions
    
    if (selectedGroup) {
      const group = groups.find(g => g.name === selectedGroup)
      if (group) {
        defs = group.pins
      }
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      defs = defs.filter(d => 
        d.name.toLowerCase().includes(query) ||
        d.function?.toLowerCase().includes(query) ||
        d.port?.toLowerCase().includes(query)
      )
    }
    
    return defs
  }, [definitions, groups, selectedGroup, searchQuery])

  // 통계
  const stats = useMemo(() => {
    const functions = new Map<string, number>()
    definitions.forEach(d => {
      if (d.function) {
        functions.set(d.function, (functions.get(d.function) || 0) + 1)
      }
    })
    return {
      total: definitions.length,
      functions: Array.from(functions.entries()).sort((a, b) => b[1] - a[1]),
    }
  }, [definitions])

  return (
    <div className="flex flex-col h-full bg-ide-bg">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-2 bg-ide-sidebar border-b border-ide-border">
        <h3 className="text-sm font-semibold text-ide-text">📌 핀 정의</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('table')}
            className={`px-2 py-1 text-xs rounded ${viewMode === 'table' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
          >
            📋 테이블
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2 py-1 text-xs rounded ${viewMode === 'grid' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
          >
            🎨 그리드
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div className="p-2 border-b border-ide-border">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 핀 이름/기능 검색..."
          className="w-full px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text focus:border-ide-accent outline-none font-mono"
        />
      </div>

      {/* 그룹 필터 */}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-1 p-2 bg-ide-sidebar border-b border-ide-border">
          <button
            onClick={() => setSelectedGroup(null)}
            className={`px-2 py-1 text-xs rounded ${!selectedGroup ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
          >
            전체 ({definitions.length})
          </button>
          {groups.slice(0, 10).map(group => (
            <button
              key={group.name}
              onClick={() => setSelectedGroup(group.name)}
              className={`px-2 py-1 text-xs rounded font-mono ${selectedGroup === group.name ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
            >
              {group.name} ({group.pins.length})
            </button>
          ))}
          {groups.length > 10 && (
            <span className="px-2 py-1 text-xs text-ide-text-muted">+{groups.length - 10} more</span>
          )}
        </div>
      )}

      {/* 통계 */}
      <div className="grid grid-cols-4 gap-2 p-2 bg-ide-bg border-b border-ide-border text-center text-xs">
        <div>
          <p className="text-ide-text-muted">총 정의</p>
          <p className="text-lg font-bold text-ide-text">{stats.total}</p>
        </div>
        {stats.functions.slice(0, 3).map(([func, count]) => (
          <div key={func}>
            <p className="text-ide-text-muted truncate" title={func}>{func}</p>
            <p className="text-lg font-bold text-ide-accent">{count}</p>
          </div>
        ))}
      </div>

      {/* 메인 뷰 */}
      <div className="flex-1 overflow-auto p-2">
        {filteredDefs.length === 0 ? (
          <div className="text-center text-ide-text-muted py-8">
            <p className="text-4xl mb-2">📌</p>
            <p>핀 정의를 찾을 수 없습니다</p>
            <p className="text-xs mt-1">#define 매크로를 파싱합니다</p>
          </div>
        ) : viewMode === 'table' ? (
          <PinTable pins={filteredDefs} onNavigateToLine={onNavigateToLine} />
        ) : (
          <PinGrid pins={filteredDefs} onNavigateToLine={onNavigateToLine} />
        )}
      </div>
    </div>
  )
}

// 테이블 뷰
function PinTable({ pins, onNavigateToLine }: { pins: PinDefinition[], onNavigateToLine: (line: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-ide-sidebar sticky top-0">
          <tr>
            <th className="p-2 text-left text-ide-text-muted">이름</th>
            <th className="p-2 text-left text-ide-text-muted">값</th>
            <th className="p-2 text-left text-ide-text-muted">포트</th>
            <th className="p-2 text-left text-ide-text-muted">핀</th>
            <th className="p-2 text-left text-ide-text-muted">기능</th>
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
              <td className="p-2 font-mono text-ide-accent">{pin.name}</td>
              <td className="p-2 font-mono text-green-400">{pin.value}</td>
              <td className="p-2 font-mono text-purple-400">{pin.port || '-'}</td>
              <td className="p-2 font-mono text-cyan-400">{pin.pin !== undefined ? pin.pin : '-'}</td>
              <td className="p-2">
                {pin.function && (
                  <span className={`px-1 rounded ${getFunctionColor(pin.function)}`}>
                    {pin.function}
                  </span>
                )}
              </td>
              <td className="p-2 text-ide-text-muted">{pin.line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 그리드 뷰 (포트별로 그룹화)
function PinGrid({ pins, onNavigateToLine }: { pins: PinDefinition[], onNavigateToLine: (line: number) => void }) {
  // 포트별로 그룹화
  const byPort = pins.reduce((acc, pin) => {
    const port = pin.port || 'Other'
    if (!acc[port]) acc[port] = []
    acc[port].push(pin)
    return acc
  }, {} as Record<string, PinDefinition[]>)

  return (
    <div className="space-y-4">
      {Object.entries(byPort).map(([port, portPins]) => (
        <div key={port} className="bg-ide-sidebar rounded border border-ide-border p-3">
          <h4 className="text-sm font-mono font-semibold text-purple-400 mb-3">
            📍 Port {port}
          </h4>
          <div className="grid grid-cols-8 gap-1">
            {portPins.map((pin, index) => (
              <button
                key={index}
                onClick={() => onNavigateToLine(pin.line)}
                className={`
                  p-2 rounded text-xs font-mono
                  ${getFunctionBgColor(pin.function)}
                  hover:ring-2 ring-ide-accent cursor-pointer
                `}
                title={`${pin.name}\n값: ${pin.value}${pin.comment ? '\n' + pin.comment : ''}`}
              >
                <div className="font-bold">{pin.pin !== undefined ? pin.pin : index}</div>
                <div className="text-[9px] truncate">{pin.function || ''}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// 헤더 파일 파싱
function parseHeaderFile(content: string): { definitions: PinDefinition[], groups: PinGroup[] } {
  const definitions: PinDefinition[] = []
  const lines = content.split('\n')
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1
    
    // #define 파싱
    const defineMatch = line.match(/^\s*#define\s+(\w+)\s+(.+?)(?:\s*\/\*(.+?)\*\/|\s*\/\/(.+))?$/)
    if (defineMatch) {
      const [, name, valueStr, comment1, comment2] = defineMatch
      const comment = (comment1 || comment2)?.trim()
      
      // 값 파싱 (숫자 또는 표현식)
      let value: string | number = valueStr.trim()
      const numMatch = value.match(/^(?:0x)?([0-9a-fA-F]+)$/)
      if (numMatch) {
        value = parseInt(value, value.startsWith('0x') ? 16 : 10)
      }
      
      // 핀 정보 추출 시도
      const pinInfo = extractPinInfo(name)
      
      definitions.push({
        name,
        value,
        ...pinInfo,
        line: lineNum,
        comment,
      })
    }
  }

  // 그룹화 (접두사 기반)
  const groupMap = new Map<string, PinDefinition[]>()
  definitions.forEach(def => {
    // 접두사 추출 (예: S32G_MSCR -> S32G, PINCTRL_PIN -> PINCTRL)
    const prefixMatch = def.name.match(/^([A-Z0-9]+_[A-Z0-9]+)/)
    if (prefixMatch) {
      const prefix = prefixMatch[1]
      if (!groupMap.has(prefix)) {
        groupMap.set(prefix, [])
      }
      groupMap.get(prefix)!.push(def)
    }
  })

  const groups: PinGroup[] = Array.from(groupMap.entries())
    .filter(([, pins]) => pins.length >= 3)  // 3개 이상인 그룹만
    .map(([name, pins]) => ({ name, pins }))
    .sort((a, b) => b.pins.length - a.pins.length)

  return { definitions, groups }
}

// 핀 정보 추출
function extractPinInfo(name: string): Partial<PinDefinition> {
  const result: Partial<PinDefinition> = {}
  
  // 포트/핀 패턴들
  // PA_00, PA00, PA0, P_A_0
  let match = name.match(/P([A-Z])_?(\d+)/i)
  if (match) {
    result.port = match[1].toUpperCase()
    result.pin = parseInt(match[2])
  }
  
  // GPIO0_5, GPIO_0_5
  match = name.match(/GPIO_?(\d+)_?(\d+)/i)
  if (match) {
    result.port = `GPIO${match[1]}`
    result.pin = parseInt(match[2])
  }
  
  // 기능 추출
  const funcPatterns = [
    { pattern: /UART|SERIAL/i, func: 'UART' },
    { pattern: /SPI/i, func: 'SPI' },
    { pattern: /I2C|IIC/i, func: 'I2C' },
    { pattern: /GPIO/i, func: 'GPIO' },
    { pattern: /CAN/i, func: 'CAN' },
    { pattern: /ETH|GMAC|RGMII|MDIO/i, func: 'ETH' },
    { pattern: /USB/i, func: 'USB' },
    { pattern: /PWM/i, func: 'PWM' },
    { pattern: /ADC/i, func: 'ADC' },
    { pattern: /DAC/i, func: 'DAC' },
    { pattern: /SDMMC|MMC|SD/i, func: 'SDMMC' },
    { pattern: /QSPI|OSPI/i, func: 'QSPI' },
    { pattern: /JTAG|SWD/i, func: 'DEBUG' },
    { pattern: /CLK|CLOCK/i, func: 'CLK' },
    { pattern: /RESET|RST/i, func: 'RESET' },
    { pattern: /INT|IRQ/i, func: 'INT' },
    { pattern: /MSCR|MUX|PAD/i, func: 'MUX' },
  ]
  
  for (const { pattern, func } of funcPatterns) {
    if (pattern.test(name)) {
      result.function = func
      break
    }
  }
  
  return result
}

// 기능별 색상
function getFunctionColor(func?: string): string {
  const colors: Record<string, string> = {
    'UART': 'bg-blue-500/30 text-blue-400',
    'SPI': 'bg-purple-500/30 text-purple-400',
    'I2C': 'bg-green-500/30 text-green-400',
    'GPIO': 'bg-yellow-500/30 text-yellow-400',
    'CAN': 'bg-red-500/30 text-red-400',
    'ETH': 'bg-cyan-500/30 text-cyan-400',
    'USB': 'bg-pink-500/30 text-pink-400',
    'PWM': 'bg-orange-500/30 text-orange-400',
    'SDMMC': 'bg-indigo-500/30 text-indigo-400',
    'QSPI': 'bg-teal-500/30 text-teal-400',
    'DEBUG': 'bg-gray-500/30 text-gray-400',
    'MUX': 'bg-violet-500/30 text-violet-400',
  }
  return colors[func || ''] || 'bg-ide-hover text-ide-text'
}

function getFunctionBgColor(func?: string): string {
  const colors: Record<string, string> = {
    'UART': 'bg-blue-500/20 text-blue-400',
    'SPI': 'bg-purple-500/20 text-purple-400',
    'I2C': 'bg-green-500/20 text-green-400',
    'GPIO': 'bg-yellow-500/20 text-yellow-400',
    'CAN': 'bg-red-500/20 text-red-400',
    'ETH': 'bg-cyan-500/20 text-cyan-400',
    'USB': 'bg-pink-500/20 text-pink-400',
    'PWM': 'bg-orange-500/20 text-orange-400',
    'SDMMC': 'bg-indigo-500/20 text-indigo-400',
    'QSPI': 'bg-teal-500/20 text-teal-400',
    'DEBUG': 'bg-gray-500/20 text-gray-400',
    'MUX': 'bg-violet-500/20 text-violet-400',
  }
  return colors[func || ''] || 'bg-ide-hover text-ide-text-muted'
}
