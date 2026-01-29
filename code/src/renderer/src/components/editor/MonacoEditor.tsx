/**
 * Monaco Editor 통합 (v2 - LSP 지원)
 * 
 * 핵심 기능:
 * - Go to Definition (Ctrl+Click, F12)
 * - Hover Information
 * - Auto-complete (FTS5 기반)
 */

import { useRef, useEffect, useCallback } from 'react'
import Editor, { Monaco, OnMount, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { editor, languages, Position, CancellationToken } from 'monaco-editor'
import { OpenFile, useEditorStore } from '../../stores/editorStore'
import { useSshStore } from '../../stores/sshStore'

// Monaco를 로컬에서 로드 (CDN 대신)
loader.config({ monaco })

interface MonacoEditorProps {
  file: OpenFile
  onContentChange: (content: string) => void
  onSave: () => void
}

// BitBake 언어 정의
const defineBitBakeLanguage = (monaco: Monaco) => {
  // 이미 등록되어 있으면 스킵
  if (monaco.languages.getLanguages().some((lang: languages.ILanguageExtensionPoint) => lang.id === 'bitbake')) {
    return
  }

  monaco.languages.register({ id: 'bitbake' })
  
  monaco.languages.setMonarchTokensProvider('bitbake', {
    keywords: [
      'inherit', 'require', 'include', 'export', 'unset', 'python', 'fakeroot',
      'addtask', 'deltask', 'addhandler', 'EXPORT_FUNCTIONS'
    ],
    
    variables: [
      'PN', 'PV', 'PR', 'PF', 'P', 'BPN', 'BP', 'SUMMARY', 'DESCRIPTION',
      'HOMEPAGE', 'LICENSE', 'LIC_FILES_CHKSUM', 'SECTION', 'DEPENDS',
      'RDEPENDS', 'PROVIDES', 'RPROVIDES', 'RRECOMMENDS', 'RSUGGESTS',
      'RCONFLICTS', 'RREPLACES', 'SRC_URI', 'SRCREV', 'S', 'B', 'D',
      'WORKDIR', 'FILESEXTRAPATHS', 'FILESPATH', 'FILES', 'PACKAGES',
      'PACKAGE_ARCH', 'MACHINE', 'DISTRO', 'DISTRO_FEATURES',
      'MACHINE_FEATURES', 'IMAGE_FEATURES', 'IMAGE_INSTALL', 'IMAGE_FSTYPES',
      'PREFERRED_PROVIDER', 'PREFERRED_VERSION', 'BBCLASSEXTEND',
      'COMPATIBLE_MACHINE', 'COMPATIBLE_HOST'
    ],
    
    tasks: [
      'do_fetch', 'do_unpack', 'do_patch', 'do_configure', 'do_compile',
      'do_install', 'do_populate_sysroot', 'do_package', 'do_package_write',
      'do_build', 'do_clean', 'do_cleanall', 'do_cleansstate'
    ],
    
    tokenizer: {
      root: [
        // 주석
        [/#.*$/, 'comment'],
        
        // 문자열
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        
        // 변수 참조
        [/\$\{[^}]+\}/, 'variable.other'],
        
        // Python 함수
        [/python\s+\w+\s*\(\)/, 'keyword'],
        
        // 태스크
        [/\b(do_\w+)\b/, 'function'],
        
        // 할당 연산자
        [/(\?=|:=|\.=|\+=|=)/, 'operator'],
        [/_append|_prepend|_remove/, 'keyword.operator'],
        
        // 키워드
        [/\b(inherit|require|include|export|unset|python|fakeroot|addtask|deltask|addhandler|EXPORT_FUNCTIONS)\b/, 'keyword'],
        
        // 변수명 (대문자로 시작)
        [/\b[A-Z][A-Z0-9_]*\b/, 'variable'],
        
        // 숫자
        [/\b\d+\b/, 'number'],
        
        // 함수 호출
        [/\b(\w+)\s*\(/, 'function'],
      ],
    },
  })

  // 테마 설정
  monaco.editor.defineTheme('bsp-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'variable.other', foreground: '4EC9B0' },
      { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
      { token: 'keyword.operator', foreground: 'D4D4D4' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'operator', foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editor.lineHighlightBackground': '#2d2d2d',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#3a3d41',
    },
  })
}

// Device Tree 언어 정의
const defineDeviceTreeLanguage = (monaco: Monaco) => {
  if (monaco.languages.getLanguages().some((lang: languages.ILanguageExtensionPoint) => lang.id === 'dts')) {
    return
  }

  monaco.languages.register({ id: 'dts' })
  
  monaco.languages.setMonarchTokensProvider('dts', {
    tokenizer: {
      root: [
        // 주석
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        
        // 전처리기
        [/^#\s*\w+/, 'keyword.preprocessor'],
        [/<[^>]+\.h>/, 'string.include'],
        
        // 문자열
        [/"([^"\\]|\\.)*"/, 'string'],
        
        // 라벨
        [/&\w+/, 'variable.reference'],
        [/\w+:/, 'variable.label'],
        
        // 속성 키워드
        [/\b(compatible|reg|status|interrupts|interrupt-parent|interrupt-controller|#interrupt-cells|clocks|clock-names|clock-frequency|pinctrl-names|pinctrl-0|pinctrl-1|gpio-controller|#gpio-cells|dmas|dma-names)\b/, 'keyword.property'],
        
        // 노드 이름
        [/\b(\w+)@[0-9a-fA-F]+\b/, 'type.node'],
        
        // 16진수
        [/0x[0-9a-fA-F]+/, 'number.hex'],
        [/<[^>]*>/, 'number.array'],
        
        // 숫자
        [/\b\d+\b/, 'number'],
        
        // 불리언
        [/\b(okay|disabled|true|false)\b/, 'constant'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  })
}

// 언어 매핑
const getMonacoLanguage = (language: string): string => {
  const mapping: Record<string, string> = {
    'bitbake': 'bitbake',
    'dts': 'dts',
    'shell': 'shell',
    'python': 'python',
    'c': 'c',
    'cpp': 'cpp',
    'json': 'json',
    'yaml': 'yaml',
    'xml': 'xml',
    'ini': 'ini',
    'makefile': 'makefile',
    'markdown': 'markdown',
    'diff': 'diff',
    'plaintext': 'plaintext',
  }
  return mapping[language] || 'plaintext'
}

// LSP 제공자 등록 (한 번만)
let lspProvidersRegistered = false

const registerLspProviders = (monaco: Monaco) => {
  if (lspProvidersRegistered) return
  lspProvidersRegistered = true

  const languageIds = ['bitbake', 'dts', 'c', 'cpp', 'plaintext']

  for (const langId of languageIds) {
    // Hover Provider - 심볼 위에 마우스 올리면 정보 표시
    monaco.languages.registerHoverProvider(langId, {
      async provideHover(model: editor.ITextModel, position: Position) {
        const filePath = model.uri.path
        const content = model.getValue()
        const line = position.lineNumber - 1
        const character = position.column - 1

        try {
          const hover = await window.electronAPI.lsp.getHover(filePath, content, line, character)
          if (hover && hover.contents) {
            return {
              contents: [{ value: hover.contents.value }]
            }
          }
        } catch (err) {
          console.error('[Monaco] Hover error:', err)
        }
        return null
      }
    })

    // Completion Provider - 자동완성 (Ctrl+Space)
    monaco.languages.registerCompletionItemProvider(langId, {
      triggerCharacters: ['_', '.', '&', '<', '#', '"', '='],
      async provideCompletionItems(model: editor.ITextModel, position: Position) {
        const filePath = model.uri.path
        const content = model.getValue()
        const line = position.lineNumber - 1
        const character = position.column - 1

        try {
          const completions = await window.electronAPI.lsp.getCompletions(filePath, content, line, character)
          
          // 현재 단어의 범위 계산 (입력 중인 단어를 대체)
          const wordInfo = model.getWordUntilPosition(position)
          const lineText = model.getLineContent(position.lineNumber)
          
          // & 기호가 단어 앞에 있으면 포함
          let startColumn = wordInfo.startColumn
          if (startColumn > 1 && lineText[startColumn - 2] === '&') {
            startColumn--
          }
          
          return {
            suggestions: completions.map((item: any) => ({
              label: item.label,
              kind: item.kind as monaco.languages.CompletionItemKind,
              detail: item.detail,
              documentation: item.documentation ? { value: item.documentation } : undefined,
              insertText: item.insertText || item.label,
              insertTextRules: item.insertText?.includes('$') 
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet 
                : undefined,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: startColumn,
                endLineNumber: position.lineNumber,
                endColumn: wordInfo.endColumn,
              },
              sortText: item.sortText
            }))
          }
        } catch (err) {
          console.error('[Monaco] Completion error:', err)
        }
        return { suggestions: [] }
      }
    })

    // Definition Provider - 정의로 이동 (Ctrl+Click, F12)
    monaco.languages.registerDefinitionProvider(langId, {
      async provideDefinition(model: editor.ITextModel, position: Position) {
        const filePath = model.uri.path
        const content = model.getValue()
        const line = position.lineNumber - 1
        const character = position.column - 1

        try {
          const definition = await window.electronAPI.lsp.goToDefinition(filePath, content, line, character)
          
          if (definition) {
            return {
              uri: monaco.Uri.file(definition.uri),
              range: {
                startLineNumber: definition.range.start.line + 1,
                startColumn: definition.range.start.character + 1,
                endLineNumber: definition.range.end.line + 1,
                endColumn: definition.range.end.character + 1,
              }
            }
          }
        } catch (err) {
          console.error('[Monaco] Definition error:', err)
        }
        return null
      }
    })

    // Reference Provider - 모든 참조 찾기 (Shift+F12) ★ A-02 핵심
    monaco.languages.registerReferenceProvider(langId, {
      async provideReferences(model: editor.ITextModel, position: Position, context: languages.ReferenceContext) {
        const filePath = model.uri.path
        const content = model.getValue()
        const line = position.lineNumber - 1
        const character = position.column - 1

        try {
          console.log(`[Monaco] Finding references at ${filePath}:${line}:${character}`)
          const references = await window.electronAPI.lsp.findReferences(filePath, content, line, character)
          
          if (references && references.length > 0) {
            console.log(`[Monaco] Found ${references.length} references`)
            return references.map(ref => ({
              uri: monaco.Uri.file(ref.uri),
              range: {
                startLineNumber: ref.range.start.line + 1,
                startColumn: ref.range.start.character + 1,
                endLineNumber: ref.range.end.line + 1,
                endColumn: ref.range.end.character + 1,
              }
            }))
          }
        } catch (err) {
          console.error('[Monaco] References error:', err)
        }
        return []
      }
    })
  }
}

export function MonacoEditor({ file, onContentChange, onSave }: MonacoEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const { openFile, setGotoLine, gotoLine, activeFileId } = useEditorStore()
  const { activeProfile } = useSshStore()

  // 정의로 이동 (파일 열기 + 라인 이동) - A-01 개선
  const goToDefinition = useCallback(async () => {
    if (!editorRef.current || !monacoRef.current || !activeProfile) return

    const position = editorRef.current.getPosition()
    if (!position) return

    const model = editorRef.current.getModel()
    if (!model) return

    const content = model.getValue()
    const line = position.lineNumber - 1
    const character = position.column - 1

    try {
      const definition = await window.electronAPI.lsp.goToDefinition(file.path, content, line, character)
      
      if (definition) {
        console.log(`[Monaco] Go to definition: ${definition.uri}:${definition.range.start.line + 1}`)
        
        // 같은 파일이면 바로 이동
        if (definition.uri === file.path) {
          const targetLine = definition.range.start.line + 1
          editorRef.current?.revealLineInCenter(targetLine)
          editorRef.current?.setPosition({ lineNumber: targetLine, column: 1 })
          editorRef.current?.focus()
          return
        }
        
        // 다른 파일 열기
        const fileContent = await window.electronAPI.ssh.readFile(activeProfile.id, definition.uri)
        const name = definition.uri.split('/').pop() || definition.uri
        
        // 파일 열기 + 이동할 라인 설정
        openFile({
          path: definition.uri,
          name,
          content: fileContent,
          isDirty: false,
          isLoading: false,
          serverId: activeProfile.id,
        })
        
        // 파일 열린 후 이동할 라인 저장 (useEffect에서 처리)
        setGotoLine(definition.uri, definition.range.start.line + 1)
      }
    } catch (err) {
      console.error('[Monaco] Go to definition error:', err)
    }
  }, [file.path, activeProfile, openFile, setGotoLine])

  // 모든 참조 찾기 (Shift+F12) - A-02 개선
  const findAllReferences = useCallback(async () => {
    if (!editorRef.current || !monacoRef.current) return

    const position = editorRef.current.getPosition()
    if (!position) return

    // Monaco의 내장 참조 찾기 명령 실행
    editorRef.current.trigger('keyboard', 'editor.action.referenceSearch.trigger', null)
  }, [])

  // 파일 열린 후 특정 라인으로 이동 - A-04 개선
  useEffect(() => {
    if (editorRef.current && gotoLine && file.path) {
      const targetLine = gotoLine[file.path]
      if (targetLine && targetLine > 0) {
        // 약간의 지연 후 이동 (에디터 렌더링 완료 대기)
        setTimeout(() => {
          editorRef.current?.revealLineInCenter(targetLine)
          editorRef.current?.setPosition({ lineNumber: targetLine, column: 1 })
          editorRef.current?.focus()
          
          // 라인 하이라이트 (3초 후 해제)
          const decorations = editorRef.current?.deltaDecorations([], [{
            range: new monacoRef.current!.Range(targetLine, 1, targetLine, 1),
            options: {
              isWholeLine: true,
              className: 'goto-line-highlight',
              glyphMarginClassName: 'goto-line-glyph'
            }
          }])
          
          setTimeout(() => {
            if (decorations && editorRef.current) {
              editorRef.current.deltaDecorations(decorations, [])
            }
          }, 3000)
          
          // 이동 완료 후 초기화
          setGotoLine(file.path, 0)
        }, 100)
      }
    }
  }, [file.path, gotoLine, setGotoLine])

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // 커스텀 언어 등록
    defineBitBakeLanguage(monaco)
    defineDeviceTreeLanguage(monaco)
    
    // LSP 제공자 등록
    registerLspProviders(monaco)

    // 키보드 단축키
    // Ctrl+S: 저장
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave()
    })

    // F12: Go to Definition
    editor.addCommand(monaco.KeyCode.F12, () => {
      goToDefinition()
    })

    // Shift+F12: Find All References
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F12, () => {
      findAllReferences()
    })

    // Ctrl+Click: Go to Definition
    editor.onMouseDown((e) => {
      if (e.event.ctrlKey && e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT) {
        goToDefinition()
      }
    })

    // 라인 하이라이트 스타일 추가
    const style = document.createElement('style')
    style.textContent = `
      .goto-line-highlight {
        background-color: rgba(255, 213, 0, 0.3) !important;
        border-left: 3px solid #ffd500 !important;
      }
      .goto-line-glyph {
        background-color: #ffd500;
      }
    `
    document.head.appendChild(style)

    // 커스텀 컨텍스트 메뉴 액션 추가
    // "Find All References" 액션 (더 친숙한 이름)
    editor.addAction({
      id: 'find-all-references',
      label: 'Find All References',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: () => {
        editor.trigger('keyboard', 'editor.action.referenceSearch.trigger', null)
      }
    })

    // "Go to Definition" 이름 변경 (더 명확하게)
    editor.addAction({
      id: 'go-to-definition-custom',
      label: 'Go to Definition (정의로 이동)',
      keybindings: [monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.0,
      run: () => {
        goToDefinition()
      }
    })

    // "Peek References" 액션
    editor.addAction({
      id: 'peek-references',
      label: 'Peek References (참조 미리보기)',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.6,
      run: () => {
        editor.trigger('keyboard', 'editor.action.peekReferences', null)
      }
    })

    // 포커스
    editor.focus()
  }

  // 파일 변경 시 에디터 업데이트
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        const language = getMonacoLanguage(file.language)
        monacoRef.current.editor.setModelLanguage(model, language)
      }
    }
  }, [file.language])

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        language={getMonacoLanguage(file.language)}
        value={file.content}
        theme="bsp-dark"
        onChange={(value) => onContentChange(value || '')}
        onMount={handleEditorMount}
        options={{
          fontSize: 13,
          fontFamily: "'Consolas', 'Courier New', monospace",
          lineNumbers: 'on',
          minimap: { enabled: true, scale: 1 },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
          mouseWheelZoom: true,
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'always',
          guides: {
            indentation: true,
            bracketPairs: true,
          },
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          wordBasedSuggestions: 'currentDocument',
          parameterHints: { enabled: true },
          formatOnPaste: false,
          formatOnType: false,
          // LSP 관련
          gotoLocation: {
            multiple: 'goto',
            multipleDefinitions: 'goto',
          },
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-ide-bg">
            <div className="text-ide-text-muted">에디터 로딩 중...</div>
          </div>
        }
      />
    </div>
  )
}
