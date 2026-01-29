/**
 * 웰컴 뷰 컴포넌트
 * 프로젝트 미선택 시 표시
 */

import { useState } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useSshStore } from '../../stores/sshStore'
import { SshSettingsModal } from '../modals/SshSettingsModal'
import { ServerBrowserModal } from '../modals/ServerBrowserModal'

export function WelcomeView() {
  const { openProject, setServerProject, recentProjects } = useProjectStore()
  const { connectionStatus, activeProfile, profiles, connect, isConnecting, disconnect } = useSshStore()
  const [showSshModal, setShowSshModal] = useState(false)
  const [showServerBrowser, setShowServerBrowser] = useState(false)
  
  // 기본 서버 프로필 찾기
  const defaultProfile = profiles.find(p => p.id === 'default-yocto-server') || profiles[0]

  // 빠른 연결 (기본 서버)
  const handleQuickConnect = async () => {
    if (!defaultProfile) {
      setShowSshModal(true)
      return
    }
    
    const success = await connect(defaultProfile)
    if (success) {
      // 연결 성공 시 바로 서버 브라우저 열기
      setShowServerBrowser(true)
    }
  }

  const handleOpenFolder = async () => {
    const folderPath = await window.electronAPI.project.selectFolder()
    if (folderPath) {
      await openProject(folderPath)
    }
  }

  const handleServerProjectSelect = (path: string) => {
    // 서버 프로젝트 설정
    if (activeProfile) {
      // 경로 정규화 (이중 슬래시 방지)
      const normalizedPath = path.replace(/\/+/g, '/').replace(/\/$/, '')
      setServerProject({
        path: normalizedPath,
        name: normalizedPath.split('/').pop() || 'project',
        serverId: activeProfile.id,
        serverName: activeProfile.name,
      })
    }
  }

  return (
    <div className="flex items-center justify-center h-full bg-gradient-to-br from-ide-bg to-ide-sidebar">
      <div className="max-w-xl w-full mx-4">
        {/* 로고 & 타이틀 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-ide-accent to-purple-600 shadow-lg shadow-ide-accent/30 mb-4">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ide-text">Yocto BSP Studio</h1>
          <p className="text-ide-text-muted text-sm mt-1">Yocto 기반 BSP 개발 통합 환경</p>
        </div>

        {/* 메인 액션 카드 */}
        <div className="bg-ide-sidebar rounded-xl border border-ide-border p-6 shadow-lg">
          {/* 연결 상태 표시 */}
          {connectionStatus.connected && activeProfile ? (
            <div className="mb-4 p-3 bg-ide-success/10 border border-ide-success/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-ide-success rounded-full animate-pulse" />
                  <span className="text-sm text-ide-success font-medium">
                    {activeProfile.name} 연결됨
                  </span>
                  <span className="text-xs text-ide-text-muted">({activeProfile.host})</span>
                </div>
                <button
                  onClick={() => disconnect()}
                  className="text-xs text-ide-text-muted hover:text-ide-error transition-colors"
                >
                  연결 해제
                </button>
              </div>
            </div>
          ) : (
            /* 빠른 연결 버튼 - 연결 안 된 경우 */
            defaultProfile && (
              <button
                onClick={handleQuickConnect}
                disabled={isConnecting}
                className="w-full mb-4 p-4 bg-gradient-to-r from-ide-accent to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-ide-accent/20"
              >
                {isConnecting ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>연결 중...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-2xl">🚀</span>
                    <div className="text-left">
                      <div className="font-bold">{defaultProfile.name}에 연결</div>
                      <div className="text-xs opacity-80">{defaultProfile.host} • {defaultProfile.username}</div>
                    </div>
                  </div>
                )}
              </button>
            )
          )}

          {/* 서버 연결됨 - 프로젝트 열기 */}
          {connectionStatus.connected ? (
            <div className="space-y-3">
              <button
                onClick={() => setShowServerBrowser(true)}
                className="w-full p-4 bg-ide-accent text-white rounded-lg font-medium hover:bg-ide-accent/80 transition-colors flex items-center justify-center gap-2"
              >
                <span className="text-xl">📂</span>
                <span>서버 프로젝트 열기</span>
              </button>
              
              <button
                onClick={() => setShowSshModal(true)}
                className="w-full p-3 bg-ide-hover border border-ide-border text-ide-text rounded-lg font-medium hover:bg-ide-border transition-colors text-sm"
              >
                ⚙️ 서버 연결 설정
              </button>
            </div>
          ) : (
            /* 연결 안 됨 - 다른 옵션들 */
            <div className="space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-ide-border"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-ide-sidebar text-ide-text-muted">또는</span>
                </div>
              </div>

              <button
                onClick={handleOpenFolder}
                className="w-full p-3 bg-ide-hover border border-ide-border text-ide-text rounded-lg font-medium hover:bg-ide-border transition-colors flex items-center justify-center gap-2"
              >
                <span>📁</span>
                <span>로컬 프로젝트 열기</span>
              </button>

              <button
                onClick={() => setShowSshModal(true)}
                className="w-full p-3 bg-ide-hover border border-ide-border text-ide-text rounded-lg font-medium hover:bg-ide-border transition-colors flex items-center justify-center gap-2"
              >
                <span>🌐</span>
                <span>서버 연결 설정</span>
              </button>
            </div>
          )}
        </div>

        {/* 저장된 서버 목록 (기본 서버 제외) */}
        {profiles.length > 1 && !connectionStatus.connected && (
          <div className="mt-4">
            <h3 className="text-xs text-ide-text-muted mb-2 px-1">다른 저장된 서버</h3>
            <div className="space-y-2">
              {profiles.filter(p => p.id !== 'default-yocto-server').map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => connect(profile)}
                  disabled={isConnecting}
                  className="w-full p-3 bg-ide-sidebar border border-ide-border rounded-lg text-left hover:bg-ide-hover transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ide-text">{profile.name}</span>
                    <span className="text-xs text-ide-text-muted">{profile.host}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 최근 프로젝트 */}
        {recentProjects.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs text-ide-text-muted mb-2 px-1">최근 프로젝트</h3>
            <div className="space-y-2">
              {recentProjects.slice(0, 3).map((project) => (
                <button
                  key={project.path}
                  onClick={() => openProject(project.path)}
                  className="w-full p-3 bg-ide-sidebar border border-ide-border rounded-lg text-left hover:bg-ide-hover transition-colors"
                >
                  <p className="text-sm font-mono text-ide-text truncate">{project.name}</p>
                  <p className="text-xs text-ide-text-muted truncate">{project.path}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SSH 설정 모달 */}
      <SshSettingsModal isOpen={showSshModal} onClose={() => setShowSshModal(false)} />

      {/* 서버 브라우저 모달 */}
      <ServerBrowserModal
        isOpen={showServerBrowser}
        onClose={() => setShowServerBrowser(false)}
        onSelect={handleServerProjectSelect}
        initialPath={activeProfile?.workspacePath}
      />
    </div>
  )
}
