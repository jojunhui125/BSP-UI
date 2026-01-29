/**
 * 파일 탐색기 패널
 */

import { useState, useEffect } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import type { FileTreeNode } from '@shared/types'

export function FileExplorer() {
  const { currentProject } = useProjectStore()
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
  const [loading, setLoading] = useState(false)

  // 프로젝트 변경 시 파일 트리 로드
  useEffect(() => {
    if (!currentProject) {
      setFileTree([])
      return
    }

    const loadFileTree = async () => {
      setLoading(true)
      try {
        const tree = await window.electronAPI.file.getFileTree(currentProject.path)
        setFileTree(tree)
      } catch (error) {
        console.error('Failed to load file tree:', error)
      } finally {
        setLoading(false)
      }
    }

    loadFileTree()
  }, [currentProject?.path])

  if (!currentProject) {
    return (
      <div className="p-4 text-sm text-ide-text-muted">
        <p>프로젝트를 먼저 열어주세요.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4 text-sm text-ide-text-muted">
        <p>파일 트리 로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="p-2">
      <TreeNodeList nodes={fileTree} level={0} />
    </div>
  )
}

interface TreeNodeListProps {
  nodes: FileTreeNode[]
  level: number
}

function TreeNodeList({ nodes, level }: TreeNodeListProps) {
  return (
    <div>
      {nodes.map((node) => (
        <TreeNodeItem key={node.path} node={node} level={level} />
      ))}
    </div>
  )
}

interface TreeNodeItemProps {
  node: FileTreeNode
  level: number
}

function TreeNodeItem({ node, level }: TreeNodeItemProps) {
  const [expanded, setExpanded] = useState(level < 1)

  const handleClick = () => {
    if (node.type === 'directory') {
      setExpanded(!expanded)
    } else {
      // TODO: 파일 열기
      console.log('Open file:', node.path)
    }
  }

  const icon = node.type === 'directory'
    ? (expanded ? '📂' : '📁')
    : getFileIcon(node.extension || '')

  return (
    <div>
      <button
        onClick={handleClick}
        className={`
          flex items-center w-full px-1 py-0.5 text-left text-sm
          hover:bg-ide-hover rounded transition-colors
        `}
        style={{ paddingLeft: `${level * 16 + 4}px` }}
      >
        <span className="mr-1 text-xs">{icon}</span>
        <span className="truncate text-ide-text">{node.name}</span>
      </button>
      
      {node.type === 'directory' && expanded && node.children && (
        <TreeNodeList nodes={node.children} level={level + 1} />
      )}
    </div>
  )
}

/**
 * 파일 확장자에 따른 아이콘
 */
function getFileIcon(ext: string): string {
  const iconMap: Record<string, string> = {
    conf: '⚙️',
    bb: '📦',
    bbappend: '📦',
    bbclass: '📦',
    inc: '📄',
    patch: '🩹',
    sh: '💻',
    py: '🐍',
    c: '🔷',
    h: '🔷',
    cpp: '🔷',
    dts: '🌳',
    dtsi: '🌳',
    md: '📝',
    txt: '📄',
    json: '📋',
    yaml: '📋',
    yml: '📋',
  }
  return iconMap[ext] || '📄'
}
