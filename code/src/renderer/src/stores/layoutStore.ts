/**
 * 레이아웃 상태 스토어
 * 패널 크기 및 가시성 관리
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LayoutState {
  // 패널 크기
  sidebarWidth: number
  bottomPanelHeight: number
  rightPanelWidth: number

  // 패널 가시성
  sidebarVisible: boolean
  bottomPanelVisible: boolean
  rightPanelVisible: boolean

  // 액션
  setSidebarWidth: (width: number) => void
  setBottomPanelHeight: (height: number) => void
  setRightPanelWidth: (width: number) => void
  toggleSidebar: () => void
  toggleBottomPanel: () => void
  toggleRightPanel: () => void
  resetLayout: () => void
}

const DEFAULT_LAYOUT = {
  sidebarWidth: 280,
  bottomPanelHeight: 200,
  rightPanelWidth: 300,
  sidebarVisible: true,
  bottomPanelVisible: true,
  rightPanelVisible: false,
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      ...DEFAULT_LAYOUT,

      setSidebarWidth: (width: number) => {
        set({ sidebarWidth: Math.max(200, Math.min(500, width)) })
      },

      setBottomPanelHeight: (height: number) => {
        set({ bottomPanelHeight: Math.max(100, Math.min(400, height)) })
      },

      setRightPanelWidth: (width: number) => {
        set({ rightPanelWidth: Math.max(200, Math.min(500, width)) })
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarVisible: !state.sidebarVisible }))
      },

      toggleBottomPanel: () => {
        set((state) => ({ bottomPanelVisible: !state.bottomPanelVisible }))
      },

      toggleRightPanel: () => {
        set((state) => ({ rightPanelVisible: !state.rightPanelVisible }))
      },

      resetLayout: () => {
        set(DEFAULT_LAYOUT)
      },
    }),
    {
      name: 'bsp-studio-layout',
    }
  )
)
