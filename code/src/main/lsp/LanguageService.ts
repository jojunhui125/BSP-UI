/**
 * LSP (Language Server Protocol) 서비스
 * Go to Definition, Hover, Auto-complete 지원
 */

import { indexDb, SymbolRecord, DtNodeRecord } from '../database/IndexDatabase'
import { symbolCache, searchCache } from '../cache/LRUCache'
import { sshManager } from '../ssh/SshManager'

// LSP 타입 정의
export interface Position {
  line: number      // 0-based
  character: number // 0-based
}

export interface Range {
  start: Position
  end: Position
}

export interface Location {
  uri: string
  range: Range
}

export interface Hover {
  contents: {
    kind: 'markdown' | 'plaintext'
    value: string
  }
  range?: Range
}

export interface CompletionItem {
  label: string
  kind: CompletionItemKind
  detail?: string
  documentation?: string
  insertText?: string
  sortText?: string
}

export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25
}

export class LanguageService {
  private projectPath: string = ''

  /**
   * 프로젝트 경로 설정
   */
  setProjectPath(path: string): void {
    this.projectPath = path
  }

  /**
   * 커서 위치의 단어 추출 (개선됨)
   * phandle 참조(<&label>), &label, 일반 심볼 지원
   */
  private getWordAtPosition(content: string, position: Position): { word: string; range: Range; context?: string } | null {
    const lines = content.split('\n')
    if (position.line >= lines.length) return null

    const line = lines[position.line]
    const char = position.character

    // 1. phandle 참조 확인: <&label ...> 형태
    const phandleMatch = line.match(/<&(\w+)(?:\s+[^>]*)?>/)
    if (phandleMatch) {
      const matchStart = line.indexOf(phandleMatch[0])
      const labelStart = line.indexOf('&' + phandleMatch[1], matchStart)
      const labelEnd = labelStart + 1 + phandleMatch[1].length
      
      if (char >= labelStart && char <= labelEnd) {
        return {
          word: '&' + phandleMatch[1],
          range: {
            start: { line: position.line, character: labelStart },
            end: { line: position.line, character: labelEnd }
          },
          context: 'phandle'
        }
      }
    }

    // 단어 경계 찾기
    let start = char
    let end = char

    // 단어 시작 찾기 (& 포함)
    while (start > 0 && /[\w&]/.test(line[start - 1])) {
      start--
    }

    // 단어 끝 찾기
    while (end < line.length && /[\w]/.test(line[end])) {
      end++
    }

    if (start === end) return null

    const word = line.substring(start, end)
    
    // 컨텍스트 판단
    let context: string | undefined
    if (word.startsWith('&')) {
      context = 'label_ref'
    } else if (line.includes('#include') || line.includes('/include/') || line.includes('require') || line.includes('inherit')) {
      context = 'include'
    }
    
    return {
      word,
      range: {
        start: { line: position.line, character: start },
        end: { line: position.line, character: end }
      },
      context
    }
  }

  /**
   * Go to Definition (A-01 개선)
   * 지원: &label 참조, phandle 참조, 심볼(매크로/변수), include 파일
   */
  async getDefinition(
    filePath: string,
    content: string,
    position: Position
  ): Promise<Location | null> {
    const wordInfo = this.getWordAtPosition(content, position)
    if (!wordInfo) return null

    let { word, context } = wordInfo

    // 캐시 확인
    const cacheKey = `def:${word}`
    const cached = symbolCache.get(cacheKey)
    if (cached) {
      return cached as Location
    }

    // 1. &label 또는 phandle 참조 (Device Tree)
    if (word.startsWith('&') || context === 'phandle' || context === 'label_ref') {
      const label = word.startsWith('&') ? word.slice(1) : word
      
      // DT 노드에서 라벨로 찾기
      const node = indexDb.findDtNodeByLabel(label)
      if (node && node.file_path) {
        const location: Location = {
          uri: node.file_path,
          range: {
            start: { line: node.start_line - 1, character: 0 },
            end: { line: node.end_line - 1, character: 0 }
          }
        }
        symbolCache.set(cacheKey, location)
        return location
      }
      
      // 심볼에서 라벨 타입으로 찾기
      const labelSymbol = indexDb.findSymbol(label)
      if (labelSymbol && labelSymbol.type === 'label' && labelSymbol.file_path) {
        const location: Location = {
          uri: labelSymbol.file_path,
          range: {
            start: { line: labelSymbol.line - 1, character: 0 },
            end: { line: labelSymbol.line - 1, character: 0 }
          }
        }
        symbolCache.set(cacheKey, location)
        return location
      }
    }

    // 2. 심볼 검색 (매크로, 변수, 함수 등)
    const symbol = indexDb.findSymbol(word)
    if (symbol && symbol.file_path) {
      const location: Location = {
        uri: symbol.file_path,
        range: {
          start: { line: symbol.line - 1, character: 0 },
          end: { line: symbol.line - 1, character: 0 }
        }
      }
      symbolCache.set(cacheKey, location)
      return location
    }

    // 3. Include/Require 파일 (DTS, BitBake, C/H)
    const line = content.split('\n')[position.line]
    
    // C-style: #include <file.h> or #include "file.h"
    const cIncludeMatch = line.match(/#include\s*[<"]([^>"]+)[>"]/)
    if (cIncludeMatch) {
      const includePath = cIncludeMatch[1]
      return this.resolveIncludePath(filePath, includePath)
    }
    
    // DTS: /include/ "file.dtsi"
    const dtsIncludeMatch = line.match(/\/include\/\s*"([^"]+)"/)
    if (dtsIncludeMatch) {
      return this.resolveIncludePath(filePath, dtsIncludeMatch[1])
    }
    
    // BitBake: require/include xxx.bb
    const bbIncludeMatch = line.match(/(?:require|include)\s+([^\s]+)/)
    if (bbIncludeMatch) {
      return this.resolveIncludePath(filePath, bbIncludeMatch[1])
    }
    
    // BitBake: inherit xxx
    const inheritMatch = line.match(/inherit\s+([^\s]+)/)
    if (inheritMatch) {
      // inherit는 classes/ 폴더에서 .bbclass 파일 찾기
      const className = inheritMatch[1]
      // 프로젝트 루트에서 classes 폴더 검색 (간단 구현)
      return {
        uri: `${this.projectPath}/classes/${className}.bbclass`,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
      }
    }

    return null
  }

  /**
   * Include 경로 해석 (상대/절대)
   */
  private resolveIncludePath(currentFilePath: string, includePath: string): Location {
    let fullPath: string
    
    if (includePath.startsWith('/')) {
      // 절대 경로
      fullPath = includePath
    } else {
      // 상대 경로 - 현재 파일 기준
      const basePath = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
      fullPath = `${basePath}/${includePath}`
    }
    
    // 경로 정규화 (../ 처리)
    const parts = fullPath.split('/')
    const normalized: string[] = []
    for (const part of parts) {
      if (part === '..') {
        normalized.pop()
      } else if (part !== '.' && part !== '') {
        normalized.push(part)
      }
    }
    fullPath = '/' + normalized.join('/')
    
    return {
      uri: fullPath,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
    }
  }

  /**
   * Find All References (A-02 개선)
   * 심볼의 정의와 모든 사용 위치를 찾음
   */
  async getReferences(
    filePath: string,
    content: string,
    position: Position
  ): Promise<Location[]> {
    const wordInfo = this.getWordAtPosition(content, position)
    if (!wordInfo) return []

    const { word, context } = wordInfo
    const locations: Location[] = []
    const seenLocations = new Set<string>() // 중복 방지

    const addLocation = (loc: Location) => {
      const key = `${loc.uri}:${loc.range.start.line}`
      if (!seenLocations.has(key)) {
        seenLocations.add(key)
        locations.push(loc)
      }
    }

    // 1. &label 또는 phandle 참조 (Device Tree)
    if (word.startsWith('&') || context === 'phandle' || context === 'label_ref') {
      const label = word.startsWith('&') ? word.slice(1) : word
      
      // DT 노드에서 라벨 검색 (정의 + 참조)
      const dtNodes = indexDb.findDtLabelReferences(label, 100)
      for (const node of dtNodes) {
        if (node.file_path) {
          addLocation({
            uri: node.file_path,
            range: {
              start: { line: node.start_line - 1, character: 0 },
              end: { line: node.end_line - 1, character: 0 }
            }
          })
        }
      }
      
      // 심볼에서도 검색 (라벨 참조는 심볼로도 저장될 수 있음)
      const symbols = indexDb.findAllReferences(label, 100)
      for (const sym of symbols) {
        if (sym.file_path) {
          addLocation({
            uri: sym.file_path,
            range: {
              start: { line: sym.line - 1, character: 0 },
              end: { line: sym.line - 1, character: 0 }
            }
          })
        }
      }
      
      // &label 형태로도 검색
      const refSymbols = indexDb.findAllReferences('&' + label, 50)
      for (const sym of refSymbols) {
        if (sym.file_path) {
          addLocation({
            uri: sym.file_path,
            range: {
              start: { line: sym.line - 1, character: 0 },
              end: { line: sym.line - 1, character: 0 }
            }
          })
        }
      }
    } else {
      // 2. 일반 심볼 검색 (매크로, 변수, 함수 등)
      const symbols = indexDb.findAllReferences(word, 100)
      
      for (const sym of symbols) {
        if (sym.file_path) {
          addLocation({
            uri: sym.file_path,
            range: {
              start: { line: sym.line - 1, character: 0 },
              end: { line: sym.line - 1, character: 0 }
            }
          })
        }
      }
    }

    // 3. Include 파일에서 참조 찾기는 이미 findAllReferences에서 처리됨
    // (불필요한 중복 검색 제거)

    // 파일 경로 → 라인 순으로 정렬
    locations.sort((a, b) => {
      const pathCompare = a.uri.localeCompare(b.uri)
      if (pathCompare !== 0) return pathCompare
      return a.range.start.line - b.range.start.line
    })

    return locations
  }

  /**
   * Hover Information (A-05 개선)
   * 심볼 위에 마우스를 올리면 상세 정보 표시
   */
  async getHover(
    filePath: string,
    content: string,
    position: Position
  ): Promise<Hover | null> {
    const wordInfo = this.getWordAtPosition(content, position)
    if (!wordInfo) return null

    const { word, range, context } = wordInfo
    const line = content.split('\n')[position.line] || ''

    // 캐시 확인
    const cacheKey = `hover:${filePath}:${word}`
    const cached = symbolCache.get(cacheKey)
    if (cached) {
      return { ...(cached as Hover), range }
    }

    let hover: Hover | null = null

    // 1. &label 또는 phandle 참조 (Device Tree)
    if (word.startsWith('&') || context === 'phandle' || context === 'label_ref') {
      const label = word.startsWith('&') ? word.slice(1) : word
      const node = indexDb.findDtNodeByLabel(label)
      if (node) {
        hover = {
          contents: {
            kind: 'markdown',
            value: this.formatDtNodeHoverEnhanced(node)
          },
          range
        }
      }
    }

    // 2. DTS 속성 키워드 (compatible, reg, status 등)
    if (!hover) {
      const dtsPropInfo = this.getDtsPropertyInfo(word)
      if (dtsPropInfo) {
        hover = {
          contents: {
            kind: 'markdown',
            value: dtsPropInfo
          },
          range
        }
      }
    }

    // 3. 심볼 검색 (매크로, 변수, 함수)
    if (!hover) {
      const symbol = indexDb.findSymbol(word)
      if (symbol) {
        hover = {
          contents: {
            kind: 'markdown',
            value: this.formatSymbolHoverEnhanced(symbol)
          },
          range
        }
      }
    }

    // 4. BitBake 변수
    if (!hover) {
      const bbVarInfo = this.getBitbakeVariableInfo(word)
      if (bbVarInfo) {
        hover = {
          contents: {
            kind: 'markdown',
            value: bbVarInfo
          },
          range
        }
      }
    }

    // 5. GPIO 핀 검색
    if (!hover) {
      const gpioPins = indexDb.searchGpioPins(word)
      if (gpioPins.length > 0) {
        hover = {
          contents: {
            kind: 'markdown',
            value: this.formatGpioPinHover(gpioPins[0])
          },
          range
        }
      }
    }

    // 6. include 파일 경로
    if (!hover && (line.includes('#include') || line.includes('/include/') || line.includes('require'))) {
      const includeMatch = line.match(/["<]([^">]+)[">]/) || line.match(/(?:require|include)\s+(\S+)/)
      if (includeMatch) {
        const includePath = includeMatch[1]
        hover = {
          contents: {
            kind: 'markdown',
            value: `**Include 파일**\n\n\`${includePath}\`\n\n_Ctrl+클릭으로 파일 열기_`
          },
          range
        }
      }
    }

    if (hover) {
      symbolCache.set(cacheKey, hover)
    }

    return hover
  }

  /**
   * DTS 속성 정보 (Hover용)
   */
  private getDtsPropertyInfo(property: string): string | null {
    const dtsProperties: Record<string, { desc: string; example: string }> = {
      'compatible': {
        desc: '노드의 호환성 문자열. 드라이버 매칭에 사용됨',
        example: 'compatible = "vendor,device";'
      },
      'reg': {
        desc: '레지스터 주소와 크기 (address, size 쌍)',
        example: 'reg = <0x401C8000 0x1000>;'
      },
      'status': {
        desc: '노드 활성화 상태 (okay/disabled)',
        example: 'status = "okay";'
      },
      'interrupts': {
        desc: '인터럽트 번호와 타입 정의',
        example: 'interrupts = <GIC_SPI 82 IRQ_TYPE_LEVEL_HIGH>;'
      },
      'interrupt-parent': {
        desc: '인터럽트 컨트롤러 참조',
        example: 'interrupt-parent = <&gic>;'
      },
      'clocks': {
        desc: '클럭 소스 참조',
        example: 'clocks = <&clk_uart>;'
      },
      'clock-names': {
        desc: '클럭 이름 (clocks와 매칭)',
        example: 'clock-names = "ipg", "per";'
      },
      'pinctrl-0': {
        desc: '핀 컨트롤 상태 0 (기본 상태)',
        example: 'pinctrl-0 = <&uart0_pins>;'
      },
      'pinctrl-names': {
        desc: '핀 컨트롤 상태 이름',
        example: 'pinctrl-names = "default", "sleep";'
      },
      'dmas': {
        desc: 'DMA 채널 참조',
        example: 'dmas = <&dma0 1 2>;'
      },
      'dma-names': {
        desc: 'DMA 채널 이름',
        example: 'dma-names = "tx", "rx";'
      },
      '#address-cells': {
        desc: '자식 노드 주소 셀 개수',
        example: '#address-cells = <1>;'
      },
      '#size-cells': {
        desc: '자식 노드 크기 셀 개수',
        example: '#size-cells = <1>;'
      },
      '#interrupt-cells': {
        desc: '인터럽트 셀 개수',
        example: '#interrupt-cells = <3>;'
      },
      'interrupt-controller': {
        desc: '이 노드가 인터럽트 컨트롤러임을 표시',
        example: 'interrupt-controller;'
      },
      'gpio-controller': {
        desc: '이 노드가 GPIO 컨트롤러임을 표시',
        example: 'gpio-controller;'
      },
      '#gpio-cells': {
        desc: 'GPIO 셀 개수',
        example: '#gpio-cells = <2>;'
      },
    }

    const info = dtsProperties[property]
    if (!info) return null

    return `**${property}**\n\n${info.desc}\n\n\`\`\`dts\n${info.example}\n\`\`\``
  }

  /**
   * BitBake 변수 정보 (Hover용)
   */
  private getBitbakeVariableInfo(variable: string): string | null {
    const bbVariables: Record<string, { desc: string; example: string }> = {
      'SRC_URI': {
        desc: '소스 파일 위치 (URL, 로컬 파일 등)',
        example: 'SRC_URI = "git://github.com/...;branch=main"'
      },
      'SRCREV': {
        desc: 'Git 커밋 해시 또는 태그',
        example: 'SRCREV = "abc123..." 또는 SRCREV = "${AUTOREV}"'
      },
      'DEPENDS': {
        desc: '빌드 시 의존성 (컴파일 타임)',
        example: 'DEPENDS = "openssl zlib"'
      },
      'RDEPENDS': {
        desc: '런타임 의존성',
        example: 'RDEPENDS:${PN} = "libssl"'
      },
      'PROVIDES': {
        desc: '이 레시피가 제공하는 가상 패키지',
        example: 'PROVIDES = "virtual/kernel"'
      },
      'LICENSE': {
        desc: '소프트웨어 라이선스',
        example: 'LICENSE = "MIT"'
      },
      'LIC_FILES_CHKSUM': {
        desc: '라이선스 파일 체크섬',
        example: 'LIC_FILES_CHKSUM = "file://LICENSE;md5=..."'
      },
      'FILESEXTRAPATHS': {
        desc: 'bbappend에서 추가 파일 경로',
        example: 'FILESEXTRAPATHS:prepend := "${THISDIR}/files:"'
      },
      'IMAGE_INSTALL': {
        desc: '이미지에 설치할 패키지 목록',
        example: 'IMAGE_INSTALL:append = " my-package"'
      },
      'MACHINE': {
        desc: '타겟 머신 이름',
        example: 'MACHINE = "s32g274ardb2"'
      },
      'DISTRO': {
        desc: '배포판 이름',
        example: 'DISTRO = "poky"'
      },
      'DISTRO_FEATURES': {
        desc: '배포판 기능 플래그',
        example: 'DISTRO_FEATURES:append = " systemd"'
      },
      'MACHINE_FEATURES': {
        desc: '머신 기능 플래그',
        example: 'MACHINE_FEATURES = "usbhost vfat"'
      },
      'EXTRA_OECONF': {
        desc: 'configure 스크립트 추가 옵션',
        example: 'EXTRA_OECONF = "--enable-foo"'
      },
      'EXTRA_OECMAKE': {
        desc: 'CMake 추가 옵션',
        example: 'EXTRA_OECMAKE = "-DFOO=ON"'
      },
      'inherit': {
        desc: 'bbclass 상속',
        example: 'inherit cmake pkgconfig'
      },
      'require': {
        desc: '다른 레시피 파일 포함 (필수)',
        example: 'require recipes-kernel/linux/linux-common.inc'
      },
      'include': {
        desc: '다른 레시피 파일 포함 (선택)',
        example: 'include conf/machine/include/tune-cortexa53.inc'
      },
    }

    const info = bbVariables[variable]
    if (!info) return null

    return `**${variable}** _(BitBake)_\n\n${info.desc}\n\n\`\`\`bitbake\n${info.example}\n\`\`\``
  }

  /**
   * DT 노드 Hover 포맷 (개선)
   */
  private formatDtNodeHoverEnhanced(node: DtNodeRecord): string {
    let md = `**${node.label ? `&${node.label}` : node.name}**`
    
    if (node.address) {
      md += ` @ \`0x${node.address}\``
    }
    
    md += '\n\n---\n\n'
    
    // 노드 경로
    md += `📍 **경로**: \`${node.path}\`\n\n`
    
    // 파일 위치
    if (node.file_path) {
      const shortPath = node.file_path.replace(this.projectPath + '/', '')
      md += `📄 **파일**: \`${shortPath}:${node.start_line}\`\n\n`
    }
    
    // 참조 횟수
    if (node.label) {
      const refs = indexDb.findDtLabelReferences(node.label, 10)
      if (refs.length > 1) {
        md += `🔗 **참조**: ${refs.length}개 위치\n\n`
      }
    }
    
    md += '_Ctrl+클릭으로 정의 이동 | Shift+F12로 참조 찾기_'
    
    return md
  }

  /**
   * 심볼 Hover 포맷 (개선)
   */
  private formatSymbolHoverEnhanced(symbol: SymbolRecord): string {
    let md = `**${symbol.name}**`
    
    // 타입 배지
    const typeBadge: Record<string, string> = {
      'define': '📐 매크로',
      'variable': '📦 변수',
      'function': '⚡ 함수',
      'label': '🏷️ 라벨',
      'node': '🔷 노드',
    }
    md += ` _${typeBadge[symbol.type] || symbol.type}_\n\n---\n\n`
    
    // 값 표시
    if (symbol.value) {
      if (symbol.type === 'define') {
        md += `\`\`\`c\n#define ${symbol.name} ${symbol.value}\n\`\`\`\n\n`
      } else if (symbol.type === 'variable') {
        md += `\`\`\`bitbake\n${symbol.name} = "${symbol.value}"\n\`\`\`\n\n`
      } else {
        md += `**값**: \`${symbol.value}\`\n\n`
      }
    }
    
    // 파일 위치
    if (symbol.file_path) {
      const shortPath = symbol.file_path.replace(this.projectPath + '/', '')
      md += `📄 **정의**: \`${shortPath}:${symbol.line}\`\n\n`
    }
    
    md += '_Ctrl+클릭으로 정의 이동_'
    
    return md
  }

  /**
   * Auto-complete (A-03, A-04 개선)
   * Ctrl+Space 또는 타이핑 중 자동 제안
   */
  async getCompletions(
    filePath: string,
    content: string,
    position: Position
  ): Promise<CompletionItem[]> {
    const wordInfo = this.getWordAtPosition(content, position)
    const prefix = wordInfo?.word || ''
    const line = content.split('\n')[position.line] || ''
    const ext = filePath.split('.').pop()?.toLowerCase()

    // 최소 1글자부터 제안 (& 포함)
    if (prefix.length < 1) return []

    // 캐시 확인
    const cacheKey = `complete:${ext}:${prefix}`
    const cached = searchCache.get(cacheKey)
    if (cached) {
      return cached as CompletionItem[]
    }

    const items: CompletionItem[] = []
    const seenLabels = new Set<string>()

    // 파일 타입별 처리
    if (ext === 'dts' || ext === 'dtsi') {
      // === Device Tree 자동완성 ===
      
      // 1. &label 참조 제안 (phandle)
      if (prefix.startsWith('&') || line.includes('<&')) {
        const labelPrefix = prefix.startsWith('&') ? prefix.slice(1) : prefix
        const nodes = indexDb.searchDtNodes(labelPrefix, 30)
        
        for (const node of nodes) {
          if (node.label && !seenLabels.has(node.label)) {
            seenLabels.add(node.label)
            items.push({
              label: `&${node.label}`,
              kind: CompletionItemKind.Reference,
              detail: node.name + (node.address ? `@${node.address}` : ''),
              documentation: `📍 ${node.path}\n📄 ${node.file_path?.replace(this.projectPath + '/', '')}`,
              insertText: `&${node.label}`,
              sortText: '0' + node.label
            })
          }
        }
      }

      // 2. DTS 속성 제안
      const dtProps = this.getDtPropertySuggestionsEnhanced(prefix)
      items.push(...dtProps)

      // 3. status 값 제안
      if (line.includes('status') && line.includes('=')) {
        items.push(
          { label: 'okay', kind: CompletionItemKind.Value, detail: '노드 활성화', insertText: '"okay"', sortText: '0' },
          { label: 'disabled', kind: CompletionItemKind.Value, detail: '노드 비활성화', insertText: '"disabled"', sortText: '1' }
        )
      }

    } else if (ext === 'bb' || ext === 'bbappend' || ext === 'bbclass' || ext === 'conf' || ext === 'inc') {
      // === BitBake 자동완성 ===
      
      // 1. BitBake 변수 제안
      const bbVars = this.getBitbakeVariableSuggestionsEnhanced(prefix)
      items.push(...bbVars)

      // 2. 태스크 제안 (do_)
      if (prefix.startsWith('do_') || line.match(/addtask|deltask/)) {
        const tasks = this.getBitbakeTaskSuggestions(prefix)
        items.push(...tasks)
      }

      // 3. inherit 클래스 제안
      if (line.includes('inherit')) {
        const classes = this.getBitbakeClassSuggestions(prefix)
        items.push(...classes)
      }
    }

    // 공통: 인덱스된 심볼 검색 (최소 2글자)
    if (prefix.length >= 2) {
      const symbols = indexDb.searchSymbols(prefix, 15)
      for (const sym of symbols) {
        if (!seenLabels.has(sym.name)) {
          seenLabels.add(sym.name)
          items.push({
            label: sym.name,
            kind: this.getCompletionKind(sym.type),
            detail: sym.value ? `= ${sym.value.substring(0, 50)}` : sym.type,
            documentation: sym.file_path 
              ? `📄 ${sym.file_path.replace(this.projectPath + '/', '')}:${sym.line}`
              : undefined,
            insertText: sym.name,
            sortText: '2' + sym.name
          })
        }
      }
    }

    // 캐시 저장
    if (items.length > 0) {
      searchCache.set(cacheKey, items)
    }

    return items
  }

  /**
   * DTS 속성 제안 (개선)
   */
  private getDtPropertySuggestionsEnhanced(prefix: string): CompletionItem[] {
    const properties = [
      { name: 'compatible', detail: '호환성 문자열', snippet: 'compatible = "$1";' },
      { name: 'reg', detail: '레지스터 주소/크기', snippet: 'reg = <$1>;' },
      { name: 'status', detail: '노드 상태', snippet: 'status = "$1";' },
      { name: 'interrupts', detail: '인터럽트 정의', snippet: 'interrupts = <$1>;' },
      { name: 'interrupt-parent', detail: '인터럽트 컨트롤러', snippet: 'interrupt-parent = <&$1>;' },
      { name: 'clocks', detail: '클럭 참조', snippet: 'clocks = <&$1>;' },
      { name: 'clock-names', detail: '클럭 이름', snippet: 'clock-names = "$1";' },
      { name: 'pinctrl-0', detail: '핀 컨트롤 상태 0', snippet: 'pinctrl-0 = <&$1>;' },
      { name: 'pinctrl-names', detail: '핀 컨트롤 이름', snippet: 'pinctrl-names = "default";' },
      { name: 'dmas', detail: 'DMA 채널', snippet: 'dmas = <&$1>;' },
      { name: 'dma-names', detail: 'DMA 이름', snippet: 'dma-names = "$1";' },
      { name: '#address-cells', detail: '주소 셀 개수', snippet: '#address-cells = <$1>;' },
      { name: '#size-cells', detail: '크기 셀 개수', snippet: '#size-cells = <$1>;' },
      { name: '#interrupt-cells', detail: '인터럽트 셀 개수', snippet: '#interrupt-cells = <$1>;' },
      { name: 'interrupt-controller', detail: '인터럽트 컨트롤러 표시', snippet: 'interrupt-controller;' },
      { name: 'gpio-controller', detail: 'GPIO 컨트롤러 표시', snippet: 'gpio-controller;' },
      { name: '#gpio-cells', detail: 'GPIO 셀 개수', snippet: '#gpio-cells = <$1>;' },
      { name: 'label', detail: '노드 라벨', snippet: 'label = "$1";' },
    ]

    const lowerPrefix = prefix.toLowerCase()
    return properties
      .filter(p => p.name.toLowerCase().startsWith(lowerPrefix))
      .map(p => ({
        label: p.name,
        kind: CompletionItemKind.Property,
        detail: p.detail,
        insertText: p.snippet,
        sortText: '1' + p.name
      }))
  }

  /**
   * BitBake 변수 제안 (개선)
   */
  private getBitbakeVariableSuggestionsEnhanced(prefix: string): CompletionItem[] {
    const variables = [
      { name: 'SRC_URI', detail: '소스 URI', snippet: 'SRC_URI = "$1"' },
      { name: 'SRC_URI:append', detail: '소스 URI 추가', snippet: 'SRC_URI:append = " $1"' },
      { name: 'SRCREV', detail: 'Git 리비전', snippet: 'SRCREV = "$1"' },
      { name: 'DEPENDS', detail: '빌드 의존성', snippet: 'DEPENDS = "$1"' },
      { name: 'DEPENDS:append', detail: '빌드 의존성 추가', snippet: 'DEPENDS:append = " $1"' },
      { name: 'RDEPENDS:${PN}', detail: '런타임 의존성', snippet: 'RDEPENDS:\\${PN} = "$1"' },
      { name: 'PROVIDES', detail: '가상 패키지', snippet: 'PROVIDES = "$1"' },
      { name: 'LICENSE', detail: '라이선스', snippet: 'LICENSE = "$1"' },
      { name: 'LIC_FILES_CHKSUM', detail: '라이선스 체크섬', snippet: 'LIC_FILES_CHKSUM = "file://$1;md5=$2"' },
      { name: 'FILESEXTRAPATHS:prepend', detail: '추가 파일 경로', snippet: 'FILESEXTRAPATHS:prepend := "\\${THISDIR}/files:"' },
      { name: 'IMAGE_INSTALL:append', detail: '이미지 패키지 추가', snippet: 'IMAGE_INSTALL:append = " $1"' },
      { name: 'MACHINE_FEATURES', detail: '머신 기능', snippet: 'MACHINE_FEATURES = "$1"' },
      { name: 'DISTRO_FEATURES:append', detail: '배포판 기능 추가', snippet: 'DISTRO_FEATURES:append = " $1"' },
      { name: 'EXTRA_OECONF', detail: 'configure 옵션', snippet: 'EXTRA_OECONF = "$1"' },
      { name: 'EXTRA_OECMAKE', detail: 'CMake 옵션', snippet: 'EXTRA_OECMAKE = "$1"' },
      { name: 'COMPATIBLE_MACHINE', detail: '호환 머신', snippet: 'COMPATIBLE_MACHINE = "$1"' },
      { name: 'BBCLASSEXTEND', detail: '클래스 확장', snippet: 'BBCLASSEXTEND = "native nativesdk"' },
      { name: 'inherit', detail: '클래스 상속', snippet: 'inherit $1' },
      { name: 'require', detail: '파일 포함 (필수)', snippet: 'require $1' },
      { name: 'include', detail: '파일 포함 (선택)', snippet: 'include $1' },
    ]

    const lowerPrefix = prefix.toLowerCase()
    return variables
      .filter(v => v.name.toLowerCase().startsWith(lowerPrefix))
      .map(v => ({
        label: v.name,
        kind: CompletionItemKind.Variable,
        detail: v.detail,
        insertText: v.snippet,
        sortText: '1' + v.name
      }))
  }

  /**
   * BitBake 태스크 제안
   */
  private getBitbakeTaskSuggestions(prefix: string): CompletionItem[] {
    const tasks = [
      { name: 'do_fetch', detail: '소스 다운로드' },
      { name: 'do_unpack', detail: '소스 압축 해제' },
      { name: 'do_patch', detail: '패치 적용' },
      { name: 'do_configure', detail: '빌드 설정' },
      { name: 'do_compile', detail: '컴파일' },
      { name: 'do_install', detail: '설치' },
      { name: 'do_populate_sysroot', detail: 'sysroot 생성' },
      { name: 'do_package', detail: '패키지 생성' },
      { name: 'do_package_write_rpm', detail: 'RPM 패키지 생성' },
      { name: 'do_package_write_ipk', detail: 'IPK 패키지 생성' },
      { name: 'do_package_write_deb', detail: 'DEB 패키지 생성' },
      { name: 'do_build', detail: '전체 빌드' },
      { name: 'do_clean', detail: '빌드 결과 삭제' },
      { name: 'do_cleanall', detail: '모든 결과 삭제' },
      { name: 'do_cleansstate', detail: 'sstate 삭제' },
      { name: 'do_deploy', detail: '배포' },
    ]

    const lowerPrefix = prefix.toLowerCase()
    return tasks
      .filter(t => t.name.toLowerCase().startsWith(lowerPrefix))
      .map(t => ({
        label: t.name,
        kind: CompletionItemKind.Function,
        detail: t.detail,
        insertText: t.name,
        sortText: '1' + t.name
      }))
  }

  /**
   * BitBake 클래스 제안
   */
  private getBitbakeClassSuggestions(prefix: string): CompletionItem[] {
    const classes = [
      { name: 'cmake', detail: 'CMake 빌드' },
      { name: 'autotools', detail: 'Autotools 빌드' },
      { name: 'meson', detail: 'Meson 빌드' },
      { name: 'kernel', detail: '커널 빌드' },
      { name: 'kernel-yocto', detail: 'Yocto 커널' },
      { name: 'module', detail: '커널 모듈' },
      { name: 'image', detail: '이미지 빌드' },
      { name: 'core-image', detail: '코어 이미지' },
      { name: 'pkgconfig', detail: 'pkg-config 지원' },
      { name: 'python3native', detail: 'Python3 네이티브' },
      { name: 'systemd', detail: 'systemd 서비스' },
      { name: 'useradd', detail: '사용자 추가' },
      { name: 'update-rc.d', detail: 'SysV init 스크립트' },
      { name: 'native', detail: '네이티브 빌드' },
      { name: 'nativesdk', detail: 'SDK 빌드' },
      { name: 'cross', detail: '크로스 컴파일' },
      { name: 'devtool-source', detail: 'devtool 소스' },
      { name: 'externalsrc', detail: '외부 소스' },
    ]

    const lowerPrefix = prefix.toLowerCase()
    return classes
      .filter(c => c.name.toLowerCase().startsWith(lowerPrefix))
      .map(c => ({
        label: c.name,
        kind: CompletionItemKind.Class,
        detail: c.detail,
        insertText: c.name,
        sortText: '1' + c.name
      }))
  }

  /**
   * 심볼 타입에 따른 CompletionItemKind
   */
  private getCompletionKind(type: string): CompletionItemKind {
    switch (type) {
      case 'define': return CompletionItemKind.Constant
      case 'function': return CompletionItemKind.Function
      case 'variable': return CompletionItemKind.Variable
      case 'node': return CompletionItemKind.Struct
      case 'label': return CompletionItemKind.Reference
      default: return CompletionItemKind.Text
    }
  }


  /**
   * GPIO 핀 Hover 포맷
   */
  private formatGpioPinHover(pin: any): string {
    let md = `**GPIO Pin**\n\n`
    md += `| 속성 | 값 |\n|------|----|\n`
    md += `| 컨트롤러 | ${pin.controller} |\n`
    md += `| 핀 번호 | ${pin.pin} |\n`
    if (pin.label) md += `| 라벨 | ${pin.label} |\n`
    if (pin.function) md += `| 기능 | ${pin.function} |\n`
    if (pin.direction) md += `| 방향 | ${pin.direction} |\n`
    
    if (pin.file_path) {
      md += `\n📄 ${pin.file_path.replace(this.projectPath + '/', '')}:${pin.line}`
    }
    
    return md
  }


  /**
   * 심볼 검색 (범용)
   */
  searchSymbols(query: string, limit: number = 50): SymbolRecord[] {
    // 캐시 확인
    const cacheKey = `search:${query}:${limit}`
    const cached = searchCache.get(cacheKey)
    if (cached) {
      return cached as SymbolRecord[]
    }

    const results = indexDb.searchSymbols(query, limit)
    searchCache.set(cacheKey, results)
    return results
  }

  /**
   * 정의 찾기 (심볼명으로 직접)
   */
  findDefinition(symbolName: string): SymbolRecord | null {
    // 캐시 확인
    const cacheKey = `symbol:${symbolName}`
    const cached = symbolCache.get(cacheKey)
    if (cached) {
      return cached as SymbolRecord
    }

    const symbol = indexDb.findSymbol(symbolName)
    if (symbol) {
      symbolCache.set(cacheKey, symbol)
    }
    return symbol
  }
}

// 싱글톤 인스턴스
export const languageService = new LanguageService()
