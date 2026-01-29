/**
 * 커스텀 타이틀바 컴포넌트
 * Windows 스타일 드래그/버튼 지원
 */

import { useState, useEffect } from 'react'
import { useProjectStore } from '../../stores/projectStore'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const { currentProject } = useProjectStore()
  
  // 최대화 상태 체크
  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await window.electronAPI.window.isMaximized()
      setIsMaximized(maximized)
    }
    checkMaximized()
  }, [])

  const handleMinimize = () => {
    window.electronAPI.window.minimize()
  }

  const handleMaximize = () => {
    window.electronAPI.window.maximize()
    setIsMaximized(!isMaximized)
  }

  const handleClose = () => {
    window.electronAPI.window.close()
  }

  const title = currentProject
    ? `${currentProject.name} - Yocto BSP Studio`
    : 'Yocto BSP Studio'

  return (
    <header className="flex items-center h-8 bg-ide-sidebar border-b border-ide-border no-select">
      {/* 드래그 영역 (왼쪽) */}
      <div
        className="flex items-center flex-1 h-full px-3 drag-region"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* 아이콘 */}
        <div className="flex items-center gap-2 mr-4">
          <svg
            className="w-4 h-4 text-ide-accent"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="text-xs font-medium text-ide-text-muted">
            {title}
          </span>
        </div>
      </div>

      {/* 윈도우 컨트롤 버튼 */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* 최소화 */}
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-12 h-full hover:bg-ide-hover transition-colors"
          title="최소화"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12">
            <rect y="5" width="12" height="1" />
          </svg>
        </button>

        {/* 최대화/복원 */}
        <button
          onClick={handleMaximize}
          className="flex items-center justify-center w-12 h-full hover:bg-ide-hover transition-colors"
          title={isMaximized ? '복원' : '최대화'}
        >
          {isMaximized ? (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12">
              <path d="M3 1v2H1v8h8V9h2V1H3zm6 7H2V4h7v4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12">
              <rect
                x="0.5"
                y="0.5"
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
              />
            </svg>
          )}
        </button>

        {/* 닫기 */}
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-12 h-full hover:bg-ide-error transition-colors"
          title="닫기"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12">
            <path d="M1 1l10 10M1 11L11 1" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </div>
    </header>
  )
}
