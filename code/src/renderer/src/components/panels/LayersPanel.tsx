/**
 * 레이어 패널
 * Yocto 레이어 목록 및 우선순위 표시
 */

import { useEffect, useMemo, useState } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useSshStore } from '../../stores/sshStore'
import { useBuildStore } from '../../stores/buildStore'

interface LayerEntry {
  name: string
  path: string
  priority: number
}

const expandVars = (input: string, vars: Record<string, string>) =>
  input.replace(/\$\{([^}]+)\}/g, (match, key) => vars[key] ?? match)

const normalizePosixPath = (input: string) => {
  const parts = input.split('/').filter(Boolean)
  const stack: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return `/${stack.join('/')}`
}

const toLayerName = (path: string) => {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

const quoteForShell = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`

export function LayersPanel() {
  const { currentProject, serverProject, bspMachine } = useProjectStore()
  const { connectionStatus, activeProfile } = useSshStore()
  const { config } = useBuildStore()
  const [serverLayers, setServerLayers] = useState<LayerEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedBuildDir, setResolvedBuildDir] = useState<string | null>(null)

  const serverMode = Boolean(serverProject)
  const layers = currentProject?.layers ?? serverLayers
  const hasPriority = layers.some((layer) => layer.priority !== 0)
  const sortedLayers = useMemo(() => {
    if (!hasPriority) return layers
    return [...layers].sort((a, b) => b.priority - a.priority)
  }, [hasPriority, layers])

  useEffect(() => {
    const loadServerLayers = async () => {
      if (!serverProject || !activeProfile || !connectionStatus.connected) return
      setLoading(true)
      setError(null)
      setResolvedBuildDir(null)

      try {
        const rawBuildDir = config.buildDir.trim()
        const candidateDirs: string[] = []
        if (rawBuildDir) {
          candidateDirs.push(rawBuildDir)
        }
        if (bspMachine) {
          candidateDirs.push(`build_${bspMachine}`)
        }
        candidateDirs.push('build')

        try {
          const listCmd = `cd ${quoteForShell(serverProject.path)} && ls -1d build_* 2>/dev/null`
          const listResult = await window.electronAPI.ssh.exec(
            activeProfile.id,
            `bash -lc ${quoteForShell(listCmd)}`
          )
          const extra = listResult.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
          candidateDirs.push(...extra)
        } catch {
          // ignore list failures
        }

        const buildDirs = Array.from(new Set(candidateDirs.filter(Boolean)))
        let content = ''
        let selectedBuildDir = ''

        for (const dir of buildDirs) {
          try {
            const bblayersPath = `${serverProject.path}/${dir}/conf/bblayers.conf`
            content = await window.electronAPI.ssh.readFile(activeProfile.id, bblayersPath)
            selectedBuildDir = dir
            break
          } catch {
            // try next candidate
          }
        }

        if (!content) {
          throw new Error(`bblayers.conf not found (tried: ${buildDirs.join(', ')})`)
        }

        setResolvedBuildDir(selectedBuildDir)

        const tokens = Array.from(
          content.matchAll(/(?:\$\{[^}]+\}|\/)[^\s"'\\]+/g)
        ).map((match) => match[0].replace(/['"\\]/g, '').trim())

        const topDir = `${serverProject.path}/${selectedBuildDir}`
        const vars = {
          TOPDIR: topDir,
          BSPDIR: serverProject.path,
        }

        const layerPaths = tokens
          .map((token) => expandVars(token, vars))
          .map((token) => (token.startsWith('/') ? token : `${topDir}/${token}`))
          .map((token) => normalizePosixPath(token))

        const unique = Array.from(new Set(layerPaths))
        const layerMeta = await Promise.all(
          unique.map(async (path) => {
            try {
              const layerConfPath = `${path}/conf/layer.conf`
              const layerConf = await window.electronAPI.ssh.readFile(
                activeProfile.id,
                layerConfPath
              )
              const match = layerConf.match(/^\s*BBFILE_PRIORITY(?:_[A-Za-z0-9_-]+)?\s*=\s*"?(\d+)"?/m)
              return {
                name: toLayerName(path),
                path,
                priority: match ? Number(match[1]) : 0,
              }
            } catch {
              return {
                name: toLayerName(path),
                path,
                priority: 0,
              }
            }
          })
        )

        setServerLayers(layerMeta)
      } catch (err) {
        const message = err instanceof Error ? err.message : '레이어 로드 실패'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    void loadServerLayers()
  }, [serverProject?.path, activeProfile?.id, connectionStatus.connected, config.buildDir, bspMachine])

  if (!currentProject && !serverProject) {
    return (
      <div className="p-4 text-sm text-ide-text-muted">
        <p>프로젝트를 먼저 열어주세요.</p>
      </div>
    )
  }

  if (serverMode && loading) {
    return (
      <div className="p-4 text-sm text-ide-text-muted">
        <p>레이어를 불러오는 중...</p>
      </div>
    )
  }

  if (serverMode && error) {
    return (
      <div className="p-4 text-sm text-ide-error">
        <p>레이어 로드 실패: {error}</p>
      </div>
    )
  }

  if (layers.length === 0) {
    return (
      <div className="p-4 text-sm text-ide-text-muted">
        <p>레이어가 감지되지 않았습니다.</p>
        <p className="mt-2 text-xs">bblayers.conf 파일을 확인해주세요.</p>
      </div>
    )
  }

  return (
    <div className="p-2">
      <div className="mb-2 flex items-center justify-between text-xs text-ide-text-muted">
        <span>
        {serverMode ? '서버 레이어' : '로컬 레이어'} {sortedLayers.length}개
        {serverMode && resolvedBuildDir ? ` (${resolvedBuildDir})` : ''}
        </span>
        {serverMode && (
          <span>
            {loading ? '로딩 중...' : '로드 완료'}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {sortedLayers.map((layer, index) => (
          <LayerItem key={layer.path} layer={layer} index={index} />
        ))}
      </div>
    </div>
  )
}

interface LayerItemProps {
  layer: { name: string; path: string; priority: number }
  index: number
}

function LayerItem({ layer, index }: LayerItemProps) {
  // 레이어 타입 분류
  const layerType = getLayerType(layer.name)

  return (
    <div
      className={`
        flex items-center justify-between p-2 rounded
        hover:bg-ide-hover transition-colors cursor-pointer
        ${layerType === 'vendor' ? 'border-l-2 border-ide-warning' : ''}
        ${layerType === 'custom' ? 'border-l-2 border-ide-success' : ''}
      `}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-ide-text-muted w-5">{index + 1}</span>
        <span className="text-lg">📚</span>
        <div className="min-w-0">
          <p className="text-sm font-mono text-ide-text truncate">{layer.name}</p>
          <p className="text-xs text-ide-text-muted truncate">{layer.path}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 ml-2">
        <span className={`
          px-1.5 py-0.5 rounded text-xs
          ${layerType === 'core' ? 'bg-ide-accent/20 text-ide-accent' : ''}
          ${layerType === 'vendor' ? 'bg-ide-warning/20 text-ide-warning' : ''}
          ${layerType === 'custom' ? 'bg-ide-success/20 text-ide-success' : ''}
          ${layerType === 'bsp' ? 'bg-purple-500/20 text-purple-400' : ''}
        `}>
          {layerType}
        </span>
        <span className="text-xs text-ide-text-muted">P:{layer.priority}</span>
      </div>
    </div>
  )
}

/**
 * 레이어 이름으로 타입 추정
 */
function getLayerType(name: string): 'core' | 'vendor' | 'bsp' | 'custom' {
  const lowerName = name.toLowerCase()
  
  if (lowerName.includes('poky') || lowerName === 'meta' || lowerName.includes('oe-core')) {
    return 'core'
  }
  if (lowerName.includes('bsp') || lowerName.includes('board')) {
    return 'bsp'
  }
  if (
    lowerName.includes('vendor') ||
    lowerName.includes('nxp') ||
    lowerName.includes('alb') ||
    lowerName.includes('freescale')
  ) {
    return 'vendor'
  }
  if (lowerName.includes('local') || lowerName.includes('custom')) {
    return 'custom'
  }
  return 'custom'
}
