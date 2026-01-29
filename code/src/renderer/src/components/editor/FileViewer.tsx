/**
 * 파일 뷰어/에디터
 * 탭 시스템 + 구문 하이라이트 + 라인 넘버
 */

import { useEffect, useRef, useState } from 'react'
import { useEditorStore, OpenFile } from '../../stores/editorStore'
import { useSshStore } from '../../stores/sshStore'

export function FileViewer() {
  const { openFiles, activeFileId, setActiveFile, closeFile, updateFileContent, markFileSaved } = useEditorStore()
  const { activeProfile } = useSshStore()
  
  const activeFile = openFiles.find(f => f.id === activeFileId)

  // 파일이 없으면 빈 상태
  if (openFiles.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-ide-text-muted">
        <div className="text-6xl mb-4">📂</div>
        <p className="text-lg">파일을 선택하세요</p>
        <p className="text-sm mt-2">왼쪽 탐색기에서 파일을 클릭하면 여기에 표시됩니다</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 탭 바 */}
      <TabBar 
        files={openFiles}
        activeFileId={activeFileId}
        onSelectFile={setActiveFile}
        onCloseFile={closeFile}
      />

      {/* 에디터 영역 */}
      {activeFile && (
        <CodeEditor
          file={activeFile}
          onContentChange={(content) => updateFileContent(activeFile.id, content)}
          onSave={async () => {
            if (!activeProfile || !activeFile.isDirty) return
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
          }}
        />
      )}
    </div>
  )
}

// 탭 바 컴포넌트
interface TabBarProps {
  files: OpenFile[]
  activeFileId: string | null
  onSelectFile: (fileId: string) => void
  onCloseFile: (fileId: string) => void
}

function TabBar({ files, activeFileId, onSelectFile, onCloseFile }: TabBarProps) {
  return (
    <div className="flex items-center bg-ide-sidebar border-b border-ide-border overflow-x-auto">
      {files.map((file) => (
        <Tab
          key={file.id}
          file={file}
          isActive={file.id === activeFileId}
          onSelect={() => onSelectFile(file.id)}
          onClose={(e) => {
            e.stopPropagation()
            onCloseFile(file.id)
          }}
        />
      ))}
    </div>
  )
}

// 탭 컴포넌트
interface TabProps {
  file: OpenFile
  isActive: boolean
  onSelect: () => void
  onClose: (e: React.MouseEvent) => void
}

function Tab({ file, isActive, onSelect, onClose }: TabProps) {
  const getFileIcon = () => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const iconMap: Record<string, string> = {
      'bb': '📦', 'bbappend': '📎', 'conf': '⚙️',
      'dts': '🌳', 'dtsi': '🌿', 'sh': '💻', 'py': '🐍',
      'c': '🔵', 'h': '🔹', 'config': '🔧', 'patch': '🩹',
    }
    return iconMap[ext] || '📄'
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
        <span className="w-2 h-2 rounded-full bg-ide-accent" title="수정됨" />
      )}
      <button
        onClick={onClose}
        className="w-4 h-4 flex items-center justify-center rounded hover:bg-ide-hover text-ide-text-muted hover:text-ide-text"
      >
        ✕
      </button>
    </div>
  )
}

// 코드 에디터 컴포넌트
interface CodeEditorProps {
  file: OpenFile
  onContentChange: (content: string) => void
  onSave: () => void
}

function CodeEditor({ file, onContentChange, onSave }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [lineCount, setLineCount] = useState(1)

  // 라인 수 계산
  useEffect(() => {
    const lines = file.content.split('\n').length
    setLineCount(lines)
  }, [file.content])

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S 저장
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        onSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSave])

  // 스크롤 동기화
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const lineNumbers = document.getElementById(`line-numbers-${file.id}`)
    if (lineNumbers) {
      lineNumbers.scrollTop = e.currentTarget.scrollTop
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* 파일 정보 바 */}
      <div className="flex items-center justify-between px-3 py-1 bg-ide-bg border-b border-ide-border text-xs">
        <div className="flex items-center gap-3">
          <span className="text-ide-text-muted font-mono">{file.path}</span>
          <span className="text-ide-accent">{file.language}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-ide-text-muted">{lineCount} lines</span>
          {file.isDirty && (
            <button
              onClick={onSave}
              className="px-2 py-0.5 bg-ide-accent text-white rounded text-xs hover:bg-ide-accent/80"
            >
              💾 저장 (Ctrl+S)
            </button>
          )}
        </div>
      </div>

      {/* 에디터 영역 */}
      <div className="flex flex-1 overflow-hidden bg-[#1a1a1a]">
        {/* 라인 넘버 */}
        <div
          id={`line-numbers-${file.id}`}
          className="w-14 bg-ide-bg border-r border-ide-border overflow-hidden select-none"
          style={{ fontFamily: 'Consolas, Monaco, monospace' }}
        >
          <div className="py-2 px-2 text-right">
            {Array.from({ length: lineCount }, (_, i) => (
              <div
                key={i}
                className="text-xs text-ide-text-muted leading-5 h-5"
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* 코드 영역 */}
        <div className="flex-1 overflow-auto relative">
          {/* 구문 하이라이트된 표시 (읽기 전용) */}
          <SyntaxHighlight content={file.content} language={file.language} />
          
          {/* 실제 입력 영역 (투명) */}
          <textarea
            ref={textareaRef}
            value={file.content}
            onChange={(e) => onContentChange(e.target.value)}
            onScroll={handleScroll}
            className="absolute inset-0 w-full h-full p-2 bg-transparent text-transparent caret-white resize-none outline-none"
            style={{
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: '13px',
              lineHeight: '20px',
              tabSize: 4,
            }}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  )
}

// 구문 하이라이트 컴포넌트
interface SyntaxHighlightProps {
  content: string
  language: string
}

function SyntaxHighlight({ content, language }: SyntaxHighlightProps) {
  const lines = content.split('\n')

  return (
    <pre
      className="p-2 m-0 pointer-events-none"
      style={{
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '13px',
        lineHeight: '20px',
        tabSize: 4,
      }}
    >
      {lines.map((line, index) => (
        <div key={index} className="h-5">
          <HighlightedLine line={line} language={language} />
        </div>
      ))}
    </pre>
  )
}

// 줄 단위 하이라이트
function HighlightedLine({ line, language }: { line: string; language: string }) {
  // 간단한 구문 하이라이트 (정규식 기반)
  const highlightLine = (text: string): JSX.Element[] => {
    const tokens: JSX.Element[] = []
    let remaining = text
    let key = 0

    // 패턴 정의
    const patterns: { regex: RegExp; className: string }[] = [
      // 주석
      { regex: /^(#.*)$/, className: 'text-gray-500 italic' },
      { regex: /^(\/\/.*)$/, className: 'text-gray-500 italic' },
      
      // 문자열
      { regex: /("(?:[^"\\]|\\.)*")/, className: 'text-green-400' },
      { regex: /('(?:[^'\\]|\\.)*')/, className: 'text-green-400' },
      
      // BitBake 변수
      { regex: /(\$\{[^}]+\})/, className: 'text-cyan-400' },
      
      // 키워드 (BitBake)
      { regex: /\b(inherit|require|include|DEPENDS|RDEPENDS|SRC_URI|LICENSE|SUMMARY|DESCRIPTION|HOMEPAGE|SECTION|PV|PR|PN|S|D|B|WORKDIR|FILESEXTRAPATHS|FILESPATH)\b/, className: 'text-purple-400 font-semibold' },
      
      // 함수/태스크 (BitBake)
      { regex: /\b(do_compile|do_install|do_configure|do_fetch|do_unpack|do_patch|do_populate_sysroot|do_package)\b/, className: 'text-yellow-400' },
      
      // Device Tree 키워드
      { regex: /\b(compatible|reg|status|interrupts|clocks|clock-names|pinctrl-names|pinctrl-0)\b/, className: 'text-orange-400' },
      
      // 셸 키워드
      { regex: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|export|source)\b/, className: 'text-purple-400' },
      
      // 숫자
      { regex: /\b(0x[0-9a-fA-F]+|\d+)\b/, className: 'text-blue-400' },
      
      // 연산자/할당
      { regex: /(=|:=|\?=|\.=|\+=|_append|_prepend|_remove)/, className: 'text-red-400' },
    ]

    // 간단한 토큰화
    while (remaining.length > 0) {
      let matched = false

      for (const pattern of patterns) {
        const match = remaining.match(pattern.regex)
        if (match && match.index === 0) {
          tokens.push(
            <span key={key++} className={pattern.className}>
              {match[0]}
            </span>
          )
          remaining = remaining.slice(match[0].length)
          matched = true
          break
        }
      }

      if (!matched) {
        // 매치 안 된 첫 글자
        tokens.push(
          <span key={key++} className="text-ide-text">
            {remaining[0]}
          </span>
        )
        remaining = remaining.slice(1)
      }
    }

    return tokens
  }

  // 빈 줄 처리
  if (!line) {
    return <span>&nbsp;</span>
  }

  // 주석 줄 전체 처리
  const trimmed = line.trim()
  if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return <span className="text-gray-500 italic">{line}</span>
  }

  return <>{highlightLine(line)}</>
}
