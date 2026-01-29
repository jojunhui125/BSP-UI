/**
 * 프로젝트 상태 스토어
 * Zustand 기반 전역 상태 관리
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProjectInfo } from '@shared/types'

interface RecentProject {
  name: string
  path: string
  lastOpened: string
  isServer?: boolean
  serverId?: string
}

interface ServerProject {
  path: string
  name: string
  serverId: string
  serverName: string
}

interface ProjectState {
  // 상태
  currentProject: ProjectInfo | null
  serverProject: ServerProject | null
  recentProjects: RecentProject[]
  loading: boolean
  error: string | null

  // 액션
  openProject: (path: string) => Promise<void>
  setServerProject: (project: ServerProject) => void
  closeProject: () => void
  setError: (error: string | null) => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      // 초기 상태
      currentProject: null,
      serverProject: null,
      recentProjects: [],
      loading: false,
      error: null,

      // 로컬 프로젝트 열기
      openProject: async (path: string) => {
        set({ loading: true, error: null })
        
        try {
          const projectInfo = await window.electronAPI.project.openProject(path)
          
          // 최근 프로젝트에 추가
          const { recentProjects } = get()
          const filteredRecent = recentProjects.filter((p) => p.path !== path)
          const newRecent: RecentProject = {
            name: projectInfo.name,
            path: projectInfo.path,
            lastOpened: new Date().toISOString(),
          }
          
          set({
            currentProject: projectInfo,
            serverProject: null,
            recentProjects: [newRecent, ...filteredRecent].slice(0, 10),
            loading: false,
          })
          
          console.log('[ProjectStore] Project opened:', projectInfo.name)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to open project'
          set({
            error: errorMessage,
            loading: false,
          })
          console.error('[ProjectStore] Error:', errorMessage)
        }
      },

      // 서버 프로젝트 설정
      setServerProject: (project: ServerProject) => {
        // 경로 정규화 (끝 슬래시 제거, 이중 슬래시 정리)
        const normalizedPath = project.path
          .replace(/\/+/g, '/')  // 이중 슬래시 제거
          .replace(/\/$/, '')    // 끝 슬래시 제거
        
        const normalizedProject = {
          ...project,
          path: normalizedPath,
        }
        
        // 최근 프로젝트에 추가
        const { recentProjects } = get()
        const filteredRecent = recentProjects.filter((p) => p.path !== normalizedPath)
        const newRecent: RecentProject = {
          name: normalizedProject.name,
          path: normalizedPath,
          lastOpened: new Date().toISOString(),
          isServer: true,
          serverId: normalizedProject.serverId,
        }

        set({
          serverProject: normalizedProject,
          currentProject: null,
          recentProjects: [newRecent, ...filteredRecent].slice(0, 10),
        })
        
        console.log('[ProjectStore] Server project set:', normalizedPath)
      },

      // 프로젝트 닫기
      closeProject: () => {
        set({ currentProject: null, serverProject: null })
        console.log('[ProjectStore] Project closed')
      },

      // 에러 설정
      setError: (error: string | null) => {
        set({ error })
      },
    }),
    {
      name: 'bsp-studio-project',
      partialize: (state) => ({
        recentProjects: state.recentProjects,
      }),
    }
  )
)
