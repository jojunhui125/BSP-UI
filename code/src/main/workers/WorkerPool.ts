/**
 * 워커 풀 관리자
 * 여러 Worker Thread를 관리하여 병렬 처리
 * 
 * 워커를 찾을 수 없어도 앱이 실행되도록 안전한 fallback 제공
 */

import { Worker } from 'worker_threads'
import { join } from 'path'
import { cpus } from 'os'
import { existsSync } from 'fs'

interface Task<T> {
  id: string
  data: any
  resolve: (result: T) => void
  reject: (error: Error) => void
}

interface WorkerInfo {
  worker: Worker
  busy: boolean
  currentTask: string | null
  processedCount: number
}

export class WorkerPool<T = any> {
  private workers: WorkerInfo[] = []
  private taskQueue: Task<T>[] = []
  private workerPath: string
  private poolSize: number
  private isShutdown: boolean = false
  private taskIdCounter: number = 0
  private initializationFailed: boolean = false
  private initError: Error | null = null

  constructor(workerPath: string, poolSize?: number) {
    this.workerPath = workerPath
    // CPU 코어 수 기반 (최소 2, 최대 8)
    this.poolSize = poolSize ?? Math.min(Math.max(cpus().length - 1, 2), 8)
    this.initWorkers()
  }

  /**
   * 워커 초기화
   */
  private initWorkers(): void {
    // 워커 파일 존재 확인
    if (!existsSync(this.workerPath)) {
      this.initializationFailed = true
      this.initError = new Error(`Worker file not found: ${this.workerPath}`)
      console.warn('[WorkerPool] Worker file not found, falling back to single-threaded mode')
      console.warn(`[WorkerPool] Expected path: ${this.workerPath}`)
      return
    }

    try {
      for (let i = 0; i < this.poolSize; i++) {
        this.createWorker()
      }
      console.log(`[WorkerPool] Initialized with ${this.workers.length} workers`)
    } catch (err) {
      this.initializationFailed = true
      this.initError = err instanceof Error ? err : new Error(String(err))
      console.warn('[WorkerPool] Failed to create workers:', err)
      console.warn('[WorkerPool] Falling back to single-threaded mode')
    }
  }

  /**
   * 워커 생성
   */
  private createWorker(): void {
    try {
      const worker = new Worker(this.workerPath)
      
      const workerInfo: WorkerInfo = {
        worker,
        busy: false,
        currentTask: null,
        processedCount: 0
      }

      worker.on('message', (message) => {
        this.handleWorkerMessage(workerInfo, message)
      })

      worker.on('error', (error) => {
        console.error('[WorkerPool] Worker error:', error)
        this.handleWorkerError(workerInfo, error)
      })

      worker.on('exit', (code) => {
        if (code !== 0 && !this.isShutdown) {
          console.error(`[WorkerPool] Worker exited with code ${code}`)
          this.removeWorker(workerInfo)
          // 재시작 시도 (최대 3번)
          if (this.workers.length < this.poolSize) {
            try {
              this.createWorker()
            } catch (err) {
              console.error('[WorkerPool] Failed to restart worker:', err)
            }
          }
        }
      })

      this.workers.push(workerInfo)
    } catch (err) {
      console.error('[WorkerPool] Failed to create worker:', err)
      throw err
    }
  }

  /**
   * 워커 메시지 처리
   */
  private handleWorkerMessage(workerInfo: WorkerInfo, message: any): void {
    const taskId = workerInfo.currentTask
    if (!taskId) return

    // 큐에서 태스크 찾기
    const taskIndex = this.taskQueue.findIndex(t => t.id === taskId)
    if (taskIndex === -1) return

    const task = this.taskQueue.splice(taskIndex, 1)[0]

    if (message.success) {
      task.resolve(message.result)
    } else {
      task.reject(new Error(message.error || 'Unknown error'))
    }

    workerInfo.busy = false
    workerInfo.currentTask = null
    workerInfo.processedCount++

    // 다음 태스크 처리
    this.processNextTask()
  }

  /**
   * 워커 에러 처리
   */
  private handleWorkerError(workerInfo: WorkerInfo, error: Error): void {
    const taskId = workerInfo.currentTask
    if (taskId) {
      const taskIndex = this.taskQueue.findIndex(t => t.id === taskId)
      if (taskIndex !== -1) {
        const task = this.taskQueue.splice(taskIndex, 1)[0]
        task.reject(error)
      }
    }

    workerInfo.busy = false
    workerInfo.currentTask = null
  }

  /**
   * 워커 제거
   */
  private removeWorker(workerInfo: WorkerInfo): void {
    const index = this.workers.indexOf(workerInfo)
    if (index !== -1) {
      this.workers.splice(index, 1)
    }
  }

  /**
   * 다음 태스크 처리
   */
  private processNextTask(): void {
    if (this.isShutdown) return

    // 대기 중인 태스크와 유휴 워커 찾기
    const pendingTasks = this.taskQueue.filter(t => 
      !this.workers.some(w => w.currentTask === t.id)
    )

    const idleWorker = this.workers.find(w => !w.busy)

    if (pendingTasks.length > 0 && idleWorker) {
      const task = pendingTasks[0]
      idleWorker.busy = true
      idleWorker.currentTask = task.id
      idleWorker.worker.postMessage(task.data)
    }
  }

  /**
   * 워커 풀 사용 가능 여부
   */
  isAvailable(): boolean {
    return !this.initializationFailed && this.workers.length > 0
  }

  /**
   * 초기화 오류 메시지
   */
  getInitError(): string | null {
    return this.initError?.message ?? null
  }

  /**
   * 태스크 실행
   */
  exec(data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.isShutdown) {
        reject(new Error('Worker pool is shutdown'))
        return
      }

      if (this.initializationFailed || this.workers.length === 0) {
        reject(new Error('Worker pool not available. Falling back to main thread processing.'))
        return
      }

      const taskId = `task_${++this.taskIdCounter}`
      
      this.taskQueue.push({
        id: taskId,
        data,
        resolve,
        reject
      })

      this.processNextTask()
    })
  }

  /**
   * 배치 실행
   */
  async execBatch(dataList: any[]): Promise<T[]> {
    if (this.initializationFailed || this.workers.length === 0) {
      throw new Error('Worker pool not available')
    }
    return Promise.all(dataList.map(data => this.exec(data)))
  }

  /**
   * 통계 조회
   */
  getStats(): {
    poolSize: number
    busyWorkers: number
    queueLength: number
    totalProcessed: number
    available: boolean
    error: string | null
  } {
    return {
      poolSize: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queueLength: this.taskQueue.length,
      totalProcessed: this.workers.reduce((sum, w) => sum + w.processedCount, 0),
      available: this.isAvailable(),
      error: this.getInitError()
    }
  }

  /**
   * 종료
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true

    // 대기 중인 태스크 거부
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool shutdown'))
    }
    this.taskQueue = []

    // 워커 종료
    await Promise.all(
      this.workers.map(w => w.worker.terminate())
    )

    this.workers = []
    console.log('[WorkerPool] Shutdown complete')
  }
}

// 파서 워커 풀 (싱글톤)
let parserPool: WorkerPool | null = null

/**
 * 파서 워커 풀 가져오기
 * 워커를 사용할 수 없어도 null을 반환하지 않고 빈 풀을 반환
 */
export function getParserPool(): WorkerPool {
  if (!parserPool) {
    // 컴파일된 워커 경로 (electron-vite 빌드 후)
    const workerPath = join(__dirname, 'ParserWorker.js')
    parserPool = new WorkerPool(workerPath)
    
    if (!parserPool.isAvailable()) {
      console.warn('[WorkerPool] Parser pool not available, will use synchronous processing')
    }
  }
  return parserPool
}

/**
 * 파서 워커 풀 사용 가능 여부
 */
export function isParserPoolAvailable(): boolean {
  return parserPool?.isAvailable() ?? false
}

/**
 * 워커 풀 종료
 */
export async function shutdownParserPool(): Promise<void> {
  if (parserPool) {
    await parserPool.shutdown()
    parserPool = null
  }
}
