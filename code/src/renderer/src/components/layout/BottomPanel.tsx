/**
 * 하단 패널 컴포넌트
 * 콘솔, 문제점, 로그 등
 */

import { useState } from 'react'

type BottomTab = 'console' | 'problems' | 'output'

const tabs: { id: BottomTab; label: string }[] = [
  { id: 'console', label: '콘솔' },
  { id: 'problems', label: '문제점' },
  { id: 'output', label: '출력' },
]

export function BottomPanel() {
  const [activeTab, setActiveTab] = useState<BottomTab>('console')

  return (
    <div className="flex flex-col h-full">
      {/* 탭 헤더 */}
      <div className="flex items-center h-9 px-2 bg-ide-sidebar border-b border-ide-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-3 py-1 text-xs uppercase tracking-wider transition-colors
              ${activeTab === tab.id
                ? 'text-ide-text border-b-2 border-ide-accent'
                : 'text-ide-text-muted hover:text-ide-text'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {activeTab === 'console' && <ConsoleView />}
        {activeTab === 'problems' && <ProblemsView />}
        {activeTab === 'output' && <OutputView />}
      </div>
    </div>
  )
}

function ConsoleView() {
  return (
    <div className="space-y-1 text-ide-text-muted">
      <p>
        <span className="text-ide-accent">[INFO]</span> Yocto BSP Studio 시작됨
      </p>
      <p>
        <span className="text-ide-success">[READY]</span> 프로젝트를 열어주세요
      </p>
    </div>
  )
}

function ProblemsView() {
  return (
    <div className="text-ide-text-muted">
      <p>문제 없음</p>
    </div>
  )
}

function OutputView() {
  return (
    <div className="text-ide-text-muted">
      <p>출력 없음</p>
    </div>
  )
}
