/**
 * LRU (Least Recently Used) 캐시 구현
 * 다단계 캐싱 전략의 L1 레이어
 */

interface CacheEntry<T> {
  value: T
  size: number
  timestamp: number
}

export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map()
  private maxSize: number
  private currentSize: number = 0
  private maxEntries: number
  private ttl: number  // Time To Live (ms)
  private sizeCalculator: (value: V) => number
  private hits: number = 0
  private misses: number = 0

  constructor(options: {
    maxSize?: number       // 최대 바이트 크기
    maxEntries?: number    // 최대 항목 수
    ttl?: number           // TTL (ms)
    sizeCalculation?: (value: V) => number
  }) {
    this.maxSize = options.maxSize ?? 100 * 1024 * 1024  // 기본 100MB
    this.maxEntries = options.maxEntries ?? 1000
    this.ttl = options.ttl ?? 30 * 60 * 1000  // 기본 30분
    this.sizeCalculator = options.sizeCalculation ?? (() => 1)
  }

  /**
   * 값 가져오기
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key)
    
    if (!entry) {
      this.misses++
      return undefined
    }
    
    // TTL 체크
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key)
      this.misses++
      return undefined
    }
    
    // LRU: 최근 접근한 항목을 맨 뒤로 이동
    this.cache.delete(key)
    this.cache.set(key, { ...entry, timestamp: Date.now() })
    
    this.hits++
    return entry.value
  }

  /**
   * 값 설정
   */
  set(key: K, value: V): void {
    // 기존 항목 삭제
    if (this.cache.has(key)) {
      this.delete(key)
    }
    
    const size = this.sizeCalculator(value)
    
    // 공간 확보
    while (
      (this.currentSize + size > this.maxSize || this.cache.size >= this.maxEntries) &&
      this.cache.size > 0
    ) {
      this.evictOldest()
    }
    
    // 새 항목 추가
    this.cache.set(key, {
      value,
      size,
      timestamp: Date.now()
    })
    this.currentSize += size
  }

  /**
   * 항목 삭제
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key)
    if (entry) {
      this.currentSize -= entry.size
      return this.cache.delete(key)
    }
    return false
  }

  /**
   * 항목 존재 여부
   */
  has(key: K): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    
    // TTL 체크
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key)
      return false
    }
    
    return true
  }

  /**
   * 가장 오래된 항목 제거
   */
  private evictOldest(): void {
    const oldestKey = this.cache.keys().next().value
    if (oldestKey !== undefined) {
      this.delete(oldestKey)
    }
  }

  /**
   * 전체 초기화
   */
  clear(): void {
    this.cache.clear()
    this.currentSize = 0
    this.hits = 0
    this.misses = 0
  }

  /**
   * 만료된 항목 정리
   */
  prune(): number {
    const now = Date.now()
    let pruned = 0
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.delete(key)
        pruned++
      }
    }
    
    return pruned
  }

  /**
   * 통계 조회
   */
  getStats(): {
    size: number
    entries: number
    maxSize: number
    maxEntries: number
    hits: number
    misses: number
    hitRate: number
  } {
    const total = this.hits + this.misses
    return {
      size: this.currentSize,
      entries: this.cache.size,
      maxSize: this.maxSize,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0
    }
  }

  /**
   * 모든 키 조회
   */
  keys(): K[] {
    return Array.from(this.cache.keys())
  }

  /**
   * 크기
   */
  get length(): number {
    return this.cache.size
  }
}

// ============================================
// 전역 캐시 인스턴스들
// ============================================

/**
 * 파일 내용 캐시 (L1)
 * - 최대 100MB
 * - TTL: 30분
 */
export const fileContentCache = new LRUCache<string, string>({
  maxSize: 100 * 1024 * 1024,
  maxEntries: 500,
  ttl: 30 * 60 * 1000,
  sizeCalculation: (value) => value.length * 2  // UTF-16
})

/**
 * 파싱된 AST 캐시
 * - 최대 200개
 * - TTL: 1시간
 */
export const astCache = new LRUCache<string, any>({
  maxEntries: 200,
  ttl: 60 * 60 * 1000,
  sizeCalculation: () => 1  // 개수 기반
})

/**
 * 검색 결과 캐시
 * - 최대 1000개
 * - TTL: 5분
 */
export const searchCache = new LRUCache<string, any[]>({
  maxEntries: 1000,
  ttl: 5 * 60 * 1000,
  sizeCalculation: () => 1
})

/**
 * 심볼 정의 캐시
 * - 최대 5000개
 * - TTL: 1시간
 */
export const symbolCache = new LRUCache<string, any>({
  maxEntries: 5000,
  ttl: 60 * 60 * 1000,
  sizeCalculation: () => 1
})

/**
 * 모든 캐시 초기화
 */
export function clearAllCaches(): void {
  fileContentCache.clear()
  astCache.clear()
  searchCache.clear()
  symbolCache.clear()
  console.log('[Cache] All caches cleared')
}

/**
 * 모든 캐시 통계
 */
export function getAllCacheStats(): Record<string, ReturnType<LRUCache<any, any>['getStats']>> {
  return {
    fileContent: fileContentCache.getStats(),
    ast: astCache.getStats(),
    search: searchCache.getStats(),
    symbol: symbolCache.getStats()
  }
}

/**
 * 만료된 항목 정리
 */
export function pruneAllCaches(): number {
  let total = 0
  total += fileContentCache.prune()
  total += astCache.prune()
  total += searchCache.prune()
  total += symbolCache.prune()
  return total
}

// 주기적 정리 (5분마다)
setInterval(() => {
  const pruned = pruneAllCaches()
  if (pruned > 0) {
    console.log(`[Cache] Pruned ${pruned} expired entries`)
  }
}, 5 * 60 * 1000)
