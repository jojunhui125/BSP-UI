/**
 * 인덱스 매니저
 * - 증분 인덱싱 (mtime 기반 변경 감지)
 * - 멀티 프로세싱 지원
 * - 진행률 리포팅
 */

import { indexDb, FileRecord, SymbolRecord, IncludeRecord, DtNodeRecord, DtPropertyRecord, GpioPinRecord } from '../database/IndexDatabase'
import { fileContentCache, symbolCache, clearAllCaches } from '../cache/LRUCache'
import { sshManager } from '../ssh/SshManager'
import { BrowserWindow } from 'electron'

// 인덱싱 진행 상태
export interface IndexProgress {
  phase: 'init' | 'files' | 'symbols' | 'includes' | 'dt' | 'gpio' | 'done' | 'error'
  current: number
  total: number
  message: string
  speed?: number  // files/sec
}

// 파일 변경 정보
interface FileChange {
  path: string
  name: string
  type: 'added' | 'modified' | 'deleted'
  mtime: number
}

export class IndexManager {
  private projectPath: string = ''
  private serverId: string = ''
  private isIndexing: boolean = false
  private shouldCancel: boolean = false
  private mainWindow: BrowserWindow | null = null
  private startTime: number = 0

  /**
   * 메인 윈도우 설정 (진행률 전송용)
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * 진행률 전송
   */
  private sendProgress(progress: IndexProgress): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('index:progress', progress)
    } else {
      console.warn('[IndexManager] mainWindow is null, cannot send progress')
    }
  }

  /**
   * 인덱싱 시작 (증분)
   */
  async startIndexing(projectPath: string, serverId: string, fullReindex: boolean = false): Promise<boolean> {
    if (this.isIndexing) {
      console.log('[IndexManager] Already indexing')
      return false
    }

    this.isIndexing = true
    this.shouldCancel = false
    this.projectPath = projectPath
    this.serverId = serverId
    this.startTime = Date.now()

    try {
      // DB 초기화
      indexDb.init(projectPath)
      
      if (fullReindex) {
        indexDb.clearAll()
        clearAllCaches()
      }

      this.sendProgress({ phase: 'init', current: 0, total: 0, message: '변경 사항 확인 중...' })

      // 1. 파일 변경 감지
      const changes = await this.detectChanges()
      
      if (changes.length === 0 && !fullReindex) {
        this.sendProgress({ phase: 'done', current: 0, total: 0, message: '변경 사항 없음' })
        this.isIndexing = false
        return true
      }

      console.log(`[IndexManager] ${changes.length} files to process`)

      // 2. 삭제된 파일 처리
      const deleted = changes.filter(c => c.type === 'deleted')
      for (const file of deleted) {
        indexDb.deleteFile(file.path)
      }

      // 3. 추가/수정된 파일 처리
      const toProcess = changes.filter(c => c.type !== 'deleted')
      
      if (toProcess.length > 0) {
        await this.processFiles(toProcess)
      }

      // 4. 메타데이터 업데이트
      indexDb.setMetadata('last_index_time', Date.now().toString())
      indexDb.setMetadata('project_path', projectPath)

      const stats = indexDb.getStats()
      const elapsed = Date.now() - this.startTime
      
      this.sendProgress({
        phase: 'done',
        current: toProcess.length,
        total: toProcess.length,
        message: `완료! ${stats.files}파일, ${stats.symbols}심볼 (${elapsed}ms)`,
        speed: toProcess.length / (elapsed / 1000)
      })

      console.log(`[IndexManager] Completed in ${elapsed}ms:`, stats)
      
      this.isIndexing = false
      return true

    } catch (err: any) {
      console.error('[IndexManager] Error:', err)
      this.sendProgress({ phase: 'error', current: 0, total: 0, message: err.message })
      this.isIndexing = false
      return false
    }
  }

  /**
   * 인덱싱 취소
   */
  cancelIndexing(): void {
    this.shouldCancel = true
  }

  /**
   * 파일 변경 감지 (증분 인덱싱의 핵심)
   */
  private async detectChanges(): Promise<FileChange[]> {
    const changes: FileChange[] = []
    
    console.log(`[IndexManager] Scanning files in: ${this.projectPath}`)
    
    // 서버에서 현재 파일 목록 가져오기
    // 1. sources 폴더: 모든 타입 포함
    // 2. build 폴더: DTS/DTSI 파일만 포함 (오버라이드된 DT 파일 검색용)
    const findCmd = `cd "${this.projectPath}" && { find ./sources -type f \\( -name "*.bb" -o -name "*.bbappend" -o -name "*.conf" -o -name "*.inc" -o -name "*.h" -o -name "*.dts" -o -name "*.dtsi" \\) ! -path "*/.git/*" 2>/dev/null; find . -path "*/build_*/*" -type f \\( -name "*.dts" -o -name "*.dtsi" \\) ! -path "*/tmp/work/*" 2>/dev/null; } | head -10000`
    
    console.log(`[IndexManager] Find command: ${findCmd}`)
    
    const result = await sshManager.exec(this.serverId, findCmd)

    console.log(`[IndexManager] Find result: code=${result.code}, stdout length=${result.stdout.length}, stderr=${result.stderr.slice(0, 200)}`)

    if (result.code !== 0 && result.stdout.length === 0) {
      throw new Error(`Failed to scan files: ${result.stderr}`)
    }

    const files = result.stdout.split('\n').filter(line => line.trim())
    console.log(`[IndexManager] Found ${files.length} files to check`)

    if (files.length === 0) {
      console.log('[IndexManager] No files found. Check if the path is correct.')
      return changes
    }

    // DB의 기존 파일 목록
    const dbFiles = indexDb.getAllFilesMtime()
    const currentFiles = new Set<string>()

    // 각 파일에 대해 mtime 가져오기 (배치로 처리)
    const STAT_BATCH = 100
    for (let i = 0; i < files.length; i += STAT_BATCH) {
      const batch = files.slice(i, i + STAT_BATCH)
      const statCmd = batch.map(f => `stat -c '%n\t%Y' "${f}" 2>/dev/null || echo "${f}\t0"`).join('; ')
      
      try {
        const statResult = await sshManager.exec(
          this.serverId,
          `cd "${this.projectPath}" && (${statCmd})`
        )
        
        for (const line of statResult.stdout.split('\n')) {
          if (!line.trim()) continue
          
          const [relativePath, mtimeStr] = line.split('\t')
          if (!relativePath) continue
          
          const fullPath = `${this.projectPath}/${relativePath.replace(/^\.\//, '')}`
          const mtime = parseFloat(mtimeStr) || Date.now() / 1000
          const name = relativePath.split('/').pop() || ''
          
          currentFiles.add(fullPath)
          
          const dbMtime = dbFiles.get(fullPath)
          
          if (dbMtime === undefined) {
            // 새 파일
            changes.push({ path: fullPath, name, type: 'added', mtime })
          } else if (mtime > dbMtime) {
            // 수정된 파일
            changes.push({ path: fullPath, name, type: 'modified', mtime })
          }
        }
      } catch (err) {
        console.warn(`[IndexManager] Failed to stat batch ${i}-${i + STAT_BATCH}:`, err)
        // 에러가 나도 계속 진행 (해당 배치만 스킵)
      }
      
      // 진행률 표시
      if (i % 500 === 0 && i > 0) {
        console.log(`[IndexManager] Scanned ${i}/${files.length} files`)
      }
    }

    // 삭제된 파일 감지
    for (const [path] of dbFiles) {
      if (!currentFiles.has(path)) {
        changes.push({ path, name: path.split('/').pop() || '', type: 'deleted', mtime: 0 })
      }
    }

    console.log(`[IndexManager] Changes detected: ${changes.length} (added: ${changes.filter(c => c.type === 'added').length}, modified: ${changes.filter(c => c.type === 'modified').length}, deleted: ${changes.filter(c => c.type === 'deleted').length})`)

    return changes
  }

  /**
   * 파일 처리 (안정적 병렬 처리)
   * SSH 동시 요청 8개까지 허용
   */
  private async processFiles(files: FileChange[]): Promise<void> {
    const BATCH_SIZE = 6  // 안정성: 12→6 (SSH 동시 8개 중 여유분 확보)
    const total = files.length
    let processed = 0
    let errors = 0

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      if (this.shouldCancel) {
        throw new Error('Indexing cancelled')
      }

      const batch = files.slice(i, i + BATCH_SIZE)
      
      // 고속 병렬 처리 (에러 허용)
      const results = await Promise.allSettled(
        batch.map(file => this.processFile(file))
      )
      
      // 에러 카운트
      for (const result of results) {
        if (result.status === 'rejected') {
          errors++
          // 에러 로그는 너무 많으면 생략
          if (errors <= 10) {
            console.warn('[IndexManager] File processing error:', result.reason?.message || result.reason)
          }
        }
      }
      
      processed += batch.length
      const elapsed = Date.now() - this.startTime
      const speed = processed / (elapsed / 1000)
      
      this.sendProgress({
        phase: 'files',
        current: processed,
        total,
        message: `파일 처리 중... ${processed}/${total} (${speed.toFixed(1)} files/sec)${errors > 0 ? ` 에러:${errors}` : ''}`,
        speed
      })

      // 배치 간 딜레이 최소화 (최적화: 50→5)
      if (i + BATCH_SIZE < files.length) {
        await new Promise(r => setTimeout(r, 5))
      }
    }

    if (errors > 0) {
      console.log(`[IndexManager] Completed with ${errors} errors out of ${total} files`)
    }
  }

  /**
   * 단일 파일 처리
   */
  private async processFile(file: FileChange): Promise<void> {
    try {
      // 파일 내용 읽기
      const content = await sshManager.readFile(this.serverId, file.path)
      
      // 캐시에 저장
      fileContentCache.set(file.path, content)
      
      // 파일 타입 판단
      const type = this.getFileType(file.name)
      
      // DB에 파일 등록
      const fileId = indexDb.insertFile({
        path: file.path,
        name: file.name,
        type,
        size: content.length,
        mtime: file.mtime
      })

      if (fileId < 0) return

      // 기존 데이터 삭제 (수정된 파일인 경우)
      if (file.type === 'modified') {
        indexDb.deleteSymbolsByFile(fileId)
      }

      // 타입별 파싱
      switch (type) {
        case 'header':
          this.parseHeaderFile(fileId, content)
          break
        case 'dts':
          this.parseDtsFile(fileId, file.path, content)
          break
        case 'recipe':
        case 'config':
          this.parseBitbakeFile(fileId, content)
          break
      }

    } catch (err) {
      console.error(`[IndexManager] Failed to process ${file.path}:`, err)
    }
  }

  /**
   * 파일 타입 판단
   */
  private getFileType(name: string): FileRecord['type'] {
    if (name.endsWith('.bb') || name.endsWith('.bbappend') || name.endsWith('.inc')) return 'recipe'
    if (name.endsWith('.h')) return 'header'
    if (name.endsWith('.dts') || name.endsWith('.dtsi')) return 'dts'
    if (name.endsWith('.conf')) return 'config'
    if (name.endsWith('.c') || name.endsWith('.cpp')) return 'source'
    return 'other'
  }

  /**
   * 헤더 파일 파싱 (#define 추출)
   */
  private parseHeaderFile(fileId: number, content: string): void {
    const symbols: Omit<SymbolRecord, 'id'>[] = []
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // #define NAME VALUE
      const match = line.match(/^\s*#define\s+([A-Z_][A-Z0-9_]*)\s*(.*)$/)
      if (match) {
        const [, name, value] = match
        const cleanValue = value
          .replace(/\/\*.*?\*\//g, '')  // 주석 제거
          .replace(/\/\/.*$/, '')        // 라인 주석 제거
          .replace(/\\$/, '')            // 줄 연속 제거
          .trim()

        symbols.push({
          name,
          value: cleanValue,
          type: 'define',
          file_id: fileId,
          line: i + 1
        })
      }
    }

    if (symbols.length > 0) {
      indexDb.insertSymbols(symbols)
    }
  }

  /**
   * Device Tree 파일 파싱
   */
  private parseDtsFile(fileId: number, filePath: string, content: string): void {
    const symbols: Omit<SymbolRecord, 'id'>[] = []
    const includes: Omit<IncludeRecord, 'id'>[] = []
    const nodes: Omit<DtNodeRecord, 'id'>[] = []
    const properties: Omit<DtPropertyRecord, 'id'>[] = []
    const gpioPins: Omit<GpioPinRecord, 'id'>[] = []

    const lines = content.split('\n')
    const nodeStack: { id: number; path: string }[] = []
    let currentNodeId = -1
    let currentPath = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      const lineNum = i + 1

      // #include
      let match = trimmed.match(/^#include\s*[<"]([^>"]+)[>"]/)
      if (match) {
        includes.push({
          from_file_id: fileId,
          to_path: match[1],
          type: '#include',
          line: lineNum
        })
        continue
      }

      // /include/
      match = trimmed.match(/\/include\/\s*"([^"]+)"/)
      if (match) {
        includes.push({
          from_file_id: fileId,
          to_path: match[1],
          type: '#include',
          line: lineNum
        })
        continue
      }

      // 노드 시작: label: name@address {
      match = trimmed.match(/^(?:(\w+)\s*:\s*)?(\w+[-\w]*)(?:@([0-9a-fA-F]+))?\s*\{/)
      if (match) {
        const [, label, name, address] = match
        const nodePath = currentPath ? `${currentPath}/${name}` : `/${name}`
        
        nodes.push({
          file_id: fileId,
          path: nodePath,
          name,
          label,
          address,
          parent_id: currentNodeId > 0 ? currentNodeId : undefined,
          start_line: lineNum,
          end_line: lineNum  // 나중에 업데이트
        })

        // 라벨이 있으면 심볼로도 등록
        if (label) {
          symbols.push({
            name: label,
            value: nodePath,
            type: 'label',
            file_id: fileId,
            line: lineNum
          })
        }

        nodeStack.push({ id: currentNodeId, path: currentPath })
        currentNodeId = nodes.length  // 임시 ID
        currentPath = nodePath
        continue
      }

      // 노드 종료
      if (trimmed === '};' || trimmed === '}') {
        if (nodeStack.length > 0) {
          const parent = nodeStack.pop()!
          currentNodeId = parent.id
          currentPath = parent.path
        }
        continue
      }

      // 속성: name = value;
      match = trimmed.match(/^([\w,#-]+)\s*(?:=\s*(.+?))?;$/)
      if (match && currentNodeId !== 0) {  // ★ 수정: 오버라이드 노드(-1)도 포함
        const [, propName, propValue] = match
        
        properties.push({
          node_id: currentNodeId,
          name: propName,
          value: propValue || '',
          line: lineNum
        })

        // ★ 속성 값에서 &label 참조 추출 (Find All References 핵심!)
        if (propValue) {
          const labelRefMatches = propValue.matchAll(/&(\w+)/g)
          for (const labelMatch of labelRefMatches) {
            const refLabel = labelMatch[1]
            // 참조를 심볼로 저장 (type: 'label_ref')
            symbols.push({
              name: `&${refLabel}`,  // &uart0 형태로 저장
              value: refLabel,        // 실제 라벨명
              type: 'label',          // 라벨 타입
              file_id: fileId,
              line: lineNum
            })
          }
        }

        // GPIO 속성 파싱
        if (propName.includes('gpio') || propName.includes('GPIO')) {
          const gpioMatches = (propValue || '').matchAll(/<\s*&(\w+)\s+(\d+)\s*(?:(\d+))?\s*>/g)
          for (const gpioMatch of gpioMatches) {
            const [, controller, pinStr, flags] = gpioMatch
            gpioPins.push({
              file_id: fileId,
              controller,
              pin: parseInt(pinStr),
              label: propName.replace(/-?gpio[s]?$/i, ''),
              function: propName,
              direction: flags === '0' ? 'out' : 'in',
              line: lineNum
            })
          }
        }
      }

      // ★ 노드 참조 (오버라이드): &label { ... }
      match = trimmed.match(/^&(\w+)\s*\{/)
      if (match) {
        const refLabel = match[1]
        // 오버라이드 참조도 심볼로 저장
        symbols.push({
          name: `&${refLabel}`,
          value: refLabel,
          type: 'label',
          file_id: fileId,
          line: lineNum
        })
        
        // 스택에 임시 추가 (나중에 }에서 팝)
        nodeStack.push({ id: currentNodeId, path: currentPath })
        currentNodeId = -1  // 오버라이드 노드
        currentPath = `&${refLabel}`
        continue
      }
    }

    // DB에 저장
    if (symbols.length > 0) indexDb.insertSymbols(symbols)
    if (includes.length > 0) indexDb.insertIncludes(includes)
    if (nodes.length > 0) {
      const nodeIds = indexDb.insertDtNodes(nodes)
      // 속성의 node_id 업데이트
      const propsWithIds = properties.map((p) => ({
        ...p,
        node_id: nodeIds[p.node_id - 1] || p.node_id
      }))
      
      if (propsWithIds.length > 0) indexDb.insertDtProperties(propsWithIds)
    }
    if (gpioPins.length > 0) indexDb.insertGpioPins(gpioPins)
  }

  /**
   * BitBake 파일 파싱
   */
  private parseBitbakeFile(fileId: number, content: string): void {
    const symbols: Omit<SymbolRecord, 'id'>[] = []
    const includes: Omit<IncludeRecord, 'id'>[] = []

    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      const lineNum = i + 1

      // require/include
      let match = trimmed.match(/^(require|include)\s+["']?([^"'\s]+)["']?/)
      if (match) {
        includes.push({
          from_file_id: fileId,
          to_path: match[2],
          type: match[1] as 'require' | 'include',
          line: lineNum
        })
        continue
      }

      // inherit
      match = trimmed.match(/^inherit\s+(.+)/)
      if (match) {
        const classes = match[1].split(/\s+/).filter(c => c && !c.startsWith('$'))
        for (const cls of classes) {
          includes.push({
            from_file_id: fileId,
            to_path: `classes/${cls}.bbclass`,
            type: 'inherit',
            line: lineNum
          })
        }
        continue
      }

      // 변수 할당: VAR = "value"
      match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*(=|\?=|\?\?=|:=|\+=|\.=)\s*["']?(.*)["']?$/)
      if (match) {
        const [, name, op, value] = match
        symbols.push({
          name,
          value: value.replace(/["']$/, ''),
          type: 'variable',
          file_id: fileId,
          line: lineNum
        })
      }
    }

    if (symbols.length > 0) indexDb.insertSymbols(symbols)
    if (includes.length > 0) indexDb.insertIncludes(includes)
  }

  /**
   * 인덱싱 상태
   */
  getStatus(): { isIndexing: boolean; projectPath: string } {
    return {
      isIndexing: this.isIndexing,
      projectPath: this.projectPath
    }
  }

  /**
   * 통계 조회
   */
  getStats(): ReturnType<typeof indexDb.getStats> & { lastIndexTime: string | null } {
    const stats = indexDb.getStats()
    const lastIndexTime = indexDb.getMetadata('last_index_time')
    return { ...stats, lastIndexTime }
  }

  // ============================================
  // 서버 저장/로드 기능 (팀 공유용)
  // ============================================

  /**
   * 인덱스를 서버에 저장
   * 경로: {projectPath}/.bsp-index/index.bspidx
   */
  async saveIndexToServer(serverId: string, projectPath: string): Promise<boolean> {
    try {
      if (!indexDb.isInitialized()) {
        console.error('[IndexManager] DB not initialized')
        return false
      }

      // WAL 체크포인트 (모든 변경사항을 메인 파일에 기록)
      indexDb.checkpoint()

      const localDbPath = indexDb.getDbPath()
      const remoteDir = `${projectPath}/.bsp-index`
      const remoteDbPath = `${remoteDir}/index.bspidx`

      console.log(`[IndexManager] Saving index to server: ${remoteDbPath}`)

      // 서버에 디렉토리 생성
      await sshManager.exec(serverId, `mkdir -p "${remoteDir}"`)

      // 로컬 DB 파일 읽기
      const fs = await import('fs')
      const dbBuffer = fs.readFileSync(localDbPath)

      // 서버에 업로드
      await sshManager.writeFile(serverId, remoteDbPath, dbBuffer)

      // 메타데이터 저장 (마지막 저장 시간)
      const metaPath = `${remoteDir}/meta.json`
      const meta = {
        lastSaved: new Date().toISOString(),
        savedBy: process.env.USERNAME || process.env.USER || 'unknown',
        stats: indexDb.getStats()
      }
      await sshManager.writeFile(serverId, metaPath, Buffer.from(JSON.stringify(meta, null, 2)))

      console.log('[IndexManager] Index saved to server successfully')
      return true

    } catch (err) {
      console.error('[IndexManager] Failed to save index to server:', err)
      return false
    }
  }

  /**
   * 서버에서 인덱스 로드
   * @returns true if loaded from server, false if not available
   */
  async loadIndexFromServer(serverId: string, projectPath: string): Promise<boolean> {
    try {
      const remoteDir = `${projectPath}/.bsp-index`
      const remoteDbPath = `${remoteDir}/index.bspidx`

      console.log(`[IndexManager] Checking server index: ${remoteDbPath}`)

      // 서버에 인덱스 파일이 있는지 확인
      const exists = await sshManager.pathExists(serverId, remoteDbPath)
      if (!exists) {
        console.log('[IndexManager] No server index found')
        return false
      }

      // 메타데이터 확인
      const metaPath = `${remoteDir}/meta.json`
      let meta: { lastSaved: string; stats: any } | null = null
      try {
        const metaContent = await sshManager.readFile(serverId, metaPath)
        meta = JSON.parse(metaContent)
        console.log(`[IndexManager] Server index: saved at ${meta?.lastSaved}, ${meta?.stats?.files} files`)
      } catch {
        console.log('[IndexManager] No meta.json, loading anyway')
      }

      // 로컬 DB 경로 확보
      const { app } = await import('electron')
      const { join } = await import('path')
      const { existsSync, mkdirSync, writeFileSync } = await import('fs')

      const dataDir = join(app.getPath('userData'), 'indexes')
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true })
      }

      // 프로젝트 해시로 로컬 파일명 생성
      const projectHash = this.hashPath(projectPath)
      const localDbPath = join(dataDir, `${projectHash}.bspidx`)

      // 서버에서 DB 파일 다운로드
      console.log('[IndexManager] Downloading index from server...')
      const dbContent = await sshManager.readFileBuffer(serverId, remoteDbPath)
      writeFileSync(localDbPath, dbContent)

      // DB 다시 열기
      indexDb.close()
      indexDb.init(projectPath)

      console.log('[IndexManager] Index loaded from server successfully')
      return true

    } catch (err) {
      console.error('[IndexManager] Failed to load index from server:', err)
      return false
    }
  }

  /**
   * 서버 인덱스 메타데이터 조회
   */
  async getServerIndexMeta(serverId: string, projectPath: string): Promise<{
    exists: boolean
    lastSaved?: string
    savedBy?: string
    stats?: { files: number; symbols: number }
  }> {
    try {
      const metaPath = `${projectPath}/.bsp-index/meta.json`
      console.log(`[IndexManager] Checking server meta: ${metaPath}`)
      
      const exists = await sshManager.pathExists(serverId, metaPath)
      console.log(`[IndexManager] Server meta exists: ${exists}`)
      
      if (!exists) {
        return { exists: false }
      }

      const metaContent = await sshManager.readFile(serverId, metaPath)
      console.log(`[IndexManager] Server meta content: ${metaContent.slice(0, 200)}`)
      const meta = JSON.parse(metaContent)
      
      return {
        exists: true,
        lastSaved: meta.lastSaved,
        savedBy: meta.savedBy,
        stats: meta.stats
      }
    } catch (err) {
      console.error('[IndexManager] Failed to get server meta:', err)
      return { exists: false }
    }
  }

  /**
   * 경로 해시 (로컬 DB 파일명용)
   */
  private hashPath(path: string): string {
    let hash = 0
    for (let i = 0; i < path.length; i++) {
      const char = path.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
  }

  // ============================================
  // 🚀 서버 측 고속 인덱싱 (핵폭탄급 성능!)
  // ============================================

  /**
   * Python 인덱서 스크립트 (서버에 배포)
   * 내장: 서버에서 로컬 I/O로 초고속 인덱싱
   */
  private readonly INDEXER_SCRIPT = `#!/usr/bin/env python3
"""
BSP Indexer - 서버 측 고속 인덱싱 스크립트
Yocto/BSP 프로젝트를 로컬 파일 시스템에서 직접 파싱하여 SQLite DB 생성
성능: 10,000개 파일 기준 ~30초 (vs SSH 개별 읽기 ~10분)
"""
import os,re,sys,json,sqlite3,argparse
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

FILE_TYPES = {'.bb':'recipe','.bbappend':'recipe','.inc':'recipe','.conf':'config','.h':'header','.dts':'dts','.dtsi':'dts'}
EXCLUDE_PATTERNS = ['*/tmp/work/*','*/.git/*','*/sstate-cache/*','*/downloads/*']

class BspIndexer:
    def __init__(self,project_path,output_path=None):
        self.project_path=Path(project_path).resolve()
        self.output_path=output_path or str(self.project_path/'.bsp-index'/'index.bspidx')
        self.conn=None
        self.stats={'files':0,'symbols':0,'includes':0,'dt_nodes':0,'gpio_pins':0}

    def run(self):
        print(f"[BSP Indexer] Project: {self.project_path}")
        print(f"[BSP Indexer] Output: {self.output_path}")
        start_time=datetime.now()
        os.makedirs(os.path.dirname(self.output_path),exist_ok=True)
        self.init_db()
        files=self.scan_files()
        print(f"[BSP Indexer] Found {len(files)} files to index")
        self.parse_files_parallel(files)
        self.save_metadata()
        elapsed=(datetime.now()-start_time).total_seconds()
        print(f"\\n[BSP Indexer] Completed in {elapsed:.1f}s")
        print(f"  Files: {self.stats['files']}, Symbols: {self.stats['symbols']}, DT Nodes: {self.stats['dt_nodes']}")
        self.conn.close()
        self.save_meta_json(elapsed)
        return self.output_path

    def init_db(self):
        if os.path.exists(self.output_path):os.remove(self.output_path)
        self.conn=sqlite3.connect(self.output_path)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA cache_size=-64000")
        self.conn.executescript('''
CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY AUTOINCREMENT,path TEXT NOT NULL UNIQUE,name TEXT NOT NULL,type TEXT NOT NULL,size INTEGER,mtime INTEGER);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_type ON files(type);
CREATE TABLE IF NOT EXISTS symbols(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,value TEXT,type TEXT NOT NULL,file_id INTEGER,line INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
CREATE TABLE IF NOT EXISTS includes(id INTEGER PRIMARY KEY AUTOINCREMENT,from_file_id INTEGER,to_path TEXT NOT NULL,type TEXT NOT NULL,line INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_includes_from ON includes(from_file_id);
CREATE INDEX IF NOT EXISTS idx_includes_to ON includes(to_path);
CREATE TABLE IF NOT EXISTS dt_nodes(id INTEGER PRIMARY KEY AUTOINCREMENT,file_id INTEGER,path TEXT NOT NULL,name TEXT NOT NULL,label TEXT,address TEXT,parent_id INTEGER,start_line INTEGER NOT NULL,end_line INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dt_nodes_path ON dt_nodes(path);
CREATE INDEX IF NOT EXISTS idx_dt_nodes_label ON dt_nodes(label);
CREATE INDEX IF NOT EXISTS idx_dt_nodes_file ON dt_nodes(file_id);
CREATE TABLE IF NOT EXISTS dt_properties(id INTEGER PRIMARY KEY AUTOINCREMENT,node_id INTEGER,name TEXT NOT NULL,value TEXT,line INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dt_props_node ON dt_properties(node_id);
CREATE INDEX IF NOT EXISTS idx_dt_props_name ON dt_properties(name);
CREATE TABLE IF NOT EXISTS gpio_pins(id INTEGER PRIMARY KEY AUTOINCREMENT,file_id INTEGER,controller TEXT NOT NULL,pin INTEGER NOT NULL,label TEXT,function TEXT,direction TEXT);
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT);
CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(name,value,content='symbols',content_rowid='id');
CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN INSERT INTO symbols_fts(rowid,name,value) VALUES (new.id,new.name,new.value); END;
''')
        self.conn.commit()

    def scan_files(self):
        import fnmatch
        files=[]
        for root,dirs,filenames in os.walk(self.project_path):
            rel_root=os.path.relpath(root,self.project_path)
            skip=any(fnmatch.fnmatch(rel_root,p) or fnmatch.fnmatch('/'+rel_root,p) for p in EXCLUDE_PATTERNS)
            if skip:dirs.clear();continue
            for filename in filenames:
                ext=os.path.splitext(filename)[1].lower()
                if ext in FILE_TYPES:files.append({'path':os.path.join(root,filename),'name':filename,'type':FILE_TYPES[ext],'ext':ext})
        return files

    def parse_files_parallel(self,files,max_workers=8):
        total=len(files);processed=0;batch_size=100
        for i in range(0,len(files),batch_size):
            batch=files[i:i+batch_size];results=[]
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures={executor.submit(self.parse_file,f):f for f in batch}
                for future in as_completed(futures):
                    try:
                        result=future.result()
                        if result:results.append(result)
                    except:pass
            self.insert_batch(results)
            processed+=len(batch)
            print(f"\\r[BSP Indexer] Progress: {processed}/{total} ({processed/total*100:.1f}%)",end='',flush=True)
        print()

    def parse_file(self,file_info):
        try:
            filepath=file_info['path'];stat=os.stat(filepath)
            with open(filepath,'r',encoding='utf-8',errors='ignore') as f:content=f.read()
            result={'file':{'path':os.path.relpath(filepath,self.project_path),'name':file_info['name'],'type':file_info['type'],'size':stat.st_size,'mtime':int(stat.st_mtime)},'symbols':[],'includes':[],'dt_nodes':[],'dt_properties':[]}
            if file_info['type'] in ('recipe','config'):self._parse_bitbake(content,result)
            elif file_info['type']=='dts':self._parse_dts(content,result)
            elif file_info['type']=='header':self._parse_header(content,result)
            return result
        except:return None

    def _parse_bitbake(self,content,result):
        for i,line in enumerate(content.split('\\n')):
            line_num=i+1;stripped=line.strip()
            match=re.match(r'^([A-Za-z_][A-Za-z0-9_-]*)\\s*(\\??\\+?=|:=|\\.=)\\s*["\\'\\']?([^"\\'\\']*)' ,stripped)
            if match:result['symbols'].append({'name':match.group(1),'value':match.group(3)[:200],'type':'variable','line':line_num})
            match=re.match(r'^(require|include)\\s+["\\'\\'"]?([^"\\'\\'\\s]+)',stripped)
            if match:result['includes'].append({'to_path':match.group(2),'type':match.group(1),'line':line_num})
            match=re.match(r'^inherit\\s+(.+)',stripped)
            if match:
                for cls in match.group(1).split():result['includes'].append({'to_path':f"classes/{cls}.bbclass",'type':'inherit','line':line_num})

    def _parse_dts(self,content,result):
        node_stack=[];current_path=''
        for i,line in enumerate(content.split('\\n')):
            line_num=i+1;stripped=line.strip()
            match=re.match(r'#include\\s*[<"]([^>"]+)[>"]',stripped)
            if match:result['includes'].append({'to_path':match.group(1),'type':'#include','line':line_num});continue
            match=re.match(r'^(?:(\\w+)\\s*:\\s*)?(\\S+?)(?:@([0-9a-fA-F]+))?\\s*\\{',stripped)
            if match:
                label,name,address=match.group(1),match.group(2),match.group(3)
                new_path=name if name.startswith('&') else (f"{current_path}/{name}" if current_path else f"/{name}")
                node_stack.append((current_path,line_num));current_path=new_path
                result['dt_nodes'].append({'path':new_path,'name':name,'label':label,'address':address,'start_line':line_num,'end_line':line_num})
                if label:result['symbols'].append({'name':label,'value':new_path,'type':'label','line':line_num})
                continue
            if stripped in ('};','}'):
                if node_stack:
                    parent_path,start=node_stack.pop()
                    for node in reversed(result['dt_nodes']):
                        if node['path']==current_path:node['end_line']=line_num;break
                    current_path=parent_path
                continue
            match=re.match(r'^([\\w,#-]+)\\s*(?:=\\s*(.+?))?;$',stripped)
            if match and current_path:
                prop_name,prop_value=match.group(1),match.group(2) or ''
                result['dt_properties'].append({'node_path':current_path,'name':prop_name,'value':prop_value[:500],'line':line_num})
                for ref_match in re.finditer(r'&(\\w+)',prop_value):result['symbols'].append({'name':f"&{ref_match.group(1)}",'value':ref_match.group(1),'type':'label_ref','line':line_num})

    def _parse_header(self,content,result):
        for i,line in enumerate(content.split('\\n')):
            line_num=i+1;stripped=line.strip()
            match=re.match(r'^#define\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(.*)',stripped)
            if match:result['symbols'].append({'name':match.group(1),'value':match.group(2)[:200],'type':'define','line':line_num})
            match=re.match(r'^#include\\s*[<"]([^>"]+)[>"]',stripped)
            if match:result['includes'].append({'to_path':match.group(1),'type':'#include','line':line_num})

    def insert_batch(self,results):
        cursor=self.conn.cursor()
        for result in results:
            if not result:continue
            cursor.execute("INSERT OR REPLACE INTO files(path,name,type,size,mtime) VALUES(?,?,?,?,?)",(result['file']['path'],result['file']['name'],result['file']['type'],result['file']['size'],result['file']['mtime']))
            file_id=cursor.lastrowid;self.stats['files']+=1
            for sym in result['symbols']:cursor.execute("INSERT INTO symbols(name,value,type,file_id,line) VALUES(?,?,?,?,?)",(sym['name'],sym.get('value'),sym['type'],file_id,sym['line']));self.stats['symbols']+=1
            for inc in result['includes']:cursor.execute("INSERT INTO includes(from_file_id,to_path,type,line) VALUES(?,?,?,?)",(file_id,inc['to_path'],inc['type'],inc['line']));self.stats['includes']+=1
            node_id_map={}
            for node in result['dt_nodes']:cursor.execute("INSERT INTO dt_nodes(file_id,path,name,label,address,parent_id,start_line,end_line) VALUES(?,?,?,?,?,?,?,?)",(file_id,node['path'],node['name'],node.get('label'),node.get('address'),None,node['start_line'],node['end_line']));node_id_map[node['path']]=cursor.lastrowid;self.stats['dt_nodes']+=1
            for prop in result['dt_properties']:
                node_id=node_id_map.get(prop['node_path'])
                if node_id:cursor.execute("INSERT INTO dt_properties(node_id,name,value,line) VALUES(?,?,?,?)",(node_id,prop['name'],prop.get('value'),prop['line']))
        self.conn.commit()

    def save_metadata(self):
        cursor=self.conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO metadata VALUES(?,?)",('last_index_time',str(int(datetime.now().timestamp()*1000))))
        cursor.execute("INSERT OR REPLACE INTO metadata VALUES(?,?)",('project_path',str(self.project_path)))
        cursor.execute("INSERT OR REPLACE INTO metadata VALUES(?,?)",('indexer_version','2.0-server'))
        self.conn.commit()

    def save_meta_json(self,elapsed):
        meta={'lastSaved':datetime.now().isoformat(),'savedBy':os.environ.get('USER',os.environ.get('USERNAME','unknown')),'indexerVersion':'2.0-server','elapsed':round(elapsed,1),'stats':self.stats}
        meta_path=os.path.join(os.path.dirname(self.output_path),'meta.json')
        with open(meta_path,'w') as f:json.dump(meta,f,indent=2)

def main():
    parser=argparse.ArgumentParser(description='BSP Indexer - 서버 측 고속 인덱싱')
    parser.add_argument('project_path',help='Yocto/BSP 프로젝트 경로')
    parser.add_argument('--output','-o',help='출력 DB 경로')
    args=parser.parse_args()
    indexer=BspIndexer(args.project_path,args.output)
    output_path=indexer.run()
    print(f"\\n✅ Index saved: {output_path}")
    return 0

if __name__=='__main__':sys.exit(main())
`;

  /**
   * 🚀 서버 측 고속 인덱싱 실행
   * Python 스크립트를 서버에서 직접 실행하여 초고속 인덱싱
   * 
   * @returns Promise<boolean> 성공 여부
   */
  async startServerSideIndexing(projectPath: string, serverId: string): Promise<boolean> {
    if (this.isIndexing) {
      console.log('[IndexManager] Already indexing')
      return false
    }

    this.isIndexing = true
    this.shouldCancel = false
    this.projectPath = projectPath
    this.serverId = serverId
    this.startTime = Date.now()

    try {
      this.sendProgress({ phase: 'init', current: 0, total: 0, message: '서버 측 인덱싱 준비 중...' })

      // 1. Python 스크립트 서버에 배포
      const scriptPath = `${projectPath}/.bsp-index/indexer.py`
      console.log(`[IndexManager] Deploying indexer script to: ${scriptPath}`)

      await sshManager.exec(serverId, `mkdir -p "${projectPath}/.bsp-index"`)
      await sshManager.writeFile(serverId, scriptPath, Buffer.from(this.INDEXER_SCRIPT))
      await sshManager.exec(serverId, `chmod +x "${scriptPath}"`)

      // 2. Python 스크립트 실행
      this.sendProgress({ phase: 'files', current: 0, total: 0, message: '🚀 서버에서 인덱싱 실행 중... (약 30초)' })
      
      console.log(`[IndexManager] Running server-side indexer...`)
      const result = await sshManager.exec(serverId, `cd "${projectPath}" && python3 "${scriptPath}" "${projectPath}"`, {
        timeout: 30 * 60 * 1000  // 30분 타임아웃 (대용량 프로젝트용)
      })

      if (result.code !== 0) {
        throw new Error(`Server indexer failed: ${result.stderr}`)
      }

      console.log(`[IndexManager] Server indexer output:\n${result.stdout}`)

      // 3. 생성된 인덱스 다운로드
      this.sendProgress({ phase: 'files', current: 50, total: 100, message: '인덱스 다운로드 중...' })
      
      const remoteDbPath = `${projectPath}/.bsp-index/index.bspidx`
      const loaded = await this.loadIndexFromServer(serverId, projectPath)

      if (!loaded) {
        throw new Error('Failed to load index from server')
      }

      // 4. 완료
      const stats = indexDb.getStats()
      const elapsed = Date.now() - this.startTime

      this.sendProgress({
        phase: 'done',
        current: stats.files,
        total: stats.files,
        message: `🎉 완료! ${stats.files}파일, ${stats.symbols}심볼 (${(elapsed / 1000).toFixed(1)}초)`,
        speed: stats.files / (elapsed / 1000)
      })

      console.log(`[IndexManager] Server-side indexing completed in ${elapsed}ms:`, stats)

      this.isIndexing = false
      return true

    } catch (err: any) {
      console.error('[IndexManager] Server-side indexing error:', err)
      this.sendProgress({ phase: 'error', current: 0, total: 0, message: `에러: ${err.message}` })
      this.isIndexing = false
      return false
    }
  }

  /**
   * Python 사용 가능 여부 확인
   */
  async checkPythonAvailable(serverId: string): Promise<{ available: boolean; version?: string }> {
    try {
      const result = await sshManager.exec(serverId, 'python3 --version')
      if (result.code === 0) {
        return { available: true, version: result.stdout.trim() }
      }
      return { available: false }
    } catch {
      return { available: false }
    }
  }
}

// 싱글톤 인스턴스
export const indexManager = new IndexManager()
