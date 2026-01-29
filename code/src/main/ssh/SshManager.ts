/**
 * SSH 연결 관리자
 * ssh2 라이브러리를 사용한 SSH 연결 관리
 * 
 * 강화된 기능:
 * - 동시 요청 제한 (세마포어)
 * - 자동 재연결
 * - 채널 오류 복구
 * - 연결 상태 추적
 * - 타임아웃 처리
 */

import { Client, SFTPWrapper } from 'ssh2'
import { readFile } from 'fs/promises'
import { EventEmitter } from 'events'
import type { ServerProfile, ConnectionStatus } from '../../shared/types'

interface SshConnection {
  client: Client
  sftp?: SFTPWrapper
  profile: ServerProfile
  lastActivity: number
  reconnecting: boolean
  isReady: boolean
}

// 설정 상수
const CONFIG = {
  CONNECT_TIMEOUT: 15000,      // 연결 타임아웃 (ms)
  EXEC_TIMEOUT: 60000,         // 명령 실행 타임아웃 (ms)
  KEEPALIVE_INTERVAL: 10000,   // Keepalive 간격 (ms)
  MAX_RETRY_COUNT: 3,          // 최대 재시도 횟수
  RETRY_DELAY: 1000,           // 재시도 대기 시간 (ms)
  MAX_CONCURRENT_REQUESTS: 8,  // 동시 SSH 요청 최대 수 (안정성: 15→8)
  REQUEST_QUEUE_DELAY: 30,     // 요청 간 최소 딜레이 (ms) (안정성: 10→30)
}

/**
 * 세마포어 - 동시 요청 제한
 */
class Semaphore {
  private permits: number
  private waiting: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return
    }
    
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve)
    })
  }

  release(): void {
    this.permits++
    if (this.waiting.length > 0 && this.permits > 0) {
      this.permits--
      const next = this.waiting.shift()
      next?.()
    }
  }

  get available(): number {
    return this.permits
  }

  get queueLength(): number {
    return this.waiting.length
  }
}

export class SshManager extends EventEmitter {
  private connections: Map<string, SshConnection> = new Map()
  private activeConnectionId: string | null = null
  private semaphore = new Semaphore(CONFIG.MAX_CONCURRENT_REQUESTS)
  private lastRequestTime = 0

  /**
   * 요청 쓰로틀링 (너무 빠른 요청 방지)
   */
  private async throttle(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    if (elapsed < CONFIG.REQUEST_QUEUE_DELAY) {
      await new Promise(r => setTimeout(r, CONFIG.REQUEST_QUEUE_DELAY - elapsed))
    }
    this.lastRequestTime = Date.now()
  }

  /**
   * SSH 서버에 연결
   */
  async connect(profile: ServerProfile): Promise<ConnectionStatus> {
    // 이미 연결된 경우 상태 확인
    const existing = this.connections.get(profile.id)
    if (existing && existing.isReady) {
      // 연결이 살아있는지 간단한 테스트
      try {
        await this.ping(profile.id)
        return { connected: true, serverId: profile.id }
      } catch {
        // 연결이 죽어있으면 재연결
        console.log(`[SSH] Existing connection dead, reconnecting...`)
        this.forceDisconnect(profile.id)
      }
    }

    const client = new Client()

    return new Promise(async (resolve) => {
      let resolved = false
      
      // 타임아웃 설정
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          client.end()
          resolve({ connected: false, error: 'Connection timeout' })
        }
      }, CONFIG.CONNECT_TIMEOUT)

      // 연결 성공
      client.on('ready', () => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        
        console.log(`[SSH] Connected to ${profile.host}`)
        
        const conn: SshConnection = {
          client,
          profile,
          lastActivity: Date.now(),
          reconnecting: false,
          isReady: true
        }
        
        this.connections.set(profile.id, conn)
        this.activeConnectionId = profile.id
        
        this.emit('connected', profile.id)
        resolve({ connected: true, serverId: profile.id })
      })

      // 연결 에러
      client.on('error', (err) => {
        console.error(`[SSH] Connection error:`, err.message)
        
        const conn = this.connections.get(profile.id)
        if (conn) {
          conn.isReady = false
        }
        
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          this.emit('error', profile.id, err.message)
          resolve({ connected: false, error: err.message })
        }
      })

      // 연결 종료
      client.on('close', () => {
        console.log(`[SSH] Connection closed: ${profile.id}`)
        
        const conn = this.connections.get(profile.id)
        if (conn) {
          conn.isReady = false
          conn.sftp = undefined
        }
        
        this.connections.delete(profile.id)
        if (this.activeConnectionId === profile.id) {
          this.activeConnectionId = null
        }
        this.emit('disconnected', profile.id)
      })

      // 연결 끊김 (네트워크 문제)
      client.on('end', () => {
        console.log(`[SSH] Connection ended: ${profile.id}`)
        const conn = this.connections.get(profile.id)
        if (conn) {
          conn.isReady = false
        }
      })

      // 연결 옵션 구성
      try {
        const connectConfig: any = {
          host: profile.host,
          port: profile.port,
          username: profile.username,
          readyTimeout: CONFIG.CONNECT_TIMEOUT,
          keepaliveInterval: CONFIG.KEEPALIVE_INTERVAL,
          keepaliveCountMax: 3,
        }

        // 인증 방식에 따라 설정
        if (profile.authType === 'password' && profile.password) {
          connectConfig.password = profile.password
          console.log(`[SSH] Using password authentication for ${profile.username}@${profile.host}`)
        } else if (profile.authType === 'key' && profile.privateKeyPath) {
          connectConfig.privateKey = await readFile(profile.privateKeyPath)
          if (profile.passphrase) {
            connectConfig.passphrase = profile.passphrase
          }
          console.log(`[SSH] Using key authentication: ${profile.privateKeyPath}`)
        } else {
          if (profile.privateKeyPath) {
            connectConfig.privateKey = await readFile(profile.privateKeyPath)
            if (profile.passphrase) {
              connectConfig.passphrase = profile.passphrase
            }
          }
        }

        client.connect(connectConfig)
      } catch (err: any) {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          console.error(`[SSH] Connection setup error:`, err)
          resolve({ connected: false, error: err.message })
        }
      }
    })
  }

  /**
   * 연결 상태 테스트 (ping)
   */
  private async ping(serverId: string): Promise<boolean> {
    const conn = this.connections.get(serverId)
    if (!conn || !conn.isReady) {
      throw new Error('Not connected')
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Ping timeout'))
      }, 5000)

      conn.client.exec('echo ok', (err, stream) => {
        if (err) {
          clearTimeout(timeout)
          reject(err)
          return
        }

        stream.on('close', () => {
          clearTimeout(timeout)
          resolve(true)
        })

        stream.on('data', () => {})
      })
    })
  }

  /**
   * 자동 재연결
   */
  private async reconnect(serverId: string): Promise<boolean> {
    const conn = this.connections.get(serverId)
    if (!conn || conn.reconnecting) {
      return false
    }

    conn.reconnecting = true
    console.log(`[SSH] Attempting to reconnect: ${serverId}`)

    try {
      // 기존 연결 정리
      try {
        conn.client.end()
      } catch {}
      
      this.connections.delete(serverId)

      // 재연결
      const result = await this.connect(conn.profile)
      conn.reconnecting = false
      return result.connected
    } catch (err) {
      console.error(`[SSH] Reconnection failed:`, err)
      conn.reconnecting = false
      return false
    }
  }

  /**
   * SSH 연결 해제
   */
  disconnect(serverId: string): void {
    const conn = this.connections.get(serverId)
    if (conn) {
      conn.isReady = false
      try {
        conn.client.end()
      } catch {}
      this.connections.delete(serverId)
      if (this.activeConnectionId === serverId) {
        this.activeConnectionId = null
      }
    }
  }

  /**
   * 강제 연결 해제 (정리용)
   */
  private forceDisconnect(serverId: string): void {
    const conn = this.connections.get(serverId)
    if (conn) {
      conn.isReady = false
      conn.sftp = undefined
      try {
        conn.client.destroy()
      } catch {}
      this.connections.delete(serverId)
      if (this.activeConnectionId === serverId) {
        this.activeConnectionId = null
      }
    }
  }

  /**
   * 모든 연결 해제
   */
  disconnectAll(): void {
    for (const [id] of this.connections) {
      this.disconnect(id)
    }
  }

  /**
   * 연결 상태 확인
   */
  isConnected(serverId: string): boolean {
    const conn = this.connections.get(serverId)
    return conn?.isReady ?? false
  }

  /**
   * 활성 연결 ID 가져오기
   */
  getActiveConnectionId(): string | null {
    return this.activeConnectionId
  }

  /**
   * 연결 가져오기 (재연결 시도 포함)
   */
  private async getConnection(serverId: string, retryCount: number = 0): Promise<SshConnection> {
    const conn = this.connections.get(serverId)
    
    if (!conn) {
      throw new Error('Not connected to server')
    }

    if (!conn.isReady) {
      if (retryCount < CONFIG.MAX_RETRY_COUNT) {
        console.log(`[SSH] Connection not ready, attempting reconnect (${retryCount + 1}/${CONFIG.MAX_RETRY_COUNT})`)
        const reconnected = await this.reconnect(serverId)
        if (reconnected) {
          return this.getConnection(serverId, retryCount + 1)
        }
      }
      throw new Error('Connection lost and reconnection failed')
    }

    return conn
  }

  /**
   * 원격 명령 실행 (세마포어 + 재시도 로직)
   */
  async exec(
    serverId: string, 
    command: string, 
    options?: { timeout?: number; retryCount?: number }
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const timeout = options?.timeout ?? CONFIG.EXEC_TIMEOUT
    const retryCount = options?.retryCount ?? 0
    
    // 세마포어 획득 (동시 요청 제한)
    await this.semaphore.acquire()
    
    try {
      // 쓰로틀링
      await this.throttle()
      
      const conn = await this.getConnection(serverId)
      conn.lastActivity = Date.now()

      return await new Promise((resolve, reject) => {
        // 타임아웃 설정
        const timeoutHandle = setTimeout(() => {
          reject(new Error('Command execution timeout'))
        }, timeout)

        conn.client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeoutHandle)
            reject(err)
            return
          }

          let stdout = ''
          let stderr = ''

          stream.on('data', (data: Buffer) => {
            stdout += data.toString()
          })

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString()
          })

          stream.on('close', (code: number) => {
            clearTimeout(timeoutHandle)
            resolve({ stdout, stderr, code })
          })

          stream.on('error', (streamErr: Error) => {
            clearTimeout(timeoutHandle)
            reject(streamErr)
          })
        })
      })
    } catch (err: any) {
      // 채널 오류 시 재시도
      if (retryCount < CONFIG.MAX_RETRY_COUNT && 
          (err.message.includes('Channel') || err.message.includes('Not connected') || err.message.includes('Connection'))) {
        console.log(`[SSH] Exec failed (${err.message}), retrying (${retryCount + 1}/${CONFIG.MAX_RETRY_COUNT})`)
        
        // 대기 후 재시도
        await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY * (retryCount + 1)))
        
        const conn = this.connections.get(serverId)
        if (conn) {
          conn.isReady = false
          await this.reconnect(serverId)
        }
        
        // 세마포어 해제 후 재귀 호출 (재귀에서 다시 획득)
        this.semaphore.release()
        return this.exec(serverId, command, { timeout, retryCount: retryCount + 1 })
      }
      throw err
    } finally {
      // 세마포어 해제
      this.semaphore.release()
    }
  }

  /**
   * 원격 명령 실행 (스트리밍)
   */
  async execStream(
    serverId: string,
    command: string,
    onData: (data: string) => void,
    onError: (data: string) => void
  ): Promise<number> {
    await this.semaphore.acquire()
    
    try {
      await this.throttle()
      const conn = await this.getConnection(serverId)
      conn.lastActivity = Date.now()

      return await new Promise((resolve, reject) => {
        conn.client.exec(command, (err, stream) => {
          if (err) {
            reject(err)
            return
          }

          stream.on('data', (data: Buffer) => {
            onData(data.toString())
          })

          stream.stderr.on('data', (data: Buffer) => {
            onError(data.toString())
          })

          stream.on('close', (code: number) => {
            resolve(code)
          })

          stream.on('error', (streamErr: Error) => {
            reject(streamErr)
          })
        })
      })
    } finally {
      this.semaphore.release()
    }
  }

  /**
   * SFTP 세션 가져오기 (재연결 지원)
   */
  async getSftp(serverId: string, forceNew: boolean = false, retryCount: number = 0): Promise<SFTPWrapper> {
    const conn = await this.getConnection(serverId)

    if (conn.sftp && !forceNew) {
      return conn.sftp
    }

    await this.semaphore.acquire()
    
    try {
      await this.throttle()
      
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('SFTP session timeout'))
        }, 15000)

        conn.client.sftp((err, sftp) => {
          clearTimeout(timeout)
          if (err) {
            // SFTP 실패 시 연결 상태 체크
            if (err.message.includes('Channel') || err.message.includes('subsystem')) {
              conn.isReady = false
              conn.sftp = undefined
            }
            reject(err)
            return
          }
          conn.sftp = sftp
          resolve(sftp)
        })
      })
    } catch (err: any) {
      // SFTP 세션 실패 시 재연결 시도 (최대 2회)
      if (retryCount < 2 && (err.message.includes('subsystem') || err.message.includes('Channel'))) {
        console.log(`[SSH] SFTP failed, reconnecting... (attempt ${retryCount + 1})`)
        this.semaphore.release()
        
        // 기존 연결 정리 및 재연결
        conn.sftp = undefined
        conn.isReady = false
        
        await new Promise(r => setTimeout(r, 500 * (retryCount + 1)))
        await this.reconnect(serverId)
        
        return this.getSftp(serverId, true, retryCount + 1)
      }
      throw err
    } finally {
      this.semaphore.release()
    }
  }

  /**
   * 원격 디렉토리 목록 가져오기
   */
  async readDir(serverId: string, remotePath: string): Promise<string[]> {
    try {
      const sftp = await this.getSftp(serverId)

      return new Promise((resolve, reject) => {
        sftp.readdir(remotePath, (err, list) => {
          if (err) {
            reject(err)
            return
          }
          resolve(list.map((item) => item.filename))
        })
      })
    } catch (err: any) {
      // SFTP 세션 오류 시 새 세션으로 재시도
      if (err.message.includes('Channel') || err.message.includes('SFTP')) {
        console.log('[SSH] SFTP session error, retrying with new session')
        const sftp = await this.getSftp(serverId, true)
        return new Promise((resolve, reject) => {
          sftp.readdir(remotePath, (err, list) => {
            if (err) {
              reject(err)
              return
            }
            resolve(list.map((item) => item.filename))
          })
        })
      }
      throw err
    }
  }

  /**
   * 원격 파일 읽기
   */
  async readFile(serverId: string, remotePath: string): Promise<string> {
    try {
      const sftp = await this.getSftp(serverId)

      return new Promise((resolve, reject) => {
        let content = ''
        const stream = sftp.createReadStream(remotePath, { encoding: 'utf8' })

        stream.on('data', (chunk: string) => {
          content += chunk
        })

        stream.on('end', () => {
          resolve(content)
        })

        stream.on('error', (err: Error) => {
          reject(err)
        })
      })
    } catch (err: any) {
      // SFTP 세션 오류 시 재시도
      if (err.message.includes('Channel') || err.message.includes('SFTP')) {
        console.log('[SSH] SFTP read error, retrying with new session')
        const sftp = await this.getSftp(serverId, true)
        return new Promise((resolve, reject) => {
          let content = ''
          const stream = sftp.createReadStream(remotePath, { encoding: 'utf8' })
          stream.on('data', (chunk: string) => { content += chunk })
          stream.on('end', () => { resolve(content) })
          stream.on('error', (err: Error) => { reject(err) })
        })
      }
      throw err
    }
  }

  /**
   * 원격 파일 쓰기 (string 또는 Buffer)
   */
  async writeFile(serverId: string, remotePath: string, content: string | Buffer): Promise<void> {
    const sftp = await this.getSftp(serverId)

    return new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(remotePath)

      stream.on('close', () => {
        resolve()
      })

      stream.on('error', (err: Error) => {
        reject(err)
      })

      stream.end(content)
    })
  }

  /**
   * 원격 파일 읽기 (Buffer로 반환 - 바이너리 파일용)
   */
  async readFileBuffer(serverId: string, remotePath: string): Promise<Buffer> {
    const sftp = await this.getSftp(serverId)

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = sftp.createReadStream(remotePath)

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      stream.on('end', () => {
        resolve(Buffer.concat(chunks))
      })

      stream.on('error', (err: Error) => {
        reject(err)
      })
    })
  }

  /**
   * 원격 경로 존재 여부 확인
   */
  async pathExists(serverId: string, remotePath: string): Promise<boolean> {
    try {
      const sftp = await this.getSftp(serverId)
      
      return new Promise((resolve) => {
        sftp.stat(remotePath, (err) => {
          if (err) {
            resolve(false)
          } else {
            resolve(true)
          }
        })
      })
    } catch {
      return false
    }
  }

  /**
   * 연결 테스트 (서버 정보 확인)
   */
  async testConnection(profile: ServerProfile): Promise<{ success: boolean; info?: string; error?: string }> {
    const result = await this.connect(profile)
    
    if (!result.connected) {
      return { success: false, error: result.error }
    }

    try {
      const { stdout } = await this.exec(profile.id, 'uname -a && df -h / | tail -1')
      this.disconnect(profile.id)
      return { success: true, info: stdout.trim() }
    } catch (err: any) {
      this.disconnect(profile.id)
      return { success: false, error: err.message }
    }
  }

  /**
   * 연결 상태 정보
   */
  getConnectionInfo(serverId: string): { connected: boolean; lastActivity: number; reconnecting: boolean; queueLength: number } | null {
    const conn = this.connections.get(serverId)
    if (!conn) return null
    
    return {
      connected: conn.isReady,
      lastActivity: conn.lastActivity,
      reconnecting: conn.reconnecting,
      queueLength: this.semaphore.queueLength
    }
  }

  /**
   * 현재 동시성 상태
   */
  getConcurrencyStatus(): { available: number; queueLength: number; maxConcurrent: number } {
    return {
      available: this.semaphore.available,
      queueLength: this.semaphore.queueLength,
      maxConcurrent: CONFIG.MAX_CONCURRENT_REQUESTS
    }
  }
}

// 싱글톤 인스턴스
export const sshManager = new SshManager()
