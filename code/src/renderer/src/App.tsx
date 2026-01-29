/**
 * 메인 App 컴포넌트
 */

import { TitleBar } from './components/layout/TitleBar'
import { MainLayout } from './components/layout/MainLayout'
import { ToastContainer } from './components/layout/Toast'

export default function App() {
  return (
    <div className="flex flex-col h-full bg-ide-bg">
      {/* 커스텀 타이틀바 */}
      <TitleBar />
      
      {/* 메인 레이아웃 (3패널) */}
      <MainLayout />
      
      {/* Toast 알림 컨테이너 */}
      <ToastContainer />
    </div>
  )
}
