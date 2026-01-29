# 🚀 핵폭탄급 성능 아키텍처 설계

> **목표**: "PA_13 검색 → 0.001초 응답"  
> **현재**: 서버 grep 기반 → 2~5초  
> **목표**: 로컬 인덱스 기반 → **1ms 이하**

---

## 📊 현재 vs 목표 성능 비교

| 기능 | 현재 방식 | 현재 속도 | 목표 방식 | 목표 속도 |
|------|----------|----------|----------|----------|
| 심볼 검색 | SSH + grep | 2~5초 | SQLite FTS5 | **< 1ms** |
| 매크로 해석 | SSH + grep | 3~8초 | 메모리 캐시 | **< 0.1ms** |
| Include Chain | SSH + grep | 1~3초 | 그래프 DB | **< 1ms** |
| 파일 열기 | SSH + SFTP | 0.5~2초 | 로컬 캐시 | **< 10ms** |
| Go to Definition | 미구현 | - | LSP 서버 | **< 50ms** |

---

## 🏗️ 핵심 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BSP Studio Architecture                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │   Monaco    │    │   Viewers   │    │   Search    │                  │
│  │   Editor    │    │  (DT/GPIO)  │    │   Panel     │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                  │                  │                          │
│         └──────────────────┼──────────────────┘                          │
│                            │                                             │
│                            ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    🚀 Performance Layer                          │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │    │
│  │  │   SQLite    │  │   Memory    │  │   Worker    │              │    │
│  │  │   Index     │  │   Cache     │  │   Threads   │              │    │
│  │  │   (FTS5)    │  │   (LRU)     │  │   (Parser)  │              │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                            │                                             │
│                            ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    📦 Data Layer                                 │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │    │
│  │  │   Local     │  │   Index     │  │   SSH       │              │    │
│  │  │   Mirror    │  │   DB File   │  │   (Fallback)│              │    │
│  │  │   (rsync)   │  │   (.bspidx) │  │             │              │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ SQLite 기반 인덱스 DB

### 왜 SQLite인가?
- **FTS5 (Full-Text Search)**: 밀리초 단위 전문 검색
- **단일 파일**: `.bspidx` 파일 하나로 관리
- **Electron 호환**: `better-sqlite3`로 동기 API 지원
- **오프라인 지원**: 서버 연결 없이도 검색 가능

### 스키마 설계

```sql
-- 파일 테이블
CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- 'recipe', 'header', 'dts', 'config'
    size INTEGER,
    mtime INTEGER,       -- 수정 시간 (변경 감지용)
    content_hash TEXT    -- SHA256 (변경 감지용)
);

-- 심볼 테이블 (FTS5 전문 검색)
CREATE VIRTUAL TABLE symbols USING fts5(
    name,           -- 심볼명 (PA_13, CONFIG_SPI, etc.)
    value,          -- 값 (0x1234, etc.)
    type,           -- 'define', 'function', 'variable', 'node'
    file_id UNINDEXED,
    line UNINDEXED,
    content_type='0'
);

-- Include 관계 테이블
CREATE TABLE includes (
    id INTEGER PRIMARY KEY,
    from_file_id INTEGER REFERENCES files(id),
    to_path TEXT NOT NULL,
    type TEXT NOT NULL,  -- 'require', 'include', '#include', 'inherit'
    line INTEGER
);
CREATE INDEX idx_includes_from ON includes(from_file_id);
CREATE INDEX idx_includes_to ON includes(to_path);

-- Device Tree 노드 테이블
CREATE TABLE dt_nodes (
    id INTEGER PRIMARY KEY,
    file_id INTEGER REFERENCES files(id),
    path TEXT NOT NULL,      -- /soc/gpio@40000000
    name TEXT NOT NULL,      -- gpio
    label TEXT,              -- &gpio0
    address TEXT,            -- 40000000
    parent_id INTEGER REFERENCES dt_nodes(id),
    start_line INTEGER,
    end_line INTEGER
);
CREATE INDEX idx_dt_nodes_path ON dt_nodes(path);
CREATE INDEX idx_dt_nodes_label ON dt_nodes(label);

-- Device Tree 속성 테이블
CREATE TABLE dt_properties (
    id INTEGER PRIMARY KEY,
    node_id INTEGER REFERENCES dt_nodes(id),
    name TEXT NOT NULL,
    value TEXT,
    line INTEGER
);
CREATE INDEX idx_dt_props_name ON dt_properties(name);

-- GPIO/핀 테이블 (미리 파싱된 정보)
CREATE TABLE gpio_pins (
    id INTEGER PRIMARY KEY,
    file_id INTEGER REFERENCES files(id),
    controller TEXT NOT NULL,  -- gpio0, gpio1
    pin INTEGER NOT NULL,
    label TEXT,
    function TEXT,             -- UART_TX, SPI_CLK
    direction TEXT,            -- in, out, inout
    line INTEGER
);
CREATE INDEX idx_gpio_pins_label ON gpio_pins(label);
CREATE INDEX idx_gpio_pins_function ON gpio_pins(function);

-- 메타데이터
CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT
);
-- 예: project_path, index_time, version, etc.
```

### 검색 성능

```typescript
// 현재: 서버 grep (2~5초)
const result = await ssh.exec(`grep -rn "PA_13" .`)

// 목표: SQLite FTS5 (< 1ms)
const results = db.prepare(`
  SELECT s.name, s.value, s.line, f.path
  FROM symbols s
  JOIN files f ON s.file_id = f.id
  WHERE symbols MATCH ?
  ORDER BY rank
  LIMIT 50
`).all('PA_13*')
```

---

## 2️⃣ 멀티 프로세싱 (Web Workers)

### 현재 문제
- 인덱싱/파싱이 메인 스레드에서 실행 → UI 블로킹
- 큰 파일 파싱 시 앱 멈춤

### 해결: Worker Threads

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Process                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   UI Thread │  │   IPC       │  │   SSH       │              │
│  │   (React)   │  │   Handler   │  │   Manager   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          │                                       │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Worker Pool                            │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │    │
│  │  │ Parser  │  │ Parser  │  │ Indexer │  │ Search  │     │    │
│  │  │ Worker 1│  │ Worker 2│  │ Worker  │  │ Worker  │     │    │
│  │  │ (DTS)   │  │ (BB)    │  │ (SQLite)│  │ (FTS5)  │     │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 구현 예시

```typescript
// workers/dts-parser.worker.ts
import { parentPort } from 'worker_threads'

parentPort?.on('message', ({ type, content, filePath }) => {
  if (type === 'parse') {
    const ast = parseDTS(content)  // CPU 집약적 작업
    parentPort?.postMessage({ type: 'result', ast, filePath })
  }
})

// main process
import { Worker } from 'worker_threads'

class ParserPool {
  private workers: Worker[] = []
  private queue: Task[] = []
  
  constructor(size = 4) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker('./workers/dts-parser.worker.js')
      worker.on('message', this.handleResult.bind(this))
      this.workers.push(worker)
    }
  }
  
  async parse(content: string, filePath: string): Promise<AST> {
    return new Promise((resolve) => {
      this.queue.push({ content, filePath, resolve })
      this.processQueue()
    })
  }
}
```

### 인덱싱 병렬화

```typescript
// 현재: 순차 처리 (느림)
for (const file of files) {
  await parseFile(file)  // 하나씩...
}

// 목표: 병렬 처리 (빠름!)
const BATCH_SIZE = 50
const batches = chunk(files, BATCH_SIZE)

for (const batch of batches) {
  await Promise.all(batch.map(file => workerPool.parse(file)))
  updateProgress(batch.length)
}
```

---

## 3️⃣ 다단계 캐싱 전략

```
┌─────────────────────────────────────────────────────────────────┐
│                      Caching Layers                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  L1: Memory Cache (LRU)                                         │
│  ├─ 용량: 100MB                                                  │
│  ├─ TTL: 세션 동안                                               │
│  ├─ 대상: 최근 열린 파일, 검색 결과, 파싱된 AST                    │
│  └─ 속도: < 0.01ms                                               │
│                                                                  │
│  L2: SQLite Index DB                                            │
│  ├─ 용량: 무제한 (디스크)                                         │
│  ├─ TTL: 파일 변경 시까지                                        │
│  ├─ 대상: 심볼, Include 관계, DT 노드, GPIO 핀                   │
│  └─ 속도: < 1ms                                                  │
│                                                                  │
│  L3: Local File Mirror                                          │
│  ├─ 용량: 프로젝트 크기 (수 GB)                                   │
│  ├─ TTL: rsync 동기화 시까지                                     │
│  ├─ 대상: 자주 접근하는 파일 (*.h, *.dts, *.bb)                  │
│  └─ 속도: < 10ms                                                 │
│                                                                  │
│  L4: SSH/SFTP (Origin)                                          │
│  ├─ 용량: 서버 전체                                              │
│  ├─ TTL: 실시간                                                  │
│  ├─ 대상: 모든 파일                                              │
│  └─ 속도: 100ms ~ 2s                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### LRU 캐시 구현

```typescript
// stores/cacheStore.ts
import LRU from 'lru-cache'

const fileCache = new LRU<string, string>({
  max: 500,           // 최대 500개 파일
  maxSize: 100_000_000,  // 100MB
  sizeCalculation: (value) => value.length,
  ttl: 1000 * 60 * 30,   // 30분
})

const astCache = new LRU<string, AST>({
  max: 100,           // 최대 100개 AST
  ttl: 1000 * 60 * 60,   // 1시간
})

const searchCache = new LRU<string, SearchResult[]>({
  max: 1000,          // 최대 1000개 검색 결과
  ttl: 1000 * 60 * 5,    // 5분
})

export function getCachedFile(path: string): string | null {
  return fileCache.get(path) ?? null
}

export function cacheFile(path: string, content: string): void {
  fileCache.set(path, content)
}
```

### 캐시 무효화 전략

```typescript
// 파일 변경 감지 (inotify 또는 polling)
async function watchFileChanges(projectPath: string) {
  const watcher = await ssh.exec(`inotifywait -m -r -e modify,create,delete ${projectPath}`)
  
  watcher.on('change', (event) => {
    const { path, type } = parseEvent(event)
    
    // L1 캐시 무효화
    fileCache.delete(path)
    astCache.delete(path)
    
    // L2 인덱스 업데이트
    if (type === 'delete') {
      db.exec(`DELETE FROM files WHERE path = ?`, path)
    } else {
      queueReindex(path)
    }
  })
}
```

---

## 4️⃣ 증분 인덱싱

### 현재 문제
- 프로젝트 열 때마다 전체 인덱싱 → 느림
- 파일 하나 변경해도 전체 재인덱싱

### 해결: 변경 감지 기반 증분 업데이트

```typescript
interface FileChange {
  path: string
  type: 'added' | 'modified' | 'deleted'
  mtime: number
}

async function incrementalIndex(projectPath: string): Promise<void> {
  // 1. 현재 파일 목록 가져오기
  const currentFiles = await ssh.exec(`find . -type f -name "*.h" -printf "%p\\t%T@\\n"`)
  
  // 2. DB의 파일 목록과 비교
  const dbFiles = db.prepare(`SELECT path, mtime FROM files`).all()
  const dbFileMap = new Map(dbFiles.map(f => [f.path, f.mtime]))
  
  const changes: FileChange[] = []
  
  for (const line of currentFiles.split('\n')) {
    const [path, mtime] = line.split('\t')
    const dbMtime = dbFileMap.get(path)
    
    if (!dbMtime) {
      changes.push({ path, type: 'added', mtime: parseFloat(mtime) })
    } else if (parseFloat(mtime) > dbMtime) {
      changes.push({ path, type: 'modified', mtime: parseFloat(mtime) })
    }
    dbFileMap.delete(path)
  }
  
  // 남은 건 삭제된 파일
  for (const [path] of dbFileMap) {
    changes.push({ path, type: 'deleted', mtime: 0 })
  }
  
  // 3. 변경된 파일만 재인덱싱
  console.log(`[Index] ${changes.length} files changed`)
  
  for (const change of changes) {
    if (change.type === 'deleted') {
      await removeFromIndex(change.path)
    } else {
      await indexFile(change.path)
    }
  }
}
```

---

## 5️⃣ 사전 빌드된 인덱스 (Pre-built Index)

### 개념
BSP 벤더(NXP, TI 등)가 제공하는 공식 인덱스 파일

```
┌─────────────────────────────────────────────────────────────────┐
│                    Pre-built Index Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BSP 벤더 (NXP, TI, Xilinx...)                                  │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  CI/CD에서 인덱스 생성                                    │    │
│  │  • s32g-bsp-300.bspidx (50MB)                            │    │
│  │  • imx8-bsp-5.15.bspidx                                  │    │
│  │  • zynq-bsp-2024.1.bspidx                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Index Repository (GitHub/CDN)                           │    │
│  │  https://bsp-indexes.example.com/                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  BSP Studio                                              │    │
│  │  1. 프로젝트 열기                                         │    │
│  │  2. BSP 버전 감지 (s32g-bsp-300)                         │    │
│  │  3. 사전 빌드 인덱스 다운로드                             │    │
│  │  4. 로컬 변경사항만 증분 인덱싱                           │    │
│  │  → 인덱싱 시간: 30분 → 10초!                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 인덱스 파일 포맷

```typescript
interface BspIndex {
  version: string           // "1.0"
  bsp: {
    vendor: string          // "NXP"
    name: string            // "s32g-bsp"
    version: string         // "30.0"
    machine: string[]       // ["s32g274ardb2", "s32g399ardb3"]
  }
  created: string           // ISO 8601
  
  // 압축된 SQLite DB (gzip)
  database: Buffer
}

// 다운로드 및 적용
async function applyPrebuiltIndex(bspName: string): Promise<void> {
  const indexUrl = `https://bsp-indexes.example.com/${bspName}.bspidx`
  const response = await fetch(indexUrl)
  const indexData = await response.arrayBuffer()
  
  // 압축 해제 및 DB 적용
  const db = await gunzip(indexData)
  await fs.writeFile(getIndexPath(bspName), db)
  
  console.log(`[Index] Pre-built index applied: ${bspName}`)
}
```

---

## 6️⃣ LSP (Language Server Protocol) 통합

### 목표
- Go to Definition: **< 50ms**
- Find References: **< 100ms**
- Hover Info: **< 30ms**
- Auto-complete: **< 50ms**

### 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                        LSP Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Monaco Editor                                                   │
│       │                                                          │
│       │ LSP Protocol (JSON-RPC)                                  │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   BSP Language Server                    │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │   DTS       │  │   BitBake   │  │   C/H       │      │    │
│  │  │   Provider  │  │   Provider  │  │   Provider  │      │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │    │
│  │         │                │                │              │    │
│  │         └────────────────┼────────────────┘              │    │
│  │                          │                               │    │
│  │                          ▼                               │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │              Index Database                      │    │    │
│  │  │              (SQLite + FTS5)                     │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### LSP 기능 구현

```typescript
// lsp/dts-provider.ts
class DtsLanguageProvider implements LanguageProvider {
  
  // Go to Definition
  async provideDefinition(
    document: TextDocument,
    position: Position
  ): Promise<Location | null> {
    const word = getWordAtPosition(document, position)
    
    // &label 참조인 경우
    if (word.startsWith('&')) {
      const label = word.slice(1)
      const node = db.prepare(`
        SELECT f.path, n.start_line
        FROM dt_nodes n
        JOIN files f ON n.file_id = f.id
        WHERE n.label = ?
      `).get(label)
      
      if (node) {
        return { uri: node.path, range: { start: { line: node.start_line, character: 0 } } }
      }
    }
    
    // 매크로인 경우
    const symbol = db.prepare(`
      SELECT f.path, s.line
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE s.name = ?
      LIMIT 1
    `).get(word)
    
    if (symbol) {
      return { uri: symbol.path, range: { start: { line: symbol.line, character: 0 } } }
    }
    
    return null
  }
  
  // Hover Info
  async provideHover(
    document: TextDocument,
    position: Position
  ): Promise<Hover | null> {
    const word = getWordAtPosition(document, position)
    
    const symbol = db.prepare(`
      SELECT name, value, type, f.path, line
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE s.name = ?
    `).get(word)
    
    if (symbol) {
      return {
        contents: {
          kind: 'markdown',
          value: `**${symbol.name}**\n\n\`\`\`c\n#define ${symbol.name} ${symbol.value}\n\`\`\`\n\n📄 ${symbol.path}:${symbol.line}`
        }
      }
    }
    
    return null
  }
  
  // Auto-complete
  async provideCompletionItems(
    document: TextDocument,
    position: Position
  ): Promise<CompletionItem[]> {
    const prefix = getWordPrefixAtPosition(document, position)
    
    const symbols = db.prepare(`
      SELECT name, value, type
      FROM symbols
      WHERE name LIKE ?
      LIMIT 20
    `).all(`${prefix}%`)
    
    return symbols.map(s => ({
      label: s.name,
      kind: CompletionItemKind.Constant,
      detail: s.value,
      insertText: s.name,
    }))
  }
}
```

---

## 📅 구현 로드맵

### Phase 1: 기반 구축 (2주)
- [ ] SQLite + better-sqlite3 통합
- [ ] 기본 스키마 구현
- [ ] 기존 인덱스 로직을 SQLite로 마이그레이션

### Phase 2: 성능 최적화 (2주)
- [ ] FTS5 전문 검색 구현
- [ ] LRU 캐시 레이어 추가
- [ ] 증분 인덱싱 구현

### Phase 3: 병렬화 (1주)
- [ ] Worker Thread 풀 구현
- [ ] 파서 병렬화 (DTS, BB, C/H)
- [ ] 인덱싱 병렬화

### Phase 4: LSP 통합 (2주)
- [ ] LSP 서버 구현
- [ ] Monaco LSP 클라이언트 연결
- [ ] Go to Definition, Hover, Auto-complete

### Phase 5: 고급 기능 (2주)
- [ ] 사전 빌드 인덱스 지원
- [ ] 로컬 파일 미러링 (rsync)
- [ ] 실시간 파일 변경 감지

---

## 🎯 예상 성능 향상

| 기능 | 현재 | 목표 | 향상률 |
|------|------|------|--------|
| 심볼 검색 | 3초 | 1ms | **3000x** |
| 매크로 해석 | 5초 | 0.1ms | **50000x** |
| Go to Definition | N/A | 50ms | ∞ |
| 인덱싱 (첫 실행) | 30초 | 30초 | 1x |
| 인덱싱 (재실행) | 30초 | 2초 | **15x** |
| 인덱싱 (사전빌드) | 30초 | 0초 | **∞** |

---

## 💡 추가 아이디어

### 1. AI 기반 코드 이해
```typescript
// 빌드 에러 → AI가 원인 분석 + 해결책 제시
const error = "do_compile: oe_runmake failed"
const analysis = await ai.analyzeError(error, context)
// → "DEPENDS에 'openssl-native' 추가 필요"
```

### 2. 시각적 의존성 그래프
- D3.js로 레시피 의존성 시각화
- 빌드 순서 애니메이션
- 병목 지점 하이라이트

### 3. 스마트 자동완성
- 컨텍스트 기반 제안 (현재 MACHINE에 맞는 옵션)
- 자주 사용하는 패턴 학습
- 타이핑 예측

### 4. 실시간 협업
- 여러 개발자가 같은 프로젝트 동시 편집
- 변경사항 실시간 동기화
- 충돌 감지 및 해결

---

> **결론**: 이 아키텍처를 적용하면 현재 대비 **수천 배** 빠른 성능을 달성할 수 있습니다.  
> 특히 SQLite FTS5 + 캐싱 + 병렬화 조합은 **진짜 핵폭탄급**입니다! 🚀💣
