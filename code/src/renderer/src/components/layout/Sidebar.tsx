/**
 * 사이드바 컴포넌트
 * 탭 전환: Explorer / Layers / Search / Build 등
 */

import { useState } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useSshStore } from '../../stores/sshStore'
import { FileExplorer } from '../panels/FileExplorer'
import { ServerFileExplorer } from '../panels/ServerFileExplorer'
import { LayersPanel } from '../panels/LayersPanel'
import { GlobalSearchViewer } from '../viewers/GlobalSearchViewer'

type SidebarTab = 'explorer' | 'layers' | 'search' | 'build'

interface TabConfig {
  id: SidebarTab
  icon: string
  label: string
}

const tabs: TabConfig[] = [
  { id: 'explorer', icon: '📁', label: '탐색기' },
  { id: 'layers', icon: '📚', label: '레이어' },
  { id: 'search', icon: '🔍', label: '검색' },
  { id: 'build', icon: '🔨', label: '빌드' },
]

export function Sidebar() {
  const [activeTab, setActiveTab] = useState<SidebarTab>('explorer')
  const { serverProject, currentProject } = useProjectStore()
  const { connectionStatus } = useSshStore()

  // 서버 연결 시 서버 탐색기, 아니면 로컬 탐색기
  const isServerMode = connectionStatus.connected && serverProject

  return (
    <div className="flex h-full">
      {/* 아이콘 탭 바 */}
      <div className="flex flex-col w-12 bg-ide-bg border-r border-ide-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center justify-center w-12 h-12
              text-lg transition-colors relative
              ${activeTab === tab.id
                ? 'text-ide-text border-l-2 border-ide-accent bg-ide-sidebar'
                : 'text-ide-text-muted hover:text-ide-text'
              }
            `}
            title={tab.label}
          >
            {tab.icon}
            {/* 서버 연결 표시 */}
            {tab.id === 'explorer' && isServerMode && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-ide-success rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between h-9 px-4 bg-ide-sidebar border-b border-ide-border">
          <span className="text-xs font-semibold uppercase tracking-wider text-ide-text-muted">
            {tabs.find((t) => t.id === activeTab)?.label}
          </span>
          {isServerMode && activeTab === 'explorer' && (
            <span className="text-xs text-ide-success">🖥️ 서버</span>
          )}
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'explorer' && (
            isServerMode ? <ServerFileExplorer /> : <FileExplorer />
          )}
          {activeTab === 'layers' && <LayersPanel />}
          {activeTab === 'search' && <GlobalSearchViewer />}
          {activeTab === 'build' && <BuildPanel />}
        </div>
      </div>
    </div>
  )
}

// 빌드 패널 (임시)
function BuildPanel() {
  const { connectionStatus } = useSshStore()

  return (
    <div className="p-4 text-sm text-ide-text-muted">
      {connectionStatus.connected ? (
        <div>
          <p className="mb-4">빌드 기능 (준비 중)</p>
          <div className="space-y-2">
            <button className="w-full px-3 py-2 bg-ide-hover border border-ide-border rounded text-left hover:bg-ide-border">
              🔨 bitbake core-image-minimal
            </button>
            <button className="w-full px-3 py-2 bg-ide-hover border border-ide-border rounded text-left hover:bg-ide-border">
              🧹 bitbake -c clean
            </button>
            <button className="w-full px-3 py-2 bg-ide-hover border border-ide-border rounded text-left hover:bg-ide-border">
              📋 bitbake-layers show-layers
            </button>
          </div>
        </div>
      ) : (
        <p>서버에 연결해주세요</p>
      )}
    </div>
  )
}
