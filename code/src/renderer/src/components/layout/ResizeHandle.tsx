/**
 * 리사이즈 핸들 컴포넌트
 * 드래그로 패널 크기 조절
 */

import { useCallback, useEffect, useState, useRef } from 'react'

type Direction = 'horizontal' | 'vertical'

interface ResizeHandleProps {
  direction: Direction
  onResize: (delta: number) => void
  onResizeEnd?: () => void
  className?: string
}

export function ResizeHandle({ direction, onResize, onResizeEnd, className = '' }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startPosRef = useRef<number>(0)
  const handleRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY
  }, [direction])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = currentPos - startPosRef.current
      startPosRef.current = currentPos
      onResize(delta)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      onResizeEnd?.()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    // 드래그 중 커서 스타일 고정
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, direction, onResize, onResizeEnd])

  const baseClasses = direction === 'horizontal'
    ? 'w-1 cursor-col-resize hover:bg-ide-accent/50'
    : 'h-1 cursor-row-resize hover:bg-ide-accent/50'

  const activeClasses = isDragging ? 'bg-ide-accent' : 'bg-transparent'

  return (
    <div
      ref={handleRef}
      onMouseDown={handleMouseDown}
      className={`
        ${baseClasses}
        ${activeClasses}
        ${className}
        flex-shrink-0
        transition-colors duration-150
        group
        relative
      `}
    >
      {/* 드래그 영역 확장 (클릭하기 쉽게) */}
      <div 
        className={`
          absolute 
          ${direction === 'horizontal' 
            ? 'inset-y-0 -left-1 -right-1 w-3' 
            : 'inset-x-0 -top-1 -bottom-1 h-3'
          }
        `}
      />
      
      {/* 호버 시 인디케이터 */}
      <div 
        className={`
          absolute
          ${direction === 'horizontal'
            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full'
            : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-0.5 w-8 rounded-full'
          }
          bg-ide-accent/0 group-hover:bg-ide-accent/70
          transition-colors duration-150
          ${isDragging ? 'bg-ide-accent' : ''}
        `}
      />
    </div>
  )
}
