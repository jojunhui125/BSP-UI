/**
 * SSH 연결 상태 스토어
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ServerProfile, ConnectionStatus } from '@shared/types'

interface SshState {
  // 상태
  profiles: ServerProfile[]
  activeProfile: ServerProfile | null
  connectionStatus: ConnectionStatus
  isConnecting: boolean
  consoleOutput: string[]

  // 액션
  addProfile: (profile: ServerProfile) => void
  updateProfile: (profile: ServerProfile) => void
  removeProfile: (id: string) => void
  connect: (profile: ServerProfile) => Promise<boolean>
  disconnect: () => Promise<void>
  testConnection: (profile: ServerProfile) => Promise<{ success: boolean; info?: string; error?: string }>
  execCommand: (command: string) => Promise<{ stdout: string; stderr: string; code: number }>
  appendConsole: (text: string) => void
  clearConsole: () => void
}

// 기본 서버 프로필 (빠른 연결용)
const DEFAULT_SERVER_PROFILE: ServerProfile = {
  id: 'default-yocto-server',
  name: 'Yocto Server',
  host: '192.168.21.217',
  port: 22,
  username: 'master',
  authType: 'password',
  password: 'master1!',
  workspacePath: '/home/master',
}

export const useSshStore = create<SshState>()(
  persist(
    (set, get) => ({
      // 초기 상태 - 기본 서버 프로필 포함
      profiles: [DEFAULT_SERVER_PROFILE],
      activeProfile: null,
      connectionStatus: { connected: false },
      isConnecting: false,
      consoleOutput: [],

      // 프로필 추가
      addProfile: (profile: ServerProfile) => {
        set((state) => ({
          profiles: [...state.profiles, profile],
        }))
      },

      // 프로필 수정
      updateProfile: (profile: ServerProfile) => {
        set((state) => ({
          profiles: state.profiles.map((p) => (p.id === profile.id ? profile : p)),
        }))
      },

      // 프로필 삭제
      removeProfile: (id: string) => {
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
        }))
      },

      // SSH 연결
      connect: async (profile: ServerProfile) => {
        set({ isConnecting: true })
        
        try {
          const result = await window.electronAPI.ssh.connect(profile)
          
          set({
            connectionStatus: result,
            activeProfile: result.connected ? profile : null,
            isConnecting: false,
          })

          if (result.connected) {
            get().appendConsole(`[연결됨] ${profile.host}:${profile.port}`)
          } else {
            get().appendConsole(`[연결 실패] ${result.error}`)
          }

          return result.connected
        } catch (error: any) {
          set({
            connectionStatus: { connected: false, error: error.message },
            isConnecting: false,
          })
          get().appendConsole(`[오류] ${error.message}`)
          return false
        }
      },

      // SSH 연결 해제
      disconnect: async () => {
        const { activeProfile } = get()
        if (!activeProfile) return

        try {
          await window.electronAPI.ssh.disconnect(activeProfile.id)
          set({
            connectionStatus: { connected: false },
            activeProfile: null,
          })
          get().appendConsole(`[연결 해제] ${activeProfile.host}`)
        } catch (error: any) {
          get().appendConsole(`[오류] ${error.message}`)
        }
      },

      // 연결 테스트
      testConnection: async (profile: ServerProfile) => {
        set({ isConnecting: true })
        get().appendConsole(`[테스트] ${profile.host}:${profile.port} 연결 중...`)

        try {
          const result = await window.electronAPI.ssh.testConnection(profile)
          
          if (result.success) {
            get().appendConsole(`[성공] 서버 정보: ${result.info}`)
          } else {
            get().appendConsole(`[실패] ${result.error}`)
          }

          set({ isConnecting: false })
          return result
        } catch (error: any) {
          get().appendConsole(`[오류] ${error.message}`)
          set({ isConnecting: false })
          return { success: false, error: error.message }
        }
      },

      // 원격 명령 실행
      execCommand: async (command: string) => {
        const { activeProfile, connectionStatus } = get()
        
        if (!activeProfile || !connectionStatus.connected) {
          throw new Error('서버에 연결되어 있지 않습니다')
        }

        get().appendConsole(`$ ${command}`)

        try {
          const result = await window.electronAPI.ssh.exec(activeProfile.id, command)
          
          if (result.stdout) {
            get().appendConsole(result.stdout)
          }
          if (result.stderr) {
            get().appendConsole(`[stderr] ${result.stderr}`)
          }
          
          return result
        } catch (error: any) {
          get().appendConsole(`[오류] ${error.message}`)
          throw error
        }
      },

      // 콘솔 출력 추가
      appendConsole: (text: string) => {
        set((state) => ({
          consoleOutput: [...state.consoleOutput.slice(-500), text], // 최대 500줄 유지
        }))
      },

      // 콘솔 지우기
      clearConsole: () => {
        set({ consoleOutput: [] })
      },
    }),
    {
      name: 'bsp-studio-ssh',
      partialize: (state) => ({
        profiles: state.profiles,
      }),
    }
  )
)
