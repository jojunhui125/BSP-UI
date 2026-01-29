/**
 * 고급 파일 뷰어
 * Monaco Editor + 컨텍스트 뷰어 (Include Chain, Device Tree, Variables, GPIO, Dependencies)
 */

import { useState, useRef, useCallback } from 'react'
import { useEditorStore, OpenFile } from '../../stores/editorStore'
import { useSshStore } from '../../stores/sshStore'
import { MonacoEditor } from './MonacoEditor'
import { Breadcrumb } from '../layout/Breadcrumb'
import { IncludeChainViewer } from '../viewers/IncludeChainViewer'
import { DeviceTreeViewer } from '../viewers/DeviceTreeViewer'
import { BitbakeVariableViewer } from '../viewers/BitbakeVariableViewer'
import { GpioPinmapViewer } from '../viewers/GpioPinmapViewer'
import { RecipeDependencyViewer } from '../viewers/RecipeDependencyViewer'
import { PinDefinitionViewer } from '../viewers/PinDefinitionViewer'
import { MacroResolverViewer } from '../viewers/MacroResolverViewer'

type ViewerTab = 'none' | 'include' | 'devicetree' | 'variables' | 'gpio' | 'dependencies' | 'pindef' | 'macro'

export function AdvancedFileViewer() {
  const { openFiles, activeFileId, setActiveFile, closeFile, updateFileContent, markFileSaved } = useEditorStore()
  const { activeProfile } = useSshStore()
  
  const [rightPanel, setRightPanel] = useState<ViewerTab>('none')
  const editorRef = useRef<any>(null)
  
  const activeFile = openFiles.find(f => f.id === activeFileId)

  // 파일이 없으면 빈 상태
  if (openFiles.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-ide-text-muted bg-ide-bg">
        <div className="text-6xl mb-4">🚀</div>
        <p className="text-lg font-semibold text-ide-text">핵폭탄급 BSP 뷰어</p>
        <p className="text-sm mt-2">왼쪽 탐색기에서 파일을 선택하세요</p>
        
        <div className="mt-8 grid grid-cols-3 gap-3 text-sm max-w-xl">
          <div className="p-3 bg-ide-sidebar rounded border border-ide-border hover:border-ide-accent transition-colors">
            <p className="text-orange-400 mb-1 text-lg">🔗</p>
            <p className="text-ide-text font-medium">Include Chain</p>
            <p className="text-xs text-ide-text-muted">require/include 추적</p>
          </div>
          <div className="p-3 bg-ide-sidebar rounded border border-ide-border hover:border-ide-accent transition-colors">
            <p className="text-green-400 mb-1 text-lg">🌳</p>
            <p className="text-ide-text font-medium">Device Tree</p>
            <p className="text-xs text-ide-text-muted">DTS 노드 시각화</p>
          </div>
          <div className="p-3 bg-ide-sidebar rounded border border-ide-border hover:border-ide-accent transition-colors">
            <p className="text-purple-400 mb-1 text-lg">📌</p>
            <p className="text-ide-text font-medium">GPIO 핀맵</p>
            <p className="text-xs text-ide-text-muted">핀 할당 다이어그램</p>
          </div>
          <div className="p-3 bg-ide-sidebar rounded border border-ide-border hover:border-ide-accent transition-colors">
            <p className="text-blue-400 mb-1 text-lg">📊</p>
            <p className="text-ide-text font-medium">Variables</p>
            <p className="text-xs text-ide-text-muted">BitBake 변수 분석</p>
          </div>
          <div className="p-3 bg-ide-sidebar rounded border border-ide-border hover:border-ide-accent transition-colors">
            <p className="text-cyan-400 mb-1 text-lg">🕸️</p>
            <p className="text-ide-text font-medium">Dependencies</p>
            <p className="text-xs text-ide-text-muted">의존성 그래프</p>
          </div>
          <div className="p-3 bg-ide-sidebar rounded border border-ide-border hover:border-ide-accent transition-colors">
            <p className="text-ide-accent mb-1 text-lg">💾</p>
            <p className="text-ide-text font-medium">즉시 저장</p>
            <p className="text-xs text-ide-text-muted">Ctrl+S → 서버 저장</p>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-ide-sidebar rounded-lg border border-ide-border max-w-xl">
          <p className="text-xs text-ide-text-muted mb-2">🎯 지원 파일 형식</p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 text-xs bg-orange-500/20 text-orange-400 rounded">.bb</span>
            <span className="px-2 py-1 text-xs bg-orange-500/20 text-orange-400 rounded">.bbappend</span>
            <span className="px-2 py-1 text-xs bg-orange-500/20 text-orange-400 rounded">.inc</span>
            <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded">.conf</span>
            <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded">.dts</span>
            <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded">.dtsi</span>
            <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded">.c/.h</span>
            <span className="px-2 py-1 text-xs bg-cyan-500/20 text-cyan-400 rounded">.sh</span>
          </div>
        </div>
      </div>
    )
  }

  // 저장 핸들러
  const handleSave = async () => {
    if (!activeProfile || !activeFile?.isDirty) return
    try {
      await window.electronAPI.ssh.writeFile(
        activeProfile.id,
        activeFile.path,
        activeFile.content
      )
      markFileSaved(activeFile.id)
    } catch (err) {
      console.error('Failed to save file:', err)
    }
  }

  // 라인 이동
  const handleNavigateToLine = useCallback((line: number) => {
    if (editorRef.current) {
      editorRef.current.revealLineInCenter(line)
      editorRef.current.setPosition({ lineNumber: line, column: 1 })
      editorRef.current.focus()
    }
  }, [])

  // 파일 타입에 따른 사용 가능한 뷰어
  const getAvailableViewers = (file: OpenFile): ViewerTab[] => {
    const viewers: ViewerTab[] = []
    
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const fileName = file.name.toLowerCase()
    
    // Include Chain: BB, BBappend, Inc, Conf, DTS, DTSI, C headers
    if (['bb', 'bbappend', 'inc', 'conf', 'dts', 'dtsi', 'h', 'c'].includes(ext)) {
      viewers.push('include')
    }
    
    // Device Tree: DTS, DTSI
    if (['dts', 'dtsi'].includes(ext)) {
      viewers.push('devicetree')
      viewers.push('gpio')  // GPIO 핀맵도 Device Tree에서 추출
    }
    
    // BitBake Variables: BB, BBappend, Inc, Conf
    if (['bb', 'bbappend', 'inc', 'conf', 'bbclass'].includes(ext)) {
      viewers.push('variables')
      viewers.push('dependencies')  // 레시피 의존성
    }
    
    // 핀 정의: C 헤더 파일 (pinctrl, gpio, mux 등)
    if (ext === 'h' || ext === 'c') {
      // pinctrl, gpio, mux, pad 관련 파일이면 핀 정의 뷰어 활성화
      if (fileName.includes('pin') || fileName.includes('gpio') || 
          fileName.includes('mux') || fileName.includes('pad') ||
          fileName.includes('iomux')) {
        viewers.push('pindef')
      }
    }
    
    // 매크로 해석: DTS, C 파일 등 매크로가 많이 사용되는 파일
    if (['dts', 'dtsi', 'h', 'c', 'S'].includes(ext)) {
      viewers.push('macro')
    }
    
    return viewers
  }

  const availableViewers = activeFile ? getAvailableViewers(activeFile) : []

  return (
    <div className="flex flex-col h-full">
      {/* 탭 바 */}
      <div className="flex items-center bg-ide-sidebar border-b border-ide-border">
        {/* 파일 탭 */}
        <div className="flex-1 flex items-center overflow-x-auto">
          {openFiles.map((file) => (
            <FileTab
              key={file.id}
              file={file}
              isActive={file.id === activeFileId}
              onSelect={() => setActiveFile(file.id)}
              onClose={() => closeFile(file.id)}
            />
          ))}
        </div>

        {/* 뷰어 토글 버튼 */}
        <div className="flex items-center gap-1 px-2 border-l border-ide-border">
          {availableViewers.includes('include') && (
            <button
              onClick={() => setRightPanel(rightPanel === 'include' ? 'none' : 'include')}
              className={`px-2 py-1 text-xs rounded ${rightPanel === 'include' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
              title="Include Chain - 파일 포함 관계 추적"
            >
              🔗
            </button>
          )}
          {availableViewers.includes('devicetree') && (
            <button
              onClick={() => setRightPanel(rightPanel === 'devicetree' ? 'none' : 'devicetree')}
              className={`px-2 py-1 text-xs rounded ${rightPanel === 'devicetree' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
              title="Device Tree - 노드 구조 시각화"
            >
              🌳
            </button>
          )}
          {availableViewers.includes('gpio') && (
            <button
              onClick={() => setRightPanel(rightPanel === 'gpio' ? 'none' : 'gpio')}
              className={`px-2 py-1 text-xs rounded ${rightPanel === 'gpio' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
              title="GPIO 핀맵 - 핀 할당 시각화"
            >
              📌
            </button>
          )}
          {availableViewers.includes('variables') && (
            <button
              onClick={() => setRightPanel(rightPanel === 'variables' ? 'none' : 'variables')}
              className={`px-2 py-1 text-xs rounded ${rightPanel === 'variables' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
              title="BitBake Variables - 변수 분석"
            >
              📊
            </button>
          )}
          {availableViewers.includes('dependencies') && (
            <button
              onClick={() => setRightPanel(rightPanel === 'dependencies' ? 'none' : 'dependencies')}
              className={`px-2 py-1 text-xs rounded ${rightPanel === 'dependencies' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
              title="Dependencies - 의존성 그래프"
            >
              🕸️
            </button>
          )}
          {availableViewers.includes('pindef') && (
            <button
              onClick={() => setRightPanel(rightPanel === 'pindef' ? 'none' : 'pindef')}
              className={`px-2 py-1 text-xs rounded ${rightPanel === 'pindef' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
              title="핀 정의 - #define 매크로 분석"
            >
              📍
            </button>
          )}
          {availableViewers.includes('macro') && (
            <button
              onClick={() => setRightPanel(rightPanel === 'macro' ? 'none' : 'macro')}
              className={`px-2 py-1 text-xs rounded ${rightPanel === 'macro' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
              title="매크로 해석 - 사용된 매크로의 실제 값 찾기"
            >
              🔮
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb 네비게이션 */}
      {activeFile && (
        <Breadcrumb 
          filePath={activeFile.path} 
          language={activeFile.language}
        />
      )}

      {/* 파일 정보 바 */}
      {activeFile && (
        <div className="flex items-center justify-between px-3 py-1 bg-ide-bg border-b border-ide-border text-xs">
          <div className="flex items-center gap-3">
            {activeFile.isDirty && (
              <span className="flex items-center gap-1 text-ide-warning">
                <span className="w-2 h-2 rounded-full bg-ide-warning animate-pulse" />
                수정됨
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeFile.isDirty && (
              <button
                onClick={handleSave}
                className="px-2 py-0.5 bg-ide-accent text-white rounded text-xs hover:bg-ide-accent/80"
              >
                💾 저장 (Ctrl+S)
              </button>
            )}
          </div>
        </div>
      )}

      {/* 메인 영역 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 에디터 */}
        <div className={`${rightPanel !== 'none' ? 'w-1/2' : 'w-full'} h-full`}>
          {activeFile && (
            <MonacoEditor
              file={activeFile}
              onContentChange={(content) => updateFileContent(activeFile.id, content)}
              onSave={handleSave}
            />
          )}
        </div>

        {/* 오른쪽 패널 */}
        {rightPanel !== 'none' && activeFile && (
          <div className="w-1/2 h-full border-l border-ide-border overflow-hidden">
            {rightPanel === 'include' && (
              <IncludeChainViewer
                filePath={activeFile.path}
              />
            )}
            {rightPanel === 'devicetree' && (
              <DeviceTreeViewer
                content={activeFile.content}
                filePath={activeFile.path}
                onNavigateToLine={handleNavigateToLine}
              />
            )}
            {rightPanel === 'gpio' && (
              <GpioPinmapViewer
                content={activeFile.content}
                filePath={activeFile.path}
                onNavigateToLine={handleNavigateToLine}
              />
            )}
            {rightPanel === 'variables' && (
              <BitbakeVariableViewer
                content={activeFile.content}
                filePath={activeFile.path}
                onNavigateToLine={handleNavigateToLine}
              />
            )}
            {rightPanel === 'dependencies' && (
              <RecipeDependencyViewer
                content={activeFile.content}
                filePath={activeFile.path}
                onNavigateToLine={handleNavigateToLine}
              />
            )}
            {rightPanel === 'pindef' && (
              <PinDefinitionViewer
                content={activeFile.content}
                filePath={activeFile.path}
                onNavigateToLine={handleNavigateToLine}
              />
            )}
            {rightPanel === 'macro' && (
              <MacroResolverViewer
                content={activeFile.content}
                filePath={activeFile.path}
                onNavigateToLine={handleNavigateToLine}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// 파일 탭 컴포넌트
interface FileTabProps {
  file: OpenFile
  isActive: boolean
  onSelect: () => void
  onClose: () => void
}

function FileTab({ file, isActive, onSelect, onClose }: FileTabProps) {
  const getFileIcon = () => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const iconMap: Record<string, string> = {
      'bb': '📦', 'bbappend': '📎', 'bbclass': '🔷', 'inc': '📄', 'conf': '⚙️',
      'dts': '🌳', 'dtsi': '🌿',
      'sh': '💻', 'py': '🐍',
      'c': '🔵', 'h': '🔹', 'cpp': '🟦',
      'config': '🔧', 'defconfig': '🔧',
      'patch': '🩹', 'diff': '🩹',
      'md': '📝', 'txt': '📄',
      'json': '📋', 'yaml': '📋', 'yml': '📋',
      'Makefile': '🔨', 'mk': '🔨',
    }
    return iconMap[ext] || iconMap[file.name] || '📄'
  }

  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center gap-2 px-3 py-2 cursor-pointer
        border-r border-ide-border min-w-[120px] max-w-[200px]
        ${isActive 
          ? 'bg-ide-bg border-t-2 border-t-ide-accent' 
          : 'bg-ide-sidebar hover:bg-ide-hover'
        }
      `}
    >
      <span className="text-sm">{getFileIcon()}</span>
      <span className={`text-sm truncate flex-1 ${isActive ? 'text-ide-text' : 'text-ide-text-muted'}`}>
        {file.name}
      </span>
      {file.isDirty && (
        <span className="w-2 h-2 rounded-full bg-ide-accent flex-shrink-0" title="수정됨" />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="w-4 h-4 flex items-center justify-center rounded hover:bg-ide-hover text-ide-text-muted hover:text-ide-text flex-shrink-0"
      >
        ✕
      </button>
    </div>
  )
}

// 언어 배지 색상
function getLanguageBadgeColor(language: string): string {
  const colors: Record<string, string> = {
    'bitbake': 'bg-orange-500/30 text-orange-400',
    'dts': 'bg-green-500/30 text-green-400',
    'shell': 'bg-blue-500/30 text-blue-400',
    'python': 'bg-yellow-500/30 text-yellow-400',
    'c': 'bg-cyan-500/30 text-cyan-400',
    'cpp': 'bg-cyan-500/30 text-cyan-400',
    'ini': 'bg-purple-500/30 text-purple-400',
    'diff': 'bg-red-500/30 text-red-400',
  }
  return colors[language] || 'bg-ide-hover text-ide-text'
}
