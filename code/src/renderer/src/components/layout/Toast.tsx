/**
 * Toast 알림 컴포넌트
 * 에러, 성공, 경고 메시지를 사용자에게 표시
 */

import { useEffect, useState } from 'react'
import { create } from 'zustand'

// Toast 타입
type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

// Toast 스토어
interface ToastStore {
  toasts: ToastItem[]
  addToast: (toast: Omit<ToastItem, 'id'>) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }]
    }))
    
    // 자동 제거
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter(t => t.id !== id)
        }))
      }, duration)
    }
  },
  
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter(t => t.id !== id)
    }))
  }
}))

// 편의 함수
export const toast = {
  success: (title: string, message?: string) => 
    useToastStore.getState().addToast({ type: 'success', title, message }),
  error: (title: string, message?: string) => 
    useToastStore.getState().addToast({ type: 'error', title, message, duration: 8000 }),
  warning: (title: string, message?: string) => 
    useToastStore.getState().addToast({ type: 'warning', title, message }),
  info: (title: string, message?: string) => 
    useToastStore.getState().addToast({ type: 'info', title, message }),
}

// Toast 컨테이너
export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem 
          key={toast.id} 
          toast={toast} 
          onClose={() => removeToast(toast.id)} 
        />
      ))}
    </div>
  )
}

// 개별 Toast
function ToastItem({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const [isExiting, setIsExiting] = useState(false)

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(onClose, 200)
  }

  const config = {
    success: {
      icon: '✅',
      bgColor: 'bg-green-500/10 border-green-500/50',
      textColor: 'text-green-400',
    },
    error: {
      icon: '❌',
      bgColor: 'bg-red-500/10 border-red-500/50',
      textColor: 'text-red-400',
    },
    warning: {
      icon: '⚠️',
      bgColor: 'bg-yellow-500/10 border-yellow-500/50',
      textColor: 'text-yellow-400',
    },
    info: {
      icon: 'ℹ️',
      bgColor: 'bg-blue-500/10 border-blue-500/50',
      textColor: 'text-blue-400',
    },
  }

  const { icon, bgColor, textColor } = config[toast.type]

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-lg border backdrop-blur-sm
        ${bgColor}
        ${isExiting ? 'animate-slide-out' : 'animate-slide-in'}
        shadow-lg
      `}
      style={{
        animation: isExiting 
          ? 'slideOut 0.2s ease-out forwards' 
          : 'slideIn 0.3s ease-out forwards'
      }}
    >
      <span className="text-xl flex-shrink-0">{icon}</span>
      
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${textColor}`}>{toast.title}</p>
        {toast.message && (
          <p className="text-sm text-ide-text-muted mt-1 break-words">{toast.message}</p>
        )}
      </div>
      
      <button
        onClick={handleClose}
        className="text-ide-text-muted hover:text-ide-text transition-colors flex-shrink-0"
      >
        ✕
      </button>
    </div>
  )
}

// CSS 애니메이션을 위한 스타일 (globals.css에 추가 필요)
const toastStyles = `
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOut {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}
`
