/**
 * Breadcrumb 네비게이션 컴포넌트
 * 현재 파일 경로를 클릭 가능한 세그먼트로 표시
 * A-06: Breadcrumb 네비게이션
 */

import { useMemo, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useSshStore } from '../../stores/sshStore'
import { useProjectStore } from '../../stores/projectStore'

interface BreadcrumbProps {
  filePath: string
  language: string
  onNavigateToFolder?: (folderPath: string) => void
}

export function Breadcrumb({ filePath, language, onNavigateToFolder }: BreadcrumbProps) {
  const { serverProject } = useProjectStore()
  const { activeProfile } = useSshStore()
  const { navigateToDirectory } = useEditorStore()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // 경로를 세그먼트로 분리
  const segments = useMemo(() => {
    if (!filePath) return []
    
    const projectRoot = serverProject?.path || ''
    let displayPath = filePath
    
    // 프로젝트 루트 기준 상대 경로로 변환
    if (projectRoot && filePath.startsWith(projectRoot)) {
      displayPath = filePath.slice(projectRoot.length)
      if (displayPath.startsWith('/')) {
        displayPath = displayPath.slice(1)
      }
    }
    
    const parts = displayPath.split('/').filter(Boolean)
    
    return parts.map((name, index) => {
      // 전체 경로 계산
      const fullPath = projectRoot 
        ? `${projectRoot}/${parts.slice(0, index + 1).join('/')}`
        : `/${parts.slice(0, index + 1).join('/')}`
      
      const isLast = index === parts.length - 1
      
      return {
        name,
        fullPath,
        isLast,
        icon: isLast ? getFileIcon(name) : '📁'
      }
    })
  }, [filePath, serverProject?.path])

  // 폴더 클릭 핸들러
  const handleFolderClick = (folderPath: string) => {
    if (onNavigateToFolder) {
      onNavigateToFolder(folderPath)
    } else {
      navigateToDirectory(folderPath)
    }
  }

  // 프로젝트 루트로 이동
  const handleRootClick = () => {
    if (serverProject?.path) {
      navigateToDirectory(serverProject.path)
    }
  }

  if (segments.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-ide-bg/50 border-b border-ide-border text-xs overflow-x-auto">
      {/* 프로젝트 루트 */}
      {serverProject && (
        <>
          <button
            onClick={handleRootClick}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-ide-hover text-ide-text-muted hover:text-ide-text transition-colors"
            title={serverProject.path}
          >
            <span>🏠</span>
            <span className="font-medium">{serverProject.name || 'Project'}</span>
          </button>
          <span className="text-ide-border">/</span>
        </>
      )}

      {/* 경로 세그먼트 */}
      {segments.map((segment, index) => (
        <div key={index} className="flex items-center gap-1">
          {segment.isLast ? (
            // 현재 파일 (클릭 불가)
            <div 
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-ide-hover"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span>{segment.icon}</span>
              <span className="text-ide-text font-medium">{segment.name}</span>
              <span className={`ml-1 px-1 rounded text-[10px] ${getLanguageBadgeColor(language)}`}>
                {language}
              </span>
            </div>
          ) : (
            // 폴더 (클릭 가능)
            <button
              onClick={() => handleFolderClick(segment.fullPath)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`
                flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors
                ${hoveredIndex === index 
                  ? 'bg-ide-accent/20 text-ide-accent' 
                  : 'hover:bg-ide-hover text-ide-text-muted hover:text-ide-text'
                }
              `}
              title={`${segment.fullPath}로 이동`}
            >
              <span>{segment.icon}</span>
              <span>{segment.name}</span>
            </button>
          )}
          
          {/* 구분자 */}
          {!segment.isLast && (
            <span className="text-ide-border">/</span>
          )}
        </div>
      ))}

      {/* 빠른 액션 */}
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => navigator.clipboard.writeText(filePath)}
          className="px-1.5 py-0.5 rounded text-ide-text-muted hover:text-ide-text hover:bg-ide-hover transition-colors"
          title="경로 복사"
        >
          📋
        </button>
      </div>
    </div>
  )
}

// 파일 아이콘
function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, string> = {
    'bb': '📦', 'bbappend': '📎', 'bbclass': '🔷', 'inc': '📄', 'conf': '⚙️',
    'dts': '🌳', 'dtsi': '🌿',
    'sh': '💻', 'py': '🐍',
    'c': '🔵', 'h': '🔹', 'cpp': '🟦',
    'config': '🔧', 'defconfig': '🔧',
    'patch': '🩹', 'diff': '🩹',
    'md': '📝', 'txt': '📄',
    'json': '📋', 'yaml': '📋', 'yml': '📋',
    'mk': '🔨',
  }
  if (filename === 'Makefile' || filename === 'makefile') return '🔨'
  if (filename === 'Kconfig') return '⚙️'
  return iconMap[ext] || '📄'
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
    'makefile': 'bg-amber-500/30 text-amber-400',
  }
  return colors[language] || 'bg-ide-hover text-ide-text-muted'
}
