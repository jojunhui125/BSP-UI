/**
 * 서버 프로젝트 대시보드
 * 서버에 연결된 프로젝트의 정보와 작업 패널
 */

import { useState, useEffect } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useSshStore } from '../../stores/sshStore'
import { useIndexStore } from '../../stores/indexStore'
import { useBuildStore } from '../../stores/buildStore'

export function ServerDashboard() {
  const { serverProject, closeProject, bspInitialized, bspMachine, setBspInitialized, setBspMachine } = useProjectStore()
  const { activeProfile, connectionStatus, execCommand, consoleOutput, clearConsole } = useSshStore()
  const { setConfig } = useBuildStore()
  const { 
    isIndexing, indexProgress, lastIndexTime, startIndexing, stats, refreshStats,
    startServerSideIndexing, checkPython, pythonAvailable
  } = useIndexStore()
  
  const [command, setCommand] = useState('')
  const [loading, setLoading] = useState(false)
  const [useCustomInit, setUseCustomInit] = useState(false)
  const [customInitCommand, setCustomInitCommand] = useState('')
  const [machineOptions] = useState<string[]>([
    's32g274ardb2',
    's32g274ardb2ubuntu',
    's32g399ardb3',
    's32g274abluebox3',
  ])
  const [autoIndexChecked, setAutoIndexChecked] = useState(false)
  const [serverIndexMeta, setServerIndexMeta] = useState<{
    exists: boolean; lastSaved?: string; savedBy?: string; stats?: { files: number; symbols: number }
  } | null>(null)
  const [savingToServer, setSavingToServer] = useState(false)
  const [pythonChecked, setPythonChecked] = useState(false)

  // Python 사용 가능 여부 확인
  useEffect(() => {
    if (activeProfile && !pythonChecked) {
      setPythonChecked(true)
      checkPython(activeProfile.id)
    }
  }, [activeProfile, pythonChecked, checkPython])

  // 프로젝트 열면 서버 인덱스 확인 → 로컬 인덱스 확인 → 자동 인덱싱은 안함!
  useEffect(() => {
    if (serverProject && activeProfile && !autoIndexChecked && !isIndexing) {
      setAutoIndexChecked(true)
      
      const checkAndLoadIndex = async () => {
        try {
          // 1. 서버에 공유 인덱스가 있는지 확인
          const serverMeta = await window.electronAPI.index.getServerMeta(activeProfile.id, serverProject.path)
          setServerIndexMeta(serverMeta)
          
          if (serverMeta.exists) {
            console.log('[Dashboard] 서버 인덱스 발견:', serverMeta)
            
            // 로컬 인덱스 확인
            await refreshStats()
            const localStats = useIndexStore.getState().stats
            
            // 서버 인덱스가 더 최신이거나 로컬이 없으면 서버에서 로드
            if (!localStats || localStats.symbols === 0 || 
                (serverMeta.stats && serverMeta.stats.symbols > (localStats?.symbols || 0))) {
              console.log('[Dashboard] 서버에서 인덱스 로드 중...')
              const loaded = await window.electronAPI.index.loadFromServer(activeProfile.id, serverProject.path)
              if (loaded) {
                await refreshStats()
                console.log('[Dashboard] 서버 인덱스 로드 완료')
                return  // ✅ 로드 성공, 인덱싱 불필요 - 여기서 끝!
              }
            } else {
              console.log('[Dashboard] 로컬 인덱스가 더 최신, 서버 인덱스 스킵')
              return  // ✅ 로컬이 더 최신이면 그냥 사용
            }
          }
          
          // 2. 로컬 인덱스 확인
          await refreshStats()
          const currentStats = useIndexStore.getState().stats
          
          if (currentStats && currentStats.symbols > 0) {
            // ✅ 기존 인덱스 있음 → 그냥 사용 (자동 인덱싱 안함!)
            console.log('[Dashboard] 기존 로컬 인덱스 사용:', currentStats)
            return  // 인덱싱 안함
          }
          
          // 3. 인덱스 없음 → 사용자에게 알림만 (자동 인덱싱 안함!)
          console.log('[Dashboard] 인덱스 없음 - 사용자가 인덱싱 버튼을 눌러야 함')
          
        } catch (err) {
          console.error('[Dashboard] 인덱스 확인 실패:', err)
          // 실패해도 자동 인덱싱 안함!
        }
      }
      
      checkAndLoadIndex()
    }
  }, [serverProject, activeProfile, autoIndexChecked, isIndexing, refreshStats])

  // 인덱스를 서버에 저장
  const handleSaveToServer = async () => {
    if (!serverProject || !activeProfile || isIndexing) return
    
    setSavingToServer(true)
    try {
      const success = await window.electronAPI.index.saveToServer(activeProfile.id, serverProject.path)
      if (success) {
        // 메타데이터 갱신
        const meta = await window.electronAPI.index.getServerMeta(activeProfile.id, serverProject.path)
        setServerIndexMeta(meta)
        alert('인덱스가 서버에 저장되었습니다. 다른 팀원들이 사용할 수 있습니다.')
      } else {
        alert('서버 저장 실패')
      }
    } catch (err) {
      console.error('서버 저장 실패:', err)
      alert('서버 저장 중 오류 발생')
    } finally {
      setSavingToServer(false)
    }
  }

  useEffect(() => {
    if (!bspMachine) {
      setBspMachine('s32g274ardb2')
    }
  }, [bspMachine, setBspMachine])

  useEffect(() => {
    if (bspMachine) {
      setConfig({ machine: bspMachine })
    }
  }, [bspMachine, setConfig])
  
  // 프로젝트 변경 시 autoIndexChecked 초기화
  useEffect(() => {
    setAutoIndexChecked(false)
  }, [serverProject?.path])

  if (!serverProject) return null

  const handleRunCommand = async () => {
    if (!command.trim()) return
    
    setLoading(true)
    try {
      await execCommand(command)
      setCommand('')
    } catch (error) {
      console.error('Command failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleRunCommand()
    }
  }

  // BSP 환경 초기화
  const handleInitialize = async () => {
    setLoading(true)
    clearConsole()
    try {
      if (useCustomInit && customInitCommand.trim()) {
        await execCommand(customInitCommand.trim())
      } else {
        await execCommand(`cd ${serverProject.path} && source ./nxp-setup-alb.sh -m ${bspMachine}`)
      }
      setBspInitialized(true)
    } catch (error) {
      console.error('Init failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 탭 바 */}
      <div className="flex items-center h-9 bg-ide-sidebar border-b border-ide-border">
        <div className="flex items-center h-full px-4 bg-ide-bg border-r border-ide-border">
          <span className="text-sm text-ide-text">🖥️ {serverProject.name}</span>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <span className="w-2 h-2 bg-ide-success rounded-full animate-pulse" />
          <span className="text-xs text-ide-success">{serverProject.serverName}</span>
        </div>
        <button
          onClick={closeProject}
          className="ml-auto mr-2 px-2 py-1 text-xs text-ide-text-muted hover:text-ide-text hover:bg-ide-hover rounded"
        >
          ✕ 닫기
        </button>
      </div>

      {/* 대시보드 컨텐츠 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          {/* 프로젝트 경로 + 초기화 섹션 */}
          <div className="p-4 rounded-lg bg-ide-sidebar border border-ide-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-ide-text">
                  📂 {serverProject.path}
                </h2>
              </div>
            </div>

            {/* 인덱싱 상태 - 항상 표시 */}
            <div className={`p-3 rounded mb-3 ${
              isIndexing ? 'bg-ide-accent/10 border border-ide-accent/30' : 
              indexProgress.phase === 'error' ? 'bg-ide-error/10 border border-ide-error/30' :
              (stats && stats.symbols > 0) || (serverIndexMeta?.stats && serverIndexMeta.stats.symbols > 0) 
                ? 'bg-ide-success/10 border border-ide-success/30' : 
              'bg-ide-sidebar border border-ide-border'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isIndexing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-ide-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-ide-accent">
                        인덱싱 중: {indexProgress.message || indexProgress.phase}
                      </span>
                      {indexProgress.total > 0 && (
                        <span className="text-xs text-ide-text-muted">
                          ({indexProgress.current}/{indexProgress.total})
                        </span>
                      )}
                    </>
                  ) : indexProgress.phase === 'error' ? (
                    <>
                      <span className="text-ide-error">❌</span>
                      <span className="text-sm text-ide-error">
                        인덱싱 실패: {indexProgress.message}
                      </span>
                    </>
                  ) : (stats && stats.symbols > 0) || (serverIndexMeta?.stats && serverIndexMeta.stats.symbols > 0) ? (
                    <>
                      <span className="text-ide-success">⚡</span>
                      <span className="text-sm text-ide-success">인덱스 완료</span>
                      <span className="text-xs text-ide-text-muted">
                        ({serverIndexMeta?.stats?.files || stats?.files || 0}개 파일, {serverIndexMeta?.stats?.symbols || stats?.symbols || 0}개 심볼)
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-ide-warning">⚠️</span>
                      <span className="text-sm text-ide-warning">
                        {autoIndexChecked ? '인덱스 없음 - 인덱싱 버튼을 눌러주세요' : '인덱스 확인 중...'}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveToServer}
                    disabled={isIndexing || savingToServer || !stats}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      isIndexing || savingToServer || !stats
                        ? 'bg-ide-hover text-ide-text-muted cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                    title="인덱스를 서버에 저장하면 다른 팀원들이 바로 사용할 수 있습니다"
                  >
                    {savingToServer ? '⏳ 저장 중...' : '☁️ 서버 저장'}
                  </button>
                  <button
                    onClick={() => {
                      if (!activeProfile) return
                      // Python 있으면 고속 인덱싱, 없으면 일반 인덱싱
                      if (pythonAvailable) {
                        startServerSideIndexing(serverProject.path, activeProfile.id)
                      } else {
                        startIndexing(serverProject.path, activeProfile.id, true)
                      }
                    }}
                    disabled={isIndexing}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      isIndexing 
                        ? 'bg-ide-hover text-ide-text-muted cursor-not-allowed'
                        : pythonAvailable 
                          ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                          : 'bg-ide-accent text-white hover:bg-ide-accent/80'
                    }`}
                    title={pythonAvailable ? '서버에서 직접 인덱싱 (10배 빠름!)' : 'SSH로 파일 읽어서 인덱싱'}
                  >
                    {isIndexing ? '⏳ 진행 중...' : pythonAvailable ? '🚀 인덱싱' : '🔄 인덱싱'}
                  </button>
                </div>
              </div>
              {/* 서버 인덱스 정보 */}
              {serverIndexMeta?.exists && (
                <div className="mt-2 text-xs text-ide-text-muted border-t border-ide-border pt-2">
                  ☁️ 서버 인덱스: {serverIndexMeta.stats?.files}개 파일, {serverIndexMeta.stats?.symbols}개 심볼
                  <span className="ml-2">
                    (저장: {serverIndexMeta.lastSaved ? new Date(serverIndexMeta.lastSaved).toLocaleString() : '알 수 없음'}
                    {serverIndexMeta.savedBy && ` by ${serverIndexMeta.savedBy}`})
                  </span>
                </div>
              )}
            </div>

            {/* BSP 초기화 상태 */}
            {bspInitialized ? (
              <div className="p-3 rounded bg-ide-success/10 border border-ide-success/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-ide-success">✅</span>
                    <span className="text-sm font-medium text-ide-success">BSP 환경 구성 완료</span>
                    <span className="text-xs text-ide-text-muted">({bspMachine})</span>
                  </div>
                  <button
                    onClick={() => setBspInitialized(false)}
                    className="px-2 py-1 text-xs text-ide-text-muted hover:text-ide-text"
                  >
                    다시 설정
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded bg-ide-warning/10 border border-ide-warning/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-ide-warning">⚠️</span>
                  <span className="text-sm font-medium text-ide-warning">BSP 환경 초기화 필요</span>
                  <span className="text-xs text-ide-text-muted">(선택사항 - 뷰어만 사용 시 불필요)</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <code className="flex-1 px-2 py-1 bg-ide-bg rounded text-xs text-ide-text font-mono">
                    source ./nxp-setup-alb.sh -m
                  </code>
                  <input
                    list="bsp-init-machine-options"
                    value={bspMachine}
                    onChange={(e) => setBspMachine(e.target.value)}
                    className="px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text"
                  />
                  <datalist id="bsp-init-machine-options">
                    {machineOptions.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <button
                    onClick={handleInitialize}
                    disabled={loading}
                    className="px-4 py-1.5 bg-ide-warning text-black font-medium rounded text-xs hover:bg-ide-warning/80 transition-colors disabled:opacity-50"
                  >
                    {loading ? '초기화 중...' : '🚀 초기화 실행'}
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-ide-text-muted">
                  <input
                    type="checkbox"
                    checked={useCustomInit}
                    onChange={(e) => setUseCustomInit(e.target.checked)}
                  />
                  <span>직접 명령 입력</span>
                </div>
                {useCustomInit && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={customInitCommand}
                      onChange={(e) => setCustomInitCommand(e.target.value)}
                      placeholder="예: cd /path && source ./nxp-setup-alb.sh -m s32g274ardb2"
                      className="w-full px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text font-mono"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 콘솔 출력 (메인) */}
          <div className="p-4 rounded-lg bg-ide-bg border border-ide-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ide-text">
                💻 콘솔 출력
              </h3>
              <button
                onClick={clearConsole}
                className="px-2 py-1 text-xs bg-ide-hover border border-ide-border rounded text-ide-text-muted hover:text-ide-text hover:bg-ide-border transition-colors"
              >
                🗑️ 지우기
              </button>
            </div>
            <div 
              className="h-72 overflow-auto font-mono text-xs bg-black rounded p-3"
              ref={(el) => {
                if (el) el.scrollTop = el.scrollHeight
              }}
            >
              {consoleOutput.length === 0 ? (
                <p className="text-ide-text-muted">명령을 실행하면 출력이 여기에 표시됩니다.</p>
              ) : (
                consoleOutput.map((line, index) => (
                  <div 
                    key={index} 
                    className={`whitespace-pre-wrap ${
                      line.startsWith('$') ? 'text-ide-accent font-bold' :
                      line.startsWith('[stderr]') ? 'text-ide-warning' :
                      line.startsWith('[오류]') ? 'text-ide-error' :
                      line.startsWith('[연결') || line.startsWith('[성공') ? 'text-ide-success' :
                      'text-green-400'
                    }`}
                  >
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 명령 입력 */}
          <div className="p-4 rounded-lg bg-ide-sidebar border border-ide-border">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-ide-text">⌨️ 명령 실행</h3>
              <div className="flex gap-1 ml-auto">
                <QuickCommand cmd={`cd ${serverProject.path} && ls -la`} label="📂 ls" />
                <QuickCommand cmd={`cd ${serverProject.path} && find . -maxdepth 2 -name "*.sh" -type f`} label="📜 스크립트" />
                <QuickCommand cmd="df -h" label="💾 디스크" />
                <QuickCommand cmd="free -h" label="🧠 메모리" />
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="서버에서 실행할 명령어 입력... (Enter로 실행)"
                className="flex-1 px-3 py-2 bg-ide-bg border border-ide-border rounded text-sm text-ide-text font-mono focus:border-ide-accent outline-none"
                disabled={loading}
              />
              <button
                onClick={handleRunCommand}
                disabled={loading || !command.trim()}
                className="px-4 py-2 bg-ide-accent text-white rounded text-sm hover:bg-ide-accent/80 transition-colors disabled:opacity-50"
              >
                {loading ? '...' : '실행'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 빠른 명령 버튼
 */
function QuickCommand({ cmd, label }: { cmd: string; label: string }) {
  const { execCommand, clearConsole } = useSshStore()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    clearConsole()
    try {
      await execCommand(cmd)
    } catch (error) {
      console.error('Command failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-2 py-1 text-xs bg-ide-hover border border-ide-border rounded text-ide-text hover:bg-ide-border transition-colors disabled:opacity-50"
      title={cmd}
    >
      {loading ? '...' : label}
    </button>
  )
}
