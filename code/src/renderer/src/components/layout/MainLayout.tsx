/**
 * 메인 레이아웃 컴포넌트
 * 3패널 구조: 사이드바 | 에디터 | 인스펙터
 *            하단 패널 (콘솔/로그)
 * 
 * 기능:
 * - 드래그로 패널 크기 조절
 * - 패널 토글 (Ctrl+B: 사이드바, Ctrl+J: 하단 패널)
 */

import { useCallback, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { EditorArea } from './EditorArea'
import { BottomPanel } from './BottomPanel'
import { StatusBar } from './StatusBar'
import { ResizeHandle } from './ResizeHandle'
import { useLayoutStore } from '../../stores/layoutStore'

export function MainLayout() {
  const { 
    sidebarWidth, 
    bottomPanelHeight, 
    sidebarVisible, 
    bottomPanelVisible,
    setSidebarWidth,
    setBottomPanelHeight,
    toggleSidebar,
    toggleBottomPanel
  } = useLayoutStore()

  // 사이드바 리사이즈
  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth(sidebarWidth + delta)
  }, [sidebarWidth, setSidebarWidth])

  // 하단 패널 리사이즈
  const handleBottomPanelResize = useCallback((delta: number) => {
    // delta가 양수면 위로 드래그 (패널 커짐), 음수면 아래로 (패널 작아짐)
    setBottomPanelHeight(bottomPanelHeight - delta)
  }, [bottomPanelHeight, setBottomPanelHeight])

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+B: 사이드바 토글
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
      // Ctrl+J: 하단 패널 토글
      if (e.ctrlKey && e.key === 'j') {
        e.preventDefault()
        toggleBottomPanel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar, toggleBottomPanel])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* 메인 영역 (사이드바 + 에디터 + 인스펙터) */}
      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 */}
        {sidebarVisible && (
          <>
            <aside
              className="flex flex-col bg-ide-sidebar border-r border-ide-border overflow-hidden"
              style={{ width: sidebarWidth }}
            >
              <Sidebar />
            </aside>
            
            {/* 사이드바 리사이즈 핸들 */}
            <ResizeHandle 
              direction="horizontal" 
              onResize={handleSidebarResize}
            />
          </>
        )}

        {/* 에디터 영역 */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <EditorArea />
        </main>
      </div>

      {/* 하단 패널 (콘솔/로그) */}
      {bottomPanelVisible && (
        <>
          {/* 하단 패널 리사이즈 핸들 */}
          <ResizeHandle 
            direction="vertical" 
            onResize={handleBottomPanelResize}
          />
          
          <div
            className="flex flex-col bg-ide-panel border-t border-ide-border"
            style={{ height: bottomPanelHeight }}
          >
            <BottomPanel />
          </div>
        </>
      )}

      {/* 상태바 */}
      <StatusBar />
    </div>
  )
}
