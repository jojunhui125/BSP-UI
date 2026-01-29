/**
 * 상태바 컴포넌트
 * 연결 상태, MACHINE, 빌드 상태 등 표시
 */

import { useState } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useSshStore } from '../../stores/sshStore'
import { SshSettingsModal } from '../modals/SshSettingsModal'

export function StatusBar() {
  const { currentProject } = useProjectStore()
  const { connectionStatus, activeProfile, disconnect } = useSshStore()
  const [showSshModal, setShowSshModal] = useState(false)

  const handleDisconnect = async () => {
    if (confirm('서버 연결을 해제하시겠습니까?')) {
      await disconnect()
    }
  }

  return (
    <footer className="flex items-center h-6 px-2 bg-ide-accent text-white text-xs no-select">
      {/* 왼쪽 영역 */}
      <div className="flex items-center gap-3 flex-1">
        {/* 연결 상태 */}
        <button
          onClick={() => connectionStatus.connected ? handleDisconnect() : setShowSshModal(true)}
          className="flex items-center gap-1.5 hover:bg-white/10 px-2 py-0.5 rounded transition-colors"
          title={connectionStatus.connected ? '클릭하여 연결 해제' : '클릭하여 서버 연결'}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus.connected ? 'bg-green-400' : 'bg-red-400'
            }`}
          />
          <span>
            {connectionStatus.connected
              ? `${activeProfile?.name || '서버'} 연결됨`
              : '서버 미연결'}
          </span>
        </button>

        {/* MACHINE (연결 시) */}
        {currentProject?.machine && (
          <div className="flex items-center gap-1 px-2 border-l border-white/20">
            <span className="opacity-70">MACHINE:</span>
            <span className="font-mono">{currentProject.machine}</span>
          </div>
        )}

        {/* 프로젝트 경로 (연결 시) */}
        {activeProfile && connectionStatus.connected && (
          <div className="flex items-center gap-1 px-2 border-l border-white/20">
            <span className="opacity-70">워크스페이스:</span>
            <span className="font-mono truncate max-w-[200px]">{activeProfile.workspacePath}</span>
          </div>
        )}
      </div>

      {/* 오른쪽 영역 */}
      <div className="flex items-center gap-3">
        <span className="opacity-70">Yocto BSP Studio v0.1.0</span>
      </div>

      {/* SSH 설정 모달 */}
      <SshSettingsModal isOpen={showSshModal} onClose={() => setShowSshModal(false)} />
    </footer>
  )
}
