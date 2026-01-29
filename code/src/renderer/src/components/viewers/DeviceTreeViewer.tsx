/**
 * Device Tree 구조 뷰어 (개선된 버전)
 * DTS/DTSI 파일의 노드 구조를 트리로 시각화
 */

import { useState, useEffect, useMemo } from 'react'

interface DtNode {
  name: string
  label?: string
  address?: string
  properties: DtProperty[]
  children: DtNode[]
  startLine: number
  endLine: number
}

interface DtProperty {
  name: string
  value: string
  line: number
}

interface DeviceTreeViewerProps {
  content: string
  filePath: string
  onNavigateToLine: (line: number) => void
}

export function DeviceTreeViewer({ content, filePath, onNavigateToLine }: DeviceTreeViewerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<DtNode | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['/']))
  const [viewTab, setViewTab] = useState<'tree' | 'properties'>('tree')

  // Device Tree 파싱
  const rootNode = useMemo(() => parseDeviceTree(content), [content])

  // 검색 필터
  const filteredNodes = useMemo(() => {
    if (!searchQuery) return null
    const query = searchQuery.toLowerCase()
    return findMatchingNodes(rootNode, query)
  }, [rootNode, searchQuery])

  // 노드 클릭
  const handleNodeClick = (node: DtNode) => {
    setSelectedNode(node)
    onNavigateToLine(node.startLine)
    // 모바일에서는 자동으로 속성 탭으로 전환
    if (window.innerWidth < 768) {
      setViewTab('properties')
    }
  }

  // 노드 확장/축소
  const toggleNode = (nodePath: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodePath)) {
        next.delete(nodePath)
      } else {
        next.add(nodePath)
      }
      return next
    })
  }

  // 모두 펼치기
  const expandAll = () => {
    const allPaths = new Set<string>()
    const collect = (node: DtNode, path: string) => {
      allPaths.add(path)
      node.children.forEach((child, i) => collect(child, `${path}/${i}`))
    }
    collect(rootNode, '/')
    setExpandedNodes(allPaths)
  }

  // 모두 접기
  const collapseAll = () => {
    setExpandedNodes(new Set(['/']))
  }

  return (
    <div className="flex flex-col h-full bg-ide-bg">
      {/* 탭 헤더 */}
      <div className="flex items-center justify-between p-2 bg-ide-sidebar border-b border-ide-border">
        <div className="flex gap-1">
          <button
            onClick={() => setViewTab('tree')}
            className={`px-3 py-1 text-xs rounded ${viewTab === 'tree' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
          >
            🌳 트리
          </button>
          <button
            onClick={() => setViewTab('properties')}
            className={`px-3 py-1 text-xs rounded ${viewTab === 'properties' ? 'bg-ide-accent text-white' : 'bg-ide-hover text-ide-text'}`}
          >
            📋 속성 {selectedNode && `(${selectedNode.properties.length})`}
          </button>
        </div>
        <div className="flex gap-1">
          <button onClick={expandAll} className="px-2 py-1 text-xs bg-ide-hover rounded text-ide-text" title="모두 펼치기">
            ⊞
          </button>
          <button onClick={collapseAll} className="px-2 py-1 text-xs bg-ide-hover rounded text-ide-text" title="모두 접기">
            ⊟
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div className="p-2 border-b border-ide-border">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 노드/속성 검색..."
          className="w-full px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text focus:border-ide-accent outline-none"
        />
      </div>

      {/* 선택된 노드 표시 */}
      {selectedNode && (
        <div className="px-2 py-1 bg-ide-active border-b border-ide-border">
          <p className="text-xs font-mono truncate">
            {selectedNode.label && <span className="text-purple-400">&{selectedNode.label}: </span>}
            <span className="text-ide-text">{selectedNode.name}</span>
            {selectedNode.address && <span className="text-cyan-400">@{selectedNode.address}</span>}
            <span className="text-ide-text-muted ml-2">({selectedNode.startLine}행)</span>
          </p>
        </div>
      )}

      {/* 메인 컨텐츠 */}
      <div className="flex-1 overflow-auto">
        {viewTab === 'tree' ? (
          // 트리 뷰
          <div className="p-1">
            {filteredNodes ? (
              <div>
                <p className="text-xs text-ide-text-muted p-2">검색 결과: {filteredNodes.length}개</p>
                {filteredNodes.map((node, index) => (
                  <TreeNode
                    key={index}
                    node={node}
                    path={`search-${index}`}
                    level={0}
                    expandedNodes={expandedNodes}
                    selectedNode={selectedNode}
                    onToggle={toggleNode}
                    onSelect={handleNodeClick}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            ) : (
              <TreeNode
                node={rootNode}
                path="/"
                level={0}
                expandedNodes={expandedNodes}
                selectedNode={selectedNode}
                onToggle={toggleNode}
                onSelect={handleNodeClick}
                searchQuery=""
              />
            )}
          </div>
        ) : (
          // 속성 뷰
          <div className="p-2">
            {selectedNode ? (
              <div className="space-y-2">
                {/* 노드 정보 */}
                <div className="p-3 bg-ide-sidebar rounded border border-ide-border">
                  <h4 className="text-xs text-ide-text-muted mb-2">노드 정보</h4>
                  <div className="space-y-1 text-sm font-mono">
                    {selectedNode.label && (
                      <div className="flex">
                        <span className="text-ide-text-muted w-16">라벨</span>
                        <span className="text-purple-400">&{selectedNode.label}</span>
                      </div>
                    )}
                    <div className="flex">
                      <span className="text-ide-text-muted w-16">이름</span>
                      <span className="text-ide-text">{selectedNode.name}</span>
                    </div>
                    {selectedNode.address && (
                      <div className="flex">
                        <span className="text-ide-text-muted w-16">주소</span>
                        <span className="text-cyan-400">0x{selectedNode.address}</span>
                      </div>
                    )}
                    <div className="flex">
                      <span className="text-ide-text-muted w-16">위치</span>
                      <span className="text-ide-accent">{selectedNode.startLine} - {selectedNode.endLine}행</span>
                    </div>
                  </div>
                </div>

                {/* 속성 목록 */}
                <div>
                  <h4 className="text-xs text-ide-text-muted mb-2">속성 ({selectedNode.properties.length}개)</h4>
                  {selectedNode.properties.length === 0 ? (
                    <p className="text-sm text-ide-text-muted p-2">속성이 없습니다</p>
                  ) : (
                    <div className="space-y-1">
                      {selectedNode.properties.map((prop, index) => (
                        <div
                          key={index}
                          onClick={() => onNavigateToLine(prop.line)}
                          className="p-2 bg-ide-sidebar rounded border border-ide-border hover:border-ide-accent cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-mono font-semibold ${getPropertyColor(prop.name)}`}>
                              {prop.name}
                            </span>
                            <span className="text-xs text-ide-text-muted">:{prop.line}</span>
                          </div>
                          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all bg-ide-bg p-1 rounded">
                            {prop.value || '(empty)'}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 하위 노드 */}
                {selectedNode.children.length > 0 && (
                  <div>
                    <h4 className="text-xs text-ide-text-muted mb-2">하위 노드 ({selectedNode.children.length}개)</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedNode.children.map((child, index) => (
                        <button
                          key={index}
                          onClick={() => { handleNodeClick(child); setViewTab('tree') }}
                          className="px-2 py-1 text-xs bg-ide-hover border border-ide-border rounded text-ide-text hover:border-ide-accent font-mono"
                        >
                          {child.label ? `&${child.label}` : child.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-ide-text-muted py-8">
                <p className="text-2xl mb-2">👆</p>
                <p>트리에서 노드를 선택하세요</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// 트리 노드 컴포넌트
interface TreeNodeProps {
  node: DtNode
  path: string
  level: number
  expandedNodes: Set<string>
  selectedNode: DtNode | null
  onToggle: (path: string) => void
  onSelect: (node: DtNode) => void
  searchQuery: string
}

function TreeNode({ node, path, level, expandedNodes, selectedNode, onToggle, onSelect, searchQuery }: TreeNodeProps) {
  const isExpanded = expandedNodes.has(path)
  const isSelected = selectedNode === node
  const hasChildren = node.children.length > 0

  const getIcon = () => {
    if (node.name === '/') return '🌲'
    if (node.name.includes('gpio')) return '📌'
    if (node.name.includes('uart') || node.name.includes('serial')) return '📡'
    if (node.name.includes('i2c')) return '🔌'
    if (node.name.includes('spi')) return '⚡'
    if (node.name.includes('memory') || node.name.includes('reserved')) return '💾'
    if (node.name.includes('cpu')) return '🖥️'
    if (node.name.includes('interrupt')) return '⚠️'
    if (node.name.includes('clock')) return '⏰'
    if (node.name.includes('pinctrl') || node.name.includes('iomux')) return '🎛️'
    if (node.name.includes('phy')) return '📶'
    if (node.name.includes('eth') || node.name.includes('gmac')) return '🌐'
    if (node.name.includes('usb')) return '🔌'
    if (node.name.includes('pci')) return '🎰'
    if (node.name.includes('dma')) return '🔄'
    if (node.name.includes('can')) return '🚗'
    return '📦'
  }

  // 노드 이름 표시 (라벨 우선)
  const displayName = node.label ? `&${node.label}` : node.name

  return (
    <div>
      <div
        className={`
          flex items-center py-1 px-1 rounded cursor-pointer
          ${isSelected ? 'bg-ide-accent/30 border-l-2 border-ide-accent' : 'hover:bg-ide-hover'}
        `}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
      >
        {/* 확장 버튼 */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(path) }}
            className="w-5 h-5 flex items-center justify-center text-xs text-ide-text-muted hover:text-ide-text"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {/* 클릭 영역 */}
        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={() => onSelect(node)}>
          <span className="flex-shrink-0">{getIcon()}</span>
          <span className={`text-sm font-mono truncate ${node.label ? 'text-purple-400' : 'text-ide-text'}`}>
            {displayName}
          </span>
          {node.address && (
            <span className="text-xs text-cyan-400 font-mono flex-shrink-0">@{node.address}</span>
          )}
        </div>

        {/* 속성/자식 개수 */}
        <span className="text-[10px] text-ide-text-muted flex-shrink-0 ml-1">
          {node.properties.length > 0 && `${node.properties.length}p`}
          {hasChildren && ` ${node.children.length}n`}
        </span>
      </div>

      {/* 자식 노드 */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child, index) => (
            <TreeNode
              key={index}
              node={child}
              path={`${path}/${index}`}
              level={level + 1}
              expandedNodes={expandedNodes}
              selectedNode={selectedNode}
              onToggle={onToggle}
              onSelect={onSelect}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Device Tree 파싱
function parseDeviceTree(content: string): DtNode {
  const lines = content.split('\n')
  const root: DtNode = {
    name: '/',
    properties: [],
    children: [],
    startLine: 1,
    endLine: lines.length,
  }

  const nodeStack: DtNode[] = [root]
  let currentNode = root

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const lineNum = i + 1

    // 빈 줄이나 주석 스킵
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue
    }

    // 노드 시작: label: name@address { 또는 name { 또는 name@address {
    const nodeMatch = trimmed.match(/^(?:(\w+)\s*:\s*)?(\w+[-\w]*)(?:@([0-9a-fA-F]+))?\s*\{/)
    if (nodeMatch) {
      const [, label, name, address] = nodeMatch
      const newNode: DtNode = {
        name,
        label,
        address,
        properties: [],
        children: [],
        startLine: lineNum,
        endLine: lineNum,
      }
      currentNode.children.push(newNode)
      nodeStack.push(currentNode)
      currentNode = newNode
      continue
    }

    // 노드 종료
    if (trimmed === '};' || trimmed === '}') {
      currentNode.endLine = lineNum
      const parent = nodeStack.pop()
      if (parent) {
        currentNode = parent
      }
      continue
    }

    // 속성 (name = value; 또는 name;)
    const propMatch = trimmed.match(/^([\w,#-]+)\s*(?:=\s*(.+?))?;$/)
    if (propMatch) {
      const [, name, value] = propMatch
      currentNode.properties.push({
        name,
        value: value || '',
        line: lineNum,
      })
    }
  }

  return root
}

// 노드 검색
function findMatchingNodes(node: DtNode, query: string): DtNode[] {
  const results: DtNode[] = []

  const search = (n: DtNode) => {
    if (n.name.toLowerCase().includes(query) ||
        (n.label && n.label.toLowerCase().includes(query))) {
      results.push(n)
    }
    
    for (const prop of n.properties) {
      if (prop.name.toLowerCase().includes(query) ||
          prop.value.toLowerCase().includes(query)) {
        if (!results.includes(n)) {
          results.push(n)
        }
        break
      }
    }

    for (const child of n.children) {
      search(child)
    }
  }

  search(node)
  return results
}

// 속성 색상
function getPropertyColor(name: string): string {
  if (name === 'compatible') return 'text-orange-400'
  if (name === 'status') return 'text-green-400'
  if (name === 'reg') return 'text-cyan-400'
  if (name.includes('interrupt')) return 'text-red-400'
  if (name.includes('clock')) return 'text-yellow-400'
  if (name.includes('gpio')) return 'text-purple-400'
  if (name.includes('pinctrl')) return 'text-pink-400'
  return 'text-ide-text'
}
