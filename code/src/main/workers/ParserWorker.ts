/**
 * 파서 워커 (Worker Thread)
 * CPU 집약적인 파싱 작업을 별도 스레드에서 처리
 */

import { parentPort, workerData } from 'worker_threads'

// 워커 타입
type WorkerTask = 
  | { type: 'parse-dts'; content: string; filePath: string }
  | { type: 'parse-header'; content: string; filePath: string }
  | { type: 'parse-bitbake'; content: string; filePath: string }
  | { type: 'extract-symbols'; content: string; filePath: string }

// DTS 파싱 결과
interface DtsParseResult {
  nodes: Array<{
    path: string
    name: string
    label?: string
    address?: string
    startLine: number
    endLine: number
    properties: Array<{ name: string; value: string; line: number }>
  }>
  includes: Array<{ path: string; type: string; line: number }>
  labels: Array<{ name: string; path: string; line: number }>
  gpioPins: Array<{
    controller: string
    pin: number
    label?: string
    function?: string
    line: number
  }>
}

// 헤더 파싱 결과
interface HeaderParseResult {
  defines: Array<{ name: string; value: string; line: number }>
  includes: Array<{ path: string; line: number }>
}

// BitBake 파싱 결과
interface BitbakeParseResult {
  variables: Array<{ name: string; value: string; operator: string; line: number }>
  includes: Array<{ path: string; type: string; line: number }>
  inherits: Array<{ className: string; line: number }>
}

/**
 * DTS 파일 파싱
 */
function parseDts(content: string): DtsParseResult {
  const result: DtsParseResult = {
    nodes: [],
    includes: [],
    labels: [],
    gpioPins: []
  }

  const lines = content.split('\n')
  const nodeStack: Array<{ name: string; path: string; startLine: number; properties: any[] }> = []
  let currentNode: typeof nodeStack[0] | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const lineNum = i + 1

    // 빈 줄, 주석 스킵
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue

    // #include
    let match = trimmed.match(/^#include\s*[<"]([^>"]+)[>"]/)
    if (match) {
      result.includes.push({ path: match[1], type: '#include', line: lineNum })
      continue
    }

    // /include/
    match = trimmed.match(/\/include\/\s*"([^"]+)"/)
    if (match) {
      result.includes.push({ path: match[1], type: '/include/', line: lineNum })
      continue
    }

    // 노드 시작
    match = trimmed.match(/^(?:(\w+)\s*:\s*)?(\w+[-\w]*)(?:@([0-9a-fA-F]+))?\s*\{/)
    if (match) {
      const [, label, name, address] = match
      const parentPath: string = currentNode?.path || ''
      const nodePath: string = parentPath ? `${parentPath}/${name}` : `/${name}`

      if (currentNode) {
        nodeStack.push(currentNode)
      }

      currentNode = {
        name,
        path: nodePath,
        startLine: lineNum,
        properties: []
      }

      if (label) {
        result.labels.push({ name: label, path: nodePath, line: lineNum })
      }

      continue
    }

    // 노드 종료
    if (trimmed === '};' || trimmed === '}') {
      if (currentNode) {
        result.nodes.push({
          path: currentNode.path,
          name: currentNode.name,
          startLine: currentNode.startLine,
          endLine: lineNum,
          properties: currentNode.properties
        })
        currentNode = nodeStack.pop() || null
      }
      continue
    }

    // 속성
    match = trimmed.match(/^([\w,#-]+)\s*(?:=\s*(.+?))?;$/)
    if (match && currentNode) {
      const [, propName, propValue] = match
      currentNode.properties.push({ name: propName, value: propValue || '', line: lineNum })

      // GPIO 파싱
      if (propValue && (propName.includes('gpio') || propName.includes('GPIO'))) {
        const gpioMatches = propValue.matchAll(/<\s*&(\w+)\s+(\d+)\s*(?:(\d+))?\s*>/g)
        for (const gpioMatch of gpioMatches) {
          const [, controller, pinStr] = gpioMatch
          result.gpioPins.push({
            controller,
            pin: parseInt(pinStr),
            label: propName.replace(/-?gpio[s]?$/i, ''),
            function: propName,
            line: lineNum
          })
        }
      }
    }
  }

  return result
}

/**
 * 헤더 파일 파싱
 */
function parseHeader(content: string): HeaderParseResult {
  const result: HeaderParseResult = {
    defines: [],
    includes: []
  }

  const lines = content.split('\n')
  let inMultilineDefine = false
  let currentDefine: { name: string; value: string; line: number } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const lineNum = i + 1

    // 멀티라인 #define 처리
    if (inMultilineDefine && currentDefine) {
      currentDefine.value += ' ' + trimmed.replace(/\\$/, '').trim()
      if (!line.trimEnd().endsWith('\\')) {
        result.defines.push(currentDefine)
        currentDefine = null
        inMultilineDefine = false
      }
      continue
    }

    // #include
    let match = trimmed.match(/^#include\s*[<"]([^>"]+)[>"]/)
    if (match) {
      result.includes.push({ path: match[1], line: lineNum })
      continue
    }

    // #define
    match = trimmed.match(/^#define\s+([A-Z_][A-Z0-9_]*)\s*(.*)$/)
    if (match) {
      const [, name, value] = match
      const cleanValue = value
        .replace(/\/\*.*?\*\//g, '')
        .replace(/\/\/.*$/, '')
        .replace(/\\$/, '')
        .trim()

      if (line.trimEnd().endsWith('\\')) {
        // 멀티라인 시작
        inMultilineDefine = true
        currentDefine = { name, value: cleanValue, line: lineNum }
      } else {
        result.defines.push({ name, value: cleanValue, line: lineNum })
      }
    }
  }

  return result
}

/**
 * BitBake 파일 파싱
 */
function parseBitbake(content: string): BitbakeParseResult {
  const result: BitbakeParseResult = {
    variables: [],
    includes: [],
    inherits: []
  }

  const lines = content.split('\n')
  let inMultilineValue = false
  let currentVar: { name: string; value: string; operator: string; line: number } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const lineNum = i + 1

    // 주석 스킵
    if (trimmed.startsWith('#')) continue

    // 멀티라인 값 처리
    if (inMultilineValue && currentVar) {
      currentVar.value += ' ' + trimmed.replace(/\\$/, '').trim()
      if (!line.trimEnd().endsWith('\\')) {
        result.variables.push(currentVar)
        currentVar = null
        inMultilineValue = false
      }
      continue
    }

    // require/include
    let match = trimmed.match(/^(require|include)\s+["']?([^"'\s]+)["']?/)
    if (match) {
      result.includes.push({ path: match[2], type: match[1], line: lineNum })
      continue
    }

    // inherit
    match = trimmed.match(/^inherit\s+(.+)/)
    if (match) {
      const classes = match[1].split(/\s+/).filter(c => c && !c.startsWith('$'))
      for (const cls of classes) {
        result.inherits.push({ className: cls, line: lineNum })
      }
      continue
    }

    // 변수 할당
    match = trimmed.match(/^([A-Z_][A-Z0-9_]*(?:_[a-z-]+)?)\s*(=|\?=|\?\?=|:=|\+=|\.=)\s*["']?(.*)["']?$/)
    if (match) {
      const [, name, operator, value] = match
      const cleanValue = value.replace(/["']$/, '').replace(/\\$/, '').trim()

      if (line.trimEnd().endsWith('\\')) {
        inMultilineValue = true
        currentVar = { name, value: cleanValue, operator, line: lineNum }
      } else {
        result.variables.push({ name, value: cleanValue, operator, line: lineNum })
      }
    }
  }

  return result
}

/**
 * 심볼 추출 (범용)
 */
function extractSymbols(content: string): Array<{ name: string; value: string; line: number; type: string }> {
  const symbols: Array<{ name: string; value: string; line: number; type: string }> = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1

    // #define
    let match = line.match(/^\s*#define\s+([A-Z_][A-Z0-9_]*)\s*(.*)$/)
    if (match) {
      symbols.push({
        name: match[1],
        value: match[2].replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '').trim(),
        line: lineNum,
        type: 'define'
      })
      continue
    }

    // BitBake 변수
    match = line.match(/^([A-Z_][A-Z0-9_]*)\s*[?:]?=\s*["']?(.*)["']?$/)
    if (match) {
      symbols.push({
        name: match[1],
        value: match[2].replace(/["']$/, ''),
        line: lineNum,
        type: 'variable'
      })
    }
  }

  return symbols
}

// 메시지 핸들러
if (parentPort) {
  parentPort.on('message', (task: WorkerTask) => {
    try {
      let result: any

      switch (task.type) {
        case 'parse-dts':
          result = parseDts(task.content)
          break
        case 'parse-header':
          result = parseHeader(task.content)
          break
        case 'parse-bitbake':
          result = parseBitbake(task.content)
          break
        case 'extract-symbols':
          result = extractSymbols(task.content)
          break
        default:
          throw new Error(`Unknown task type: ${(task as any).type}`)
      }

      parentPort!.postMessage({
        success: true,
        type: task.type,
        filePath: task.filePath,
        result
      })
    } catch (err: any) {
      parentPort!.postMessage({
        success: false,
        type: task.type,
        filePath: task.filePath,
        error: err.message
      })
    }
  })
}

export { parseDts, parseHeader, parseBitbake, extractSymbols }
export type { DtsParseResult, HeaderParseResult, BitbakeParseResult }
