/**
 * SQLite 기반 인덱스 데이터베이스
 * FTS5 전문 검색으로 밀리초 단위 응답
 * 
 * better-sqlite3가 없어도 앱이 실행되도록 안전한 fallback 제공
 */

import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'

// better-sqlite3 타입 (런타임에 동적 로드)
type BetterSqlite3Database = {
  pragma(pragma: string): void
  exec(sql: string): void
  prepare(sql: string): {
    run(...params: any[]): { lastInsertRowid: number | bigint }
    get(...params: any[]): any
    all(...params: any[]): any[]
  }
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T
  close(): void
}

type BetterSqlite3Constructor = new (filename: string) => BetterSqlite3Database

// 지연 로딩된 모듈
let sqlite3Module: BetterSqlite3Constructor | null = null
let loadError: Error | null = null
let loadAttempted = false

/**
 * better-sqlite3 모듈 로드 (지연 로딩)
 */
function loadSqlite3(): BetterSqlite3Constructor | null {
  if (loadAttempted) {
    return sqlite3Module
  }
  
  loadAttempted = true
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sqlite3Module = require('better-sqlite3')
    console.log('[IndexDB] better-sqlite3 loaded successfully')
    return sqlite3Module
  } catch (error) {
    loadError = error instanceof Error ? error : new Error(String(error))
    console.warn('[IndexDB] better-sqlite3 not available:', loadError.message)
    console.warn('[IndexDB] 인덱싱 기능이 비활성화됩니다. npm install로 의존성을 설치해주세요.')
    return null
  }
}

/**
 * SQLite 사용 가능 여부 확인
 */
export function isSqliteAvailable(): boolean {
  loadSqlite3()
  return sqlite3Module !== null
}

/**
 * SQLite 로드 오류 메시지
 */
export function getSqliteLoadError(): string | null {
  return loadError?.message ?? null
}

// 타입 정의
export interface FileRecord {
  id?: number
  path: string
  name: string
  type: 'recipe' | 'header' | 'dts' | 'config' | 'source' | 'other'
  size?: number
  mtime?: number
  content_hash?: string
}

export interface SymbolRecord {
  id?: number
  name: string
  value: string
  type: 'define' | 'function' | 'variable' | 'node' | 'label'
  file_id: number
  line: number
  file_path?: string  // JOIN 결과용
}

export interface IncludeRecord {
  id?: number
  from_file_id: number
  to_path: string
  type: 'require' | 'include' | '#include' | 'inherit'
  line: number
  from_path?: string  // JOIN 결과용
}

export interface DtNodeRecord {
  id?: number
  file_id: number
  path: string
  name: string
  label?: string
  address?: string
  parent_id?: number
  start_line: number
  end_line: number
  file_path?: string  // JOIN 결과용
}

export interface DtPropertyRecord {
  id?: number
  node_id: number
  name: string
  value?: string
  line: number
}

export interface GpioPinRecord {
  id?: number
  file_id: number
  controller: string
  pin: number
  label?: string
  function?: string
  direction?: 'in' | 'out' | 'inout'
  line: number
  file_path?: string  // JOIN 결과용
}

export class IndexDatabase {
  private db: BetterSqlite3Database | null = null
  private projectPath: string = ''
  private dbPath: string = ''
  private initialized: boolean = false

  // In-memory fallback (SQLite 없을 때)
  private memoryStore = {
    files: new Map<number, FileRecord & { id: number }>(),
    symbols: new Map<number, SymbolRecord & { id: number }>(),
    includes: new Map<number, IncludeRecord & { id: number }>(),
    dtNodes: new Map<number, DtNodeRecord & { id: number }>(),
    dtProperties: new Map<number, DtPropertyRecord & { id: number }>(),
    gpioPins: new Map<number, GpioPinRecord & { id: number }>(),
    metadata: new Map<string, string>(),
    nextId: { files: 1, symbols: 1, includes: 1, dtNodes: 1, dtProperties: 1, gpioPins: 1 }
  }

  /**
   * 데이터베이스 초기화
   */
  init(projectPath: string): void {
    if (this.initialized && this.projectPath === projectPath) {
      console.log('[IndexDB] Already initialized for this project')
      return
    }

    this.projectPath = projectPath
    
    // SQLite 로드 시도
    const Database = loadSqlite3()
    
    if (Database) {
      try {
        // DB 저장 경로: 앱 데이터 폴더
        const dataDir = join(app.getPath('userData'), 'indexes')
        if (!existsSync(dataDir)) {
          mkdirSync(dataDir, { recursive: true })
        }
        
        // 프로젝트별 DB 파일 (경로를 해시화)
        const projectHash = this.hashPath(projectPath)
        this.dbPath = join(dataDir, `${projectHash}.bspidx`)
        
        console.log(`[IndexDB] Opening: ${this.dbPath}`)

        this.db = new Database(this.dbPath)
        this.db.pragma('journal_mode = WAL')  // Write-Ahead Logging (성능 향상)
        this.db.pragma('synchronous = NORMAL')
        this.db.pragma('cache_size = -64000')  // 64MB 캐시
        // FOREIGN KEY OFF: 삽입 성능 향상 + 순서 문제 방지
        // 삭제 시 수동으로 관련 레코드 삭제 (deleteFile 메서드)
        this.db.pragma('foreign_keys = OFF')
        
        this.createTables()
        this.initialized = true
        console.log('[IndexDB] SQLite initialized successfully')
      } catch (err) {
        console.error('[IndexDB] SQLite initialization failed:', err)
        this.db = null
        this.initMemoryFallback()
      }
    } else {
      this.initMemoryFallback()
    }
  }

  /**
   * 메모리 fallback 초기화
   */
  private initMemoryFallback(): void {
    console.log('[IndexDB] Using in-memory fallback (limited functionality)')
    this.memoryStore.files.clear()
    this.memoryStore.symbols.clear()
    this.memoryStore.includes.clear()
    this.memoryStore.dtNodes.clear()
    this.memoryStore.dtProperties.clear()
    this.memoryStore.gpioPins.clear()
    this.memoryStore.metadata.clear()
    this.memoryStore.nextId = { files: 1, symbols: 1, includes: 1, dtNodes: 1, dtProperties: 1, gpioPins: 1 }
    this.initialized = true
  }

  /**
   * 테이블 생성
   */
  private createTables(): void {
    if (!this.db) return

    // 파일 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER,
        mtime REAL,
        content_hash TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
      CREATE INDEX IF NOT EXISTS idx_files_type ON files(type);
    `)

    // 심볼 테이블 (FTS5 전문 검색)
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
        name,
        value,
        content='symbols',
        content_rowid='id'
      );
      
      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value TEXT,
        type TEXT NOT NULL,
        file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
        line INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
      
      -- FTS 트리거
      CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
        INSERT INTO symbols_fts(rowid, name, value) VALUES (new.id, new.name, new.value);
      END;
      CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
        INSERT INTO symbols_fts(symbols_fts, rowid, name, value) VALUES('delete', old.id, old.name, old.value);
      END;
      CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
        INSERT INTO symbols_fts(symbols_fts, rowid, name, value) VALUES('delete', old.id, old.name, old.value);
        INSERT INTO symbols_fts(rowid, name, value) VALUES (new.id, new.name, new.value);
      END;
    `)

    // Include 관계 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS includes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
        to_path TEXT NOT NULL,
        type TEXT NOT NULL,
        line INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_includes_from ON includes(from_file_id);
      CREATE INDEX IF NOT EXISTS idx_includes_to ON includes(to_path);
    `)

    // Device Tree 노드 테이블
    // 주의: parent_id는 FOREIGN KEY 없이 저장 (트랜잭션 내 순서 문제 방지)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dt_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        label TEXT,
        address TEXT,
        parent_id INTEGER,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_dt_nodes_path ON dt_nodes(path);
      CREATE INDEX IF NOT EXISTS idx_dt_nodes_label ON dt_nodes(label);
      CREATE INDEX IF NOT EXISTS idx_dt_nodes_file ON dt_nodes(file_id);
    `)

    // Device Tree 속성 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dt_properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id INTEGER REFERENCES dt_nodes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        value TEXT,
        line INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_dt_props_node ON dt_properties(node_id);
      CREATE INDEX IF NOT EXISTS idx_dt_props_name ON dt_properties(name);
    `)

    // GPIO 핀 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gpio_pins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
        controller TEXT NOT NULL,
        pin INTEGER NOT NULL,
        label TEXT,
        function TEXT,
        direction TEXT,
        line INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gpio_controller ON gpio_pins(controller);
      CREATE INDEX IF NOT EXISTS idx_gpio_label ON gpio_pins(label);
      CREATE INDEX IF NOT EXISTS idx_gpio_function ON gpio_pins(function);
    `)

    // 메타데이터 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)

    console.log('[IndexDB] Tables created')
  }

  /**
   * 경로를 해시화 (파일명으로 사용 가능하게)
   */
  private hashPath(path: string): string {
    let hash = 0
    for (let i = 0; i < path.length; i++) {
      const char = path.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return `project_${Math.abs(hash).toString(16)}`
  }

  /**
   * SQLite 사용 가능 여부
   */
  isUsingDb(): boolean {
    return this.db !== null
  }

  // ============================================
  // 파일 관련 메서드
  // ============================================

  /**
   * 파일 추가/업데이트
   */
  insertFile(file: FileRecord): number {
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO files (path, name, type, size, mtime, content_hash)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      const result = stmt.run(file.path, file.name, file.type, file.size || null, file.mtime || null, file.content_hash || null)
      return Number(result.lastInsertRowid)
    } else {
      // Memory fallback
      const existing = Array.from(this.memoryStore.files.values()).find(f => f.path === file.path)
      if (existing) {
        Object.assign(existing, file)
        return existing.id
      }
      const id = this.memoryStore.nextId.files++
      this.memoryStore.files.set(id, { ...file, id })
      return id
    }
  }

  /**
   * 파일 ID 조회
   */
  getFileId(path: string): number | null {
    if (this.db) {
      const stmt = this.db.prepare(`SELECT id FROM files WHERE path = ?`)
      const row = stmt.get(path) as { id: number } | undefined
      return row?.id ?? null
    } else {
      const file = Array.from(this.memoryStore.files.values()).find(f => f.path === path)
      return file?.id ?? null
    }
  }

  /**
   * 파일 mtime 조회 (증분 인덱싱용)
   */
  getFileMtime(path: string): number | null {
    if (this.db) {
      const stmt = this.db.prepare(`SELECT mtime FROM files WHERE path = ?`)
      const row = stmt.get(path) as { mtime: number } | undefined
      return row?.mtime ?? null
    } else {
      const file = Array.from(this.memoryStore.files.values()).find(f => f.path === path)
      return file?.mtime ?? null
    }
  }

  /**
   * 모든 파일 경로와 mtime 조회
   */
  getAllFilesMtime(): Map<string, number> {
    if (this.db) {
      const stmt = this.db.prepare(`SELECT path, mtime FROM files`)
      const rows = stmt.all() as { path: string; mtime: number }[]
      return new Map(rows.map(r => [r.path, r.mtime]))
    } else {
      const result = new Map<string, number>()
      for (const file of this.memoryStore.files.values()) {
        if (file.mtime !== undefined) {
          result.set(file.path, file.mtime)
        }
      }
      return result
    }
  }

  /**
   * 파일 삭제 (관련 데이터도 함께 삭제)
   */
  deleteFile(path: string): void {
    if (this.db) {
      // 먼저 파일 ID 조회
      const fileIdStmt = this.db.prepare(`SELECT id FROM files WHERE path = ?`)
      const fileRow = fileIdStmt.get(path) as { id: number } | undefined
      
      if (fileRow) {
        const fileId = fileRow.id
        
        // 관련 레코드 먼저 삭제 (FOREIGN KEY 제약 회피)
        // dt_properties는 dt_nodes에 연결되어 있으므로 dt_nodes 삭제 전에 처리
        const dtNodeIds = this.db.prepare(`SELECT id FROM dt_nodes WHERE file_id = ?`).all(fileId) as { id: number }[]
        if (dtNodeIds.length > 0) {
          const nodeIdList = dtNodeIds.map(n => n.id).join(',')
          this.db.exec(`DELETE FROM dt_properties WHERE node_id IN (${nodeIdList})`)
        }
        
        // 나머지 관련 테이블 삭제
        this.db.prepare(`DELETE FROM symbols WHERE file_id = ?`).run(fileId)
        this.db.prepare(`DELETE FROM includes WHERE from_file_id = ?`).run(fileId)
        this.db.prepare(`DELETE FROM dt_nodes WHERE file_id = ?`).run(fileId)
        this.db.prepare(`DELETE FROM gpio_pins WHERE file_id = ?`).run(fileId)
        
        // 마지막으로 파일 삭제
        this.db.prepare(`DELETE FROM files WHERE id = ?`).run(fileId)
      }
    } else {
      const file = Array.from(this.memoryStore.files.values()).find(f => f.path === path)
      if (file) {
        this.memoryStore.files.delete(file.id)
        // Cascade delete
        for (const [id, sym] of this.memoryStore.symbols) {
          if (sym.file_id === file.id) this.memoryStore.symbols.delete(id)
        }
        for (const [id, inc] of this.memoryStore.includes) {
          if (inc.from_file_id === file.id) this.memoryStore.includes.delete(id)
        }
        for (const [id, node] of this.memoryStore.dtNodes) {
          if (node.file_id === file.id) this.memoryStore.dtNodes.delete(id)
        }
        for (const [id, pin] of this.memoryStore.gpioPins) {
          if (pin.file_id === file.id) this.memoryStore.gpioPins.delete(id)
        }
      }
    }
  }

  // ============================================
  // 심볼 관련 메서드
  // ============================================

  /**
   * 심볼 추가 (배치)
   */
  insertSymbols(symbols: Omit<SymbolRecord, 'id'>[]): void {
    if (symbols.length === 0) return
    
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO symbols (name, value, type, file_id, line)
        VALUES (?, ?, ?, ?, ?)
      `)
      
      const insertMany = this.db.transaction((items: Omit<SymbolRecord, 'id'>[]) => {
        for (const item of items) {
          stmt.run(item.name, item.value || '', item.type, item.file_id, item.line)
        }
      })
      
      insertMany(symbols)
    } else {
      for (const sym of symbols) {
        const id = this.memoryStore.nextId.symbols++
        this.memoryStore.symbols.set(id, { ...sym, id, value: sym.value || '' })
      }
    }
  }

  /**
   * FTS5 전문 검색 (핵심!) - 특수문자 지원 개선
   */
  searchSymbols(query: string, limit: number = 50): SymbolRecord[] {
    if (!query.trim()) return []
    
    if (this.db) {
      // 특수문자 포함 여부 확인
      const hasSpecialChars = /[\/\-\.\@]/.test(query)
      
      if (hasSpecialChars) {
        // 특수문자가 있으면 LIKE 검색 사용 (경로, 복잡한 이름 등)
        const likePattern = `%${query}%`
        
        const stmt = this.db.prepare(`
          SELECT s.id, s.name, s.value, s.type, s.file_id, s.line, f.path as file_path
          FROM symbols s
          JOIN files f ON s.file_id = f.id
          WHERE s.name LIKE ? OR s.value LIKE ? OR f.path LIKE ?
          ORDER BY 
            CASE 
              WHEN s.name = ? THEN 0
              WHEN s.name LIKE ? THEN 1
              WHEN f.path LIKE ? THEN 2
              ELSE 3 
            END,
            length(s.name)
          LIMIT ?
        `)
        
        const startPattern = `${query}%`
        return stmt.all(likePattern, likePattern, likePattern, query, startPattern, likePattern, limit) as SymbolRecord[]
      } else {
        // 일반 검색은 FTS5 사용 (더 빠름)
        const ftsQuery = query.replace(/[^\w]/g, '') + '*'
        
        const stmt = this.db.prepare(`
          SELECT s.id, s.name, s.value, s.type, s.file_id, s.line, f.path as file_path
          FROM symbols s
          JOIN files f ON s.file_id = f.id
          WHERE s.id IN (
            SELECT rowid FROM symbols_fts WHERE symbols_fts MATCH ?
          )
          ORDER BY 
            CASE WHEN s.name = ? THEN 0 ELSE 1 END,
            length(s.name)
          LIMIT ?
        `)
        
        return stmt.all(ftsQuery, query, limit) as SymbolRecord[]
      }
    } else {
      // Memory fallback - 간단한 포함 매칭
      const queryLower = query.toLowerCase()
      const results: SymbolRecord[] = []
      
      for (const sym of this.memoryStore.symbols.values()) {
        const file = this.memoryStore.files.get(sym.file_id)
        if (sym.name.toLowerCase().includes(queryLower) || 
            (sym.value && sym.value.toLowerCase().includes(queryLower)) ||
            (file?.path && file.path.toLowerCase().includes(queryLower))) {
          results.push({ ...sym, file_path: file?.path })
        }
        if (results.length >= limit) break
      }
      
      // 정확한 매칭 우선
      results.sort((a, b) => {
        const aExact = a.name === query ? 0 : 1
        const bExact = b.name === query ? 0 : 1
        if (aExact !== bExact) return aExact - bExact
        return a.name.length - b.name.length
      })
      
      return results
    }
  }

  /**
   * 파일/디렉토리 경로 검색 (새 기능!)
   */
  searchFiles(query: string, limit: number = 50): FileRecord[] {
    if (!query.trim()) return []
    
    const queryLower = query.toLowerCase()
    
    if (this.db) {
      const likePattern = `%${query}%`
      
      const stmt = this.db.prepare(`
        SELECT id, path, name, type, size, mtime, content_hash
        FROM files
        WHERE path LIKE ? OR name LIKE ?
        ORDER BY 
          CASE 
            WHEN path = ? THEN 0
            WHEN name = ? THEN 1
            WHEN name LIKE ? THEN 2
            ELSE 3 
          END,
          length(path)
        LIMIT ?
      `)
      
      const startPattern = `${query}%`
      return stmt.all(likePattern, likePattern, query, query, startPattern, limit) as FileRecord[]
    } else {
      const results: FileRecord[] = []
      
      for (const file of this.memoryStore.files.values()) {
        if (file.path.toLowerCase().includes(queryLower) ||
            file.name.toLowerCase().includes(queryLower)) {
          results.push(file)
        }
        if (results.length >= limit) break
      }
      
      // 이름 매칭 우선
      results.sort((a, b) => {
        const aExact = a.name.toLowerCase() === queryLower ? 0 : 1
        const bExact = b.name.toLowerCase() === queryLower ? 0 : 1
        if (aExact !== bExact) return aExact - bExact
        return a.path.length - b.path.length
      })
      
      return results
    }
  }

  /**
   * 디렉토리 경로 존재 확인
   */
  directoryExists(dirPath: string): boolean {
    if (this.db) {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM files WHERE path LIKE ?
      `)
      const result = stmt.get(`${dirPath}/%`) as { count: number }
      return result.count > 0
    } else {
      for (const file of this.memoryStore.files.values()) {
        if (file.path.startsWith(dirPath + '/')) {
          return true
        }
      }
      return false
    }
  }

  /**
   * 특정 디렉토리의 파일 목록
   */
  getFilesInDirectory(dirPath: string, limit: number = 100): FileRecord[] {
    if (this.db) {
      // 해당 디렉토리의 직접 자식만 (하위 디렉토리 제외)
      const stmt = this.db.prepare(`
        SELECT id, path, name, type, size, mtime, content_hash
        FROM files
        WHERE path LIKE ? AND path NOT LIKE ?
        ORDER BY name
        LIMIT ?
      `)
      
      // dirPath/file.txt는 포함, dirPath/sub/file.txt는 제외
      const directPattern = `${dirPath}/%`
      const nestedPattern = `${dirPath}/%/%`
      return stmt.all(directPattern, nestedPattern, limit) as FileRecord[]
    } else {
      const results: FileRecord[] = []
      const dirPrefix = dirPath + '/'
      
      for (const file of this.memoryStore.files.values()) {
        if (file.path.startsWith(dirPrefix)) {
          const remaining = file.path.slice(dirPrefix.length)
          if (!remaining.includes('/')) {
            results.push(file)
          }
        }
        if (results.length >= limit) break
      }
      
      return results.sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  /**
   * 정확한 심볼 찾기
   */
  findSymbol(name: string): SymbolRecord | null {
    if (this.db) {
      const stmt = this.db.prepare(`
        SELECT s.id, s.name, s.value, s.type, s.file_id, s.line, f.path as file_path
        FROM symbols s
        JOIN files f ON s.file_id = f.id
        WHERE s.name = ?
        LIMIT 1
      `)
      
      return stmt.get(name) as SymbolRecord | null
    } else {
      for (const sym of this.memoryStore.symbols.values()) {
        if (sym.name === name) {
          const file = this.memoryStore.files.get(sym.file_id)
          return { ...sym, file_path: file?.path }
        }
      }
      return null
    }
  }

  /**
   * 심볼의 모든 참조 찾기 (정의 + 사용 위치)
   * A-02: Find All References 핵심 메서드
   */
  findAllReferences(name: string, limit: number = 100): SymbolRecord[] {
    if (this.db) {
      // 정확히 일치하거나 이름에 포함된 모든 심볼 찾기
      const stmt = this.db.prepare(`
        SELECT s.id, s.name, s.value, s.type, s.file_id, s.line, f.path as file_path
        FROM symbols s
        JOIN files f ON s.file_id = f.id
        WHERE s.name = ? OR s.name LIKE ? OR s.value LIKE ?
        ORDER BY 
          CASE WHEN s.type = 'label' OR s.type = 'node' THEN 0 ELSE 1 END,
          f.path,
          s.line
        LIMIT ?
      `)
      
      const pattern = `%${name}%`
      const results = stmt.all(name, pattern, pattern, limit) as SymbolRecord[]
      return results
    } else {
      const results: SymbolRecord[] = []
      const nameLower = name.toLowerCase()
      
      for (const sym of this.memoryStore.symbols.values()) {
        if (sym.name === name || 
            sym.name.toLowerCase().includes(nameLower) ||
            (sym.value && sym.value.toLowerCase().includes(nameLower))) {
          const file = this.memoryStore.files.get(sym.file_id)
          results.push({ ...sym, file_path: file?.path })
        }
        if (results.length >= limit) break
      }
      
      return results.sort((a, b) => {
        // 라벨/노드 타입 우선
        const aIsDefType = a.type === 'label' || a.type === 'node' ? 0 : 1
        const bIsDefType = b.type === 'label' || b.type === 'node' ? 0 : 1
        if (aIsDefType !== bIsDefType) return aIsDefType - bIsDefType
        
        // 파일 경로 -> 라인 순
        const pathCompare = (a.file_path || '').localeCompare(b.file_path || '')
        if (pathCompare !== 0) return pathCompare
        return a.line - b.line
      })
    }
  }

  /**
   * DT 라벨의 모든 사용 위치 찾기 (참조 검색) - 개선됨
   * 1. dt_nodes에서 라벨 정의 찾기
   * 2. dt_properties에서 &label 참조 찾기
   */
  findDtLabelReferences(label: string, limit: number = 100): DtNodeRecord[] {
    if (this.db) {
      // 1. 라벨로 정의된 노드
      const defStmt = this.db.prepare(`
        SELECT n.*, f.path as file_path
        FROM dt_nodes n
        JOIN files f ON n.file_id = f.id
        WHERE n.label = ?
        ORDER BY f.path, n.start_line
      `)
      const definitions = defStmt.all(label) as DtNodeRecord[]
      
      // 2. 속성 값에서 &label 참조 찾기
      const refStmt = this.db.prepare(`
        SELECT DISTINCT n.*, f.path as file_path
        FROM dt_properties p
        JOIN dt_nodes n ON p.node_id = n.id
        JOIN files f ON n.file_id = f.id
        WHERE p.value LIKE ?
        ORDER BY f.path, p.line
        LIMIT ?
      `)
      const refPattern = `%&${label}%`
      const references = refStmt.all(refPattern, limit) as DtNodeRecord[]
      
      // 3. 결과 병합 (중복 제거)
      const seen = new Set<string>()
      const results: DtNodeRecord[] = []
      
      // 정의 먼저
      for (const node of definitions) {
        const key = `${node.file_path}:${node.start_line}`
        if (!seen.has(key)) {
          seen.add(key)
          results.push(node)
        }
      }
      
      // 참조 추가
      for (const node of references) {
        const key = `${node.file_path}:${node.start_line}`
        if (!seen.has(key)) {
          seen.add(key)
          results.push(node)
        }
        if (results.length >= limit) break
      }
      
      return results
    } else {
      const results: DtNodeRecord[] = []
      
      // 라벨 정의 찾기
      for (const node of this.memoryStore.dtNodes.values()) {
        if (node.label === label) {
          const file = this.memoryStore.files.get(node.file_id)
          results.push({ ...node, file_path: file?.path })
        }
      }
      
      // 속성에서 참조 찾기
      for (const prop of this.memoryStore.dtProperties.values()) {
        if (prop.value && prop.value.includes(`&${label}`)) {
          const node = this.memoryStore.dtNodes.get(prop.node_id)
          if (node) {
            const file = this.memoryStore.files.get(node.file_id)
            const exists = results.some(r => r.file_path === file?.path && r.start_line === node.start_line)
            if (!exists) {
              results.push({ ...node, file_path: file?.path })
            }
          }
        }
        if (results.length >= limit) break
      }
      
      return results.sort((a, b) => {
        const aIsDef = a.label === label ? 0 : 1
        const bIsDef = b.label === label ? 0 : 1
        if (aIsDef !== bIsDef) return aIsDef - bIsDef
        return a.start_line - b.start_line
      })
    }
  }

  /**
   * 파일 경로로 파일 정보 조회
   */
  getFileByPath(path: string): FileRecord | null {
    if (this.db) {
      const stmt = this.db.prepare(`
        SELECT id, path, name, type, size, mtime, content_hash
        FROM files
        WHERE path = ?
        LIMIT 1
      `)
      return stmt.get(path) as FileRecord | null
    } else {
      for (const file of this.memoryStore.files.values()) {
        if (file.path === path) {
          return file
        }
      }
      return null
    }
  }

  /**
   * 파일의 모든 심볼 삭제
   */
  deleteSymbolsByFile(fileId: number): void {
    if (this.db) {
      const stmt = this.db.prepare(`DELETE FROM symbols WHERE file_id = ?`)
      stmt.run(fileId)
    } else {
      for (const [id, sym] of this.memoryStore.symbols) {
        if (sym.file_id === fileId) {
          this.memoryStore.symbols.delete(id)
        }
      }
    }
  }

  // ============================================
  // Include 관련 메서드
  // ============================================

  /**
   * Include 관계 추가 (배치)
   */
  insertIncludes(includes: Omit<IncludeRecord, 'id'>[]): void {
    if (includes.length === 0) return
    
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO includes (from_file_id, to_path, type, line)
        VALUES (?, ?, ?, ?)
      `)
      
      const insertMany = this.db.transaction((items: Omit<IncludeRecord, 'id'>[]) => {
        for (const item of items) {
          stmt.run(item.from_file_id, item.to_path, item.type, item.line)
        }
      })
      
      insertMany(includes)
    } else {
      for (const inc of includes) {
        const id = this.memoryStore.nextId.includes++
        this.memoryStore.includes.set(id, { ...inc, id })
      }
    }
  }

  /**
   * 파일을 include하는 파일들 찾기
   */
  getFilesIncluding(filePath: string): string[] {
    if (this.db) {
      const fileName = filePath.split('/').pop() || ''
      
      const stmt = this.db.prepare(`
        SELECT DISTINCT f.path
        FROM includes i
        JOIN files f ON i.from_file_id = f.id
        WHERE i.to_path = ? OR i.to_path LIKE ?
      `)
      
      const rows = stmt.all(filePath, `%/${fileName}`) as { path: string }[]
      return rows.map(r => r.path)
    } else {
      const fileName = filePath.split('/').pop() || ''
      const result: string[] = []
      
      for (const inc of this.memoryStore.includes.values()) {
        if (inc.to_path === filePath || inc.to_path.endsWith(`/${fileName}`)) {
          const file = this.memoryStore.files.get(inc.from_file_id)
          if (file) result.push(file.path)
        }
      }
      
      return [...new Set(result)]
    }
  }

  /**
   * 파일이 include하는 파일들 찾기
   */
  getIncludedFiles(filePath: string): IncludeRecord[] {
    if (this.db) {
      const stmt = this.db.prepare(`
        SELECT i.*, f.path as from_path
        FROM includes i
        JOIN files f ON i.from_file_id = f.id
        WHERE f.path = ?
      `)
      
      return stmt.all(filePath) as IncludeRecord[]
    } else {
      const file = Array.from(this.memoryStore.files.values()).find(f => f.path === filePath)
      if (!file) return []
      
      const result: IncludeRecord[] = []
      for (const inc of this.memoryStore.includes.values()) {
        if (inc.from_file_id === file.id) {
          result.push({ ...inc, from_path: file.path })
        }
      }
      return result
    }
  }

  // ============================================
  // Device Tree 관련 메서드
  // ============================================

  /**
   * DT 노드 추가 (배치)
   */
  insertDtNodes(nodes: Omit<DtNodeRecord, 'id'>[]): number[] {
    if (nodes.length === 0) return []
    
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO dt_nodes (file_id, path, name, label, address, parent_id, start_line, end_line)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      
      const ids: number[] = []
      const insertMany = this.db.transaction((items: Omit<DtNodeRecord, 'id'>[]) => {
        for (const item of items) {
          const result = stmt.run(
            item.file_id, item.path, item.name, item.label || null,
            item.address || null, item.parent_id || null, item.start_line, item.end_line
          )
          ids.push(Number(result.lastInsertRowid))
        }
      })
      
      insertMany(nodes)
      return ids
    } else {
      const ids: number[] = []
      for (const node of nodes) {
        const id = this.memoryStore.nextId.dtNodes++
        this.memoryStore.dtNodes.set(id, { ...node, id })
        ids.push(id)
      }
      return ids
    }
  }

  /**
   * DT 속성 추가 (배치)
   */
  insertDtProperties(props: Omit<DtPropertyRecord, 'id'>[]): void {
    if (props.length === 0) return
    
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO dt_properties (node_id, name, value, line)
        VALUES (?, ?, ?, ?)
      `)
      
      const insertMany = this.db.transaction((items: Omit<DtPropertyRecord, 'id'>[]) => {
        for (const item of items) {
          stmt.run(item.node_id, item.name, item.value || null, item.line)
        }
      })
      
      insertMany(props)
    } else {
      for (const prop of props) {
        const id = this.memoryStore.nextId.dtProperties++
        this.memoryStore.dtProperties.set(id, { ...prop, id })
      }
    }
  }

  /**
   * 라벨로 DT 노드 찾기
   */
  findDtNodeByLabel(label: string): DtNodeRecord | null {
    if (this.db) {
      const stmt = this.db.prepare(`
        SELECT n.*, f.path as file_path
        FROM dt_nodes n
        JOIN files f ON n.file_id = f.id
        WHERE n.label = ?
        LIMIT 1
      `)
      
      return stmt.get(label) as DtNodeRecord | null
    } else {
      for (const node of this.memoryStore.dtNodes.values()) {
        if (node.label === label) {
          const file = this.memoryStore.files.get(node.file_id)
          return { ...node, file_path: file?.path }
        }
      }
      return null
    }
  }

  /**
   * 경로로 DT 노드 찾기
   */
  findDtNodeByPath(nodePath: string): DtNodeRecord | null {
    if (this.db) {
      const stmt = this.db.prepare(`
        SELECT n.*, f.path as file_path
        FROM dt_nodes n
        JOIN files f ON n.file_id = f.id
        WHERE n.path = ?
        LIMIT 1
      `)
      
      return stmt.get(nodePath) as DtNodeRecord | null
    } else {
      for (const node of this.memoryStore.dtNodes.values()) {
        if (node.path === nodePath) {
          const file = this.memoryStore.files.get(node.file_id)
          return { ...node, file_path: file?.path }
        }
      }
      return null
    }
  }

  /**
   * DT 노드 검색 (라벨 또는 이름으로)
   * 자동완성용
   */
  searchDtNodes(query: string, limit: number = 30): DtNodeRecord[] {
    if (!query || query.length === 0) return []
    
    if (this.db) {
      // 라벨이 있는 노드만 검색 (phandle 참조 가능한 노드)
      const stmt = this.db.prepare(`
        SELECT n.*, f.path as file_path
        FROM dt_nodes n
        JOIN files f ON n.file_id = f.id
        WHERE n.label IS NOT NULL 
          AND (n.label LIKE ? OR n.name LIKE ?)
        ORDER BY 
          CASE WHEN n.label LIKE ? THEN 0 ELSE 1 END,
          LENGTH(n.label)
        LIMIT ?
      `)
      
      const pattern = `${query}%`
      const exactPattern = `${query}%`
      return stmt.all(pattern, pattern, exactPattern, limit) as DtNodeRecord[]
    } else {
      const results: DtNodeRecord[] = []
      const lowerQuery = query.toLowerCase()
      
      for (const node of this.memoryStore.dtNodes.values()) {
        if (node.label && (
          node.label.toLowerCase().startsWith(lowerQuery) ||
          node.name.toLowerCase().startsWith(lowerQuery)
        )) {
          const file = this.memoryStore.files.get(node.file_id)
          results.push({ ...node, file_path: file?.path })
          if (results.length >= limit) break
        }
      }
      
      return results
    }
  }

  // ============================================
  // GPIO 관련 메서드
  // ============================================

  /**
   * GPIO 핀 추가 (배치)
   */
  insertGpioPins(pins: Omit<GpioPinRecord, 'id'>[]): void {
    if (pins.length === 0) return
    
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO gpio_pins (file_id, controller, pin, label, function, direction, line)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      
      const insertMany = this.db.transaction((items: Omit<GpioPinRecord, 'id'>[]) => {
        for (const item of items) {
          stmt.run(
            item.file_id, item.controller, item.pin,
            item.label || null, item.function || null, item.direction || null, item.line
          )
        }
      })
      
      insertMany(pins)
    } else {
      for (const pin of pins) {
        const id = this.memoryStore.nextId.gpioPins++
        this.memoryStore.gpioPins.set(id, { ...pin, id })
      }
    }
  }

  /**
   * GPIO 핀 검색
   */
  searchGpioPins(query: string): GpioPinRecord[] {
    if (!query.trim()) return []
    
    if (this.db) {
      const pattern = `%${query}%`
      
      const stmt = this.db.prepare(`
        SELECT g.*, f.path as file_path
        FROM gpio_pins g
        JOIN files f ON g.file_id = f.id
        WHERE g.label LIKE ? OR g.function LIKE ? OR g.controller LIKE ?
        LIMIT 50
      `)
      
      return stmt.all(pattern, pattern, pattern) as GpioPinRecord[]
    } else {
      const queryLower = query.toLowerCase()
      const results: GpioPinRecord[] = []
      
      for (const pin of this.memoryStore.gpioPins.values()) {
        if ((pin.label && pin.label.toLowerCase().includes(queryLower)) ||
            (pin.function && pin.function.toLowerCase().includes(queryLower)) ||
            pin.controller.toLowerCase().includes(queryLower)) {
          const file = this.memoryStore.files.get(pin.file_id)
          results.push({ ...pin, file_path: file?.path })
        }
        if (results.length >= 50) break
      }
      
      return results
    }
  }

  // ============================================
  // 메타데이터 관련 메서드
  // ============================================

  /**
   * 메타데이터 설정
   */
  setMetadata(key: string, value: string): void {
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)
      `)
      stmt.run(key, value)
    } else {
      this.memoryStore.metadata.set(key, value)
    }
  }

  /**
   * 메타데이터 조회
   */
  getMetadata(key: string): string | null {
    if (this.db) {
      const stmt = this.db.prepare(`SELECT value FROM metadata WHERE key = ?`)
      const row = stmt.get(key) as { value: string } | undefined
      return row?.value ?? null
    } else {
      return this.memoryStore.metadata.get(key) ?? null
    }
  }

  // ============================================
  // 유틸리티 메서드
  // ============================================

  /**
   * 전체 통계
   */
  getStats(): { files: number; symbols: number; includes: number; dtNodes: number; gpioPins: number } {
    if (this.db) {
      const files = (this.db.prepare(`SELECT COUNT(*) as cnt FROM files`).get() as { cnt: number }).cnt
      const symbols = (this.db.prepare(`SELECT COUNT(*) as cnt FROM symbols`).get() as { cnt: number }).cnt
      const includes = (this.db.prepare(`SELECT COUNT(*) as cnt FROM includes`).get() as { cnt: number }).cnt
      const dtNodes = (this.db.prepare(`SELECT COUNT(*) as cnt FROM dt_nodes`).get() as { cnt: number }).cnt
      const gpioPins = (this.db.prepare(`SELECT COUNT(*) as cnt FROM gpio_pins`).get() as { cnt: number }).cnt
      
      return { files, symbols, includes, dtNodes, gpioPins }
    } else {
      return {
        files: this.memoryStore.files.size,
        symbols: this.memoryStore.symbols.size,
        includes: this.memoryStore.includes.size,
        dtNodes: this.memoryStore.dtNodes.size,
        gpioPins: this.memoryStore.gpioPins.size
      }
    }
  }

  /**
   * 인덱스 초기화 (모든 데이터 삭제)
   */
  clearAll(): void {
    if (this.db) {
      this.db.exec(`
        DELETE FROM gpio_pins;
        DELETE FROM dt_properties;
        DELETE FROM dt_nodes;
        DELETE FROM includes;
        DELETE FROM symbols;
        DELETE FROM files;
        DELETE FROM metadata;
      `)
      console.log('[IndexDB] All data cleared')
    } else {
      this.memoryStore.files.clear()
      this.memoryStore.symbols.clear()
      this.memoryStore.includes.clear()
      this.memoryStore.dtNodes.clear()
      this.memoryStore.dtProperties.clear()
      this.memoryStore.gpioPins.clear()
      this.memoryStore.metadata.clear()
      this.memoryStore.nextId = { files: 1, symbols: 1, includes: 1, dtNodes: 1, dtProperties: 1, gpioPins: 1 }
      console.log('[IndexDB] Memory store cleared')
    }
  }

  /**
   * 데이터베이스 닫기
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      console.log('[IndexDB] Closed')
    }
    this.initialized = false
  }

  /**
   * 트랜잭션 실행
   */
  transaction<T>(fn: () => T): T {
    if (this.db) {
      return this.db.transaction(fn)()
    } else {
      // Memory fallback은 단순히 함수 실행
      return fn()
    }
  }

  /**
   * DB 파일 경로 반환 (서버 저장용)
   */
  getDbPath(): string {
    return this.dbPath
  }

  /**
   * DB가 초기화되었는지 확인
   */
  isInitialized(): boolean {
    return this.initialized && this.db !== null
  }

  /**
   * WAL 체크포인트 (서버 저장 전 호출)
   * WAL 모드에서 모든 변경사항을 메인 DB 파일에 기록
   */
  checkpoint(): void {
    if (this.db) {
      this.db.pragma('wal_checkpoint(TRUNCATE)')
    }
  }
}

// 싱글톤 인스턴스
export const indexDb = new IndexDatabase()
