/**
 * 에디터 영역 컴포넌트
 * 서버 프로젝트: 대시보드 + 고급 파일 뷰어
 * 로컬 프로젝트: 로컬 대시보드
 */

import { useProjectStore } from '../../stores/projectStore'
import { useEditorStore } from '../../stores/editorStore'
import { WelcomeView } from '../views/WelcomeView'
import { ServerDashboard } from '../views/ServerDashboard'
import { AdvancedFileViewer } from '../editor/AdvancedFileViewer'

export function EditorArea() {
  const { currentProject, serverProject } = useProjectStore()
  const { openFiles } = useEditorStore()

  // 서버 프로젝트 모드
  if (serverProject) {
    // 파일이 열려있으면 고급 파일 뷰어 표시
    if (openFiles.length > 0) {
      return <AdvancedFileViewer />
    }
    // 아니면 대시보드 표시
    return <ServerDashboard />
  }

  // 로컬 프로젝트 모드
  if (currentProject) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center h-9 bg-ide-sidebar border-b border-ide-border">
          <div className="flex items-center h-full px-4 bg-ide-bg border-r border-ide-border">
            <span className="text-sm text-ide-text">Dashboard</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <LocalDashboardView />
        </div>
      </div>
    )
  }

  // 프로젝트 없음
  return <WelcomeView />
}

/**
 * 로컬 대시보드 뷰
 */
function LocalDashboardView() {
  const { currentProject } = useProjectStore()

  if (!currentProject) return null

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-ide-sidebar border border-ide-border">
        <h2 className="text-lg font-semibold text-ide-text mb-2">
          {currentProject.name}
        </h2>
        <p className="text-sm text-ide-text-muted">{currentProject.path}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-ide-sidebar border border-ide-border">
          <h3 className="text-xs font-semibold uppercase text-ide-text-muted mb-2">
            MACHINE
          </h3>
          <p className="text-lg font-mono text-ide-success">
            {currentProject.machine || '(미설정)'}
          </p>
        </div>

        <div className="p-4 rounded-lg bg-ide-sidebar border border-ide-border">
          <h3 className="text-xs font-semibold uppercase text-ide-text-muted mb-2">
            DISTRO
          </h3>
          <p className="text-lg font-mono text-ide-warning">
            {currentProject.distro || '(미설정)'}
          </p>
        </div>

        <div className="p-4 rounded-lg bg-ide-sidebar border border-ide-border">
          <h3 className="text-xs font-semibold uppercase text-ide-text-muted mb-2">
            레이어 수
          </h3>
          <p className="text-lg font-mono text-ide-accent">
            {currentProject.layers.length}
          </p>
        </div>

        <div className="p-4 rounded-lg bg-ide-sidebar border border-ide-border">
          <h3 className="text-xs font-semibold uppercase text-ide-text-muted mb-2">
            빠른 실행
          </h3>
          <button className="px-3 py-1.5 text-sm bg-ide-accent text-white rounded hover:bg-ide-accent/80 transition-colors">
            빌드 시작
          </button>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-ide-sidebar border border-ide-border">
        <h3 className="text-xs font-semibold uppercase text-ide-text-muted mb-3">
          레이어 목록
        </h3>
        <div className="space-y-2">
          {currentProject.layers.map((layer, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 rounded bg-ide-bg"
            >
              <span className="text-sm font-mono text-ide-text">{layer.name}</span>
              <span className="text-xs text-ide-text-muted">
                우선순위: {layer.priority}
              </span>
            </div>
          ))}
          {currentProject.layers.length === 0 && (
            <p className="text-sm text-ide-text-muted">레이어가 감지되지 않았습니다.</p>
          )}
        </div>
      </div>
    </div>
  )
}
