/**
 * 레이어 패널
 * Yocto 레이어 목록 및 우선순위 표시
 */

import { useProjectStore } from '../../stores/projectStore'

export function LayersPanel() {
  const { currentProject } = useProjectStore()

  if (!currentProject) {
    return (
      <div className="p-4 text-sm text-ide-text-muted">
        <p>프로젝트를 먼저 열어주세요.</p>
      </div>
    )
  }

  const { layers } = currentProject

  if (layers.length === 0) {
    return (
      <div className="p-4 text-sm text-ide-text-muted">
        <p>레이어가 감지되지 않았습니다.</p>
        <p className="mt-2 text-xs">bblayers.conf 파일을 확인해주세요.</p>
      </div>
    )
  }

  // 우선순위로 정렬 (높은 것부터)
  const sortedLayers = [...layers].sort((a, b) => b.priority - a.priority)

  return (
    <div className="p-2">
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
