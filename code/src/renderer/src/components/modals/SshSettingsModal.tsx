/**
 * SSH 설정 모달
 */

import { useState, useEffect } from 'react'
import { useSshStore } from '../../stores/sshStore'
import type { ServerProfile } from '@shared/types'

interface SshSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const generateId = () => `server_${Date.now()}`

const defaultProfile: Omit<ServerProfile, 'id'> = {
  name: '',
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: '',
  privateKeyPath: '',
  passphrase: '',
  workspacePath: '/home',
}

export function SshSettingsModal({ isOpen, onClose }: SshSettingsModalProps) {
  const { profiles, addProfile, updateProfile, removeProfile, testConnection, connect, isConnecting } = useSshStore()
  
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Omit<ServerProfile, 'id'>>(defaultProfile)
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // 선택된 프로필이 변경되면 폼 데이터 업데이트
  useEffect(() => {
    if (selectedProfileId) {
      const profile = profiles.find((p) => p.id === selectedProfileId)
      if (profile) {
        setFormData({
          name: profile.name,
          host: profile.host,
          port: profile.port,
          username: profile.username,
          authType: profile.authType || 'password',
          password: profile.password || '',
          privateKeyPath: profile.privateKeyPath || '',
          passphrase: profile.passphrase || '',
          workspacePath: profile.workspacePath,
        })
      }
    } else {
      setFormData(defaultProfile)
    }
    setTestResult(null)
  }, [selectedProfileId, profiles])

  if (!isOpen) return null

  const handleInputChange = (field: keyof typeof formData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setTestResult(null)
  }

  const handleSelectKeyFile = async () => {
    const path = await window.electronAPI.ssh.selectKeyFile()
    if (path) {
      handleInputChange('privateKeyPath', path)
    }
  }

  const handleSave = () => {
    if (!formData.name || !formData.host || !formData.username) {
      setTestResult({ success: false, message: '이름, 호스트, 사용자명은 필수입니다.' })
      return
    }

    // 인증 방식 검증
    if (formData.authType === 'password' && !formData.password) {
      setTestResult({ success: false, message: '비밀번호를 입력하세요.' })
      return
    }
    if (formData.authType === 'key' && !formData.privateKeyPath) {
      setTestResult({ success: false, message: 'SSH 키 파일을 선택하세요.' })
      return
    }

    if (selectedProfileId) {
      // 수정
      updateProfile({ id: selectedProfileId, ...formData })
    } else {
      // 새로 추가
      const newProfile: ServerProfile = { id: generateId(), ...formData }
      addProfile(newProfile)
      setSelectedProfileId(newProfile.id)
    }
    setTestResult({ success: true, message: '저장되었습니다.' })
  }

  const handleDelete = () => {
    if (selectedProfileId && confirm('이 서버 프로필을 삭제하시겠습니까?')) {
      removeProfile(selectedProfileId)
      setSelectedProfileId(null)
    }
  }

  const handleTest = async () => {
    if (!formData.host || !formData.username) {
      setTestResult({ success: false, message: '호스트와 사용자명을 입력하세요.' })
      return
    }

    const profile: ServerProfile = {
      id: selectedProfileId || generateId(),
      ...formData,
    }

    const result = await testConnection(profile)
    setTestResult({
      success: result.success,
      message: result.success ? `연결 성공!\n${result.info}` : `연결 실패: ${result.error}`,
    })
  }

  const handleConnect = async () => {
    if (!selectedProfileId) {
      setTestResult({ success: false, message: '먼저 프로필을 저장하세요.' })
      return
    }

    const profile = profiles.find((p) => p.id === selectedProfileId)
    if (!profile) return

    const success = await connect(profile)
    if (success) {
      onClose()
    }
  }

  const handleNewProfile = () => {
    setSelectedProfileId(null)
    setFormData(defaultProfile)
    setTestResult(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[700px] max-h-[80vh] bg-ide-sidebar rounded-lg shadow-2xl border border-ide-border overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 bg-ide-bg border-b border-ide-border">
          <h2 className="text-lg font-semibold text-ide-text">🌐 서버 연결 설정</h2>
          <button onClick={onClose} className="text-ide-text-muted hover:text-ide-text">
            ✕
          </button>
        </div>

        <div className="flex h-[550px]">
          {/* 왼쪽: 프로필 목록 */}
          <div className="w-48 border-r border-ide-border bg-ide-bg">
            <div className="p-2">
              <button
                onClick={handleNewProfile}
                className="w-full px-3 py-2 text-sm bg-ide-accent text-white rounded hover:bg-ide-accent/80 transition-colors"
              >
                + 새 서버
              </button>
            </div>
            <div className="overflow-auto" style={{ height: 'calc(100% - 50px)' }}>
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => setSelectedProfileId(profile.id)}
                  className={`
                    w-full px-3 py-2 text-left text-sm transition-colors
                    ${selectedProfileId === profile.id
                      ? 'bg-ide-active text-white'
                      : 'text-ide-text hover:bg-ide-hover'
                    }
                  `}
                >
                  <div className="font-medium truncate">{profile.name}</div>
                  <div className="text-xs opacity-70 truncate">{profile.host}</div>
                </button>
              ))}
              {profiles.length === 0 && (
                <p className="px-3 py-4 text-xs text-ide-text-muted text-center">
                  서버 프로필이 없습니다
                </p>
              )}
            </div>
          </div>

          {/* 오른쪽: 설정 폼 */}
          <div className="flex-1 p-4 overflow-auto">
            <div className="space-y-4">
              {/* 프로필 이름 */}
              <div>
                <label className="block text-xs font-medium text-ide-text-muted mb-1">
                  프로필 이름
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="빌드 서버"
                  className="w-full px-3 py-2 bg-ide-bg border border-ide-border rounded text-ide-text text-sm focus:border-ide-accent outline-none"
                />
              </div>

              {/* 호스트 & 포트 */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-ide-text-muted mb-1">
                    호스트 (IP 또는 도메인)
                  </label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => handleInputChange('host', e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2 bg-ide-bg border border-ide-border rounded text-ide-text text-sm focus:border-ide-accent outline-none"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-ide-text-muted mb-1">
                    포트
                  </label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 22)}
                    className="w-full px-3 py-2 bg-ide-bg border border-ide-border rounded text-ide-text text-sm focus:border-ide-accent outline-none"
                  />
                </div>
              </div>

              {/* 사용자명 */}
              <div>
                <label className="block text-xs font-medium text-ide-text-muted mb-1">
                  사용자명
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="ubuntu"
                  className="w-full px-3 py-2 bg-ide-bg border border-ide-border rounded text-ide-text text-sm focus:border-ide-accent outline-none"
                />
              </div>

              {/* 인증 방식 선택 */}
              <div>
                <label className="block text-xs font-medium text-ide-text-muted mb-2">
                  인증 방식
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="authType"
                      value="password"
                      checked={formData.authType === 'password'}
                      onChange={() => handleInputChange('authType', 'password')}
                      className="accent-ide-accent"
                    />
                    <span className="text-sm text-ide-text">비밀번호</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="authType"
                      value="key"
                      checked={formData.authType === 'key'}
                      onChange={() => handleInputChange('authType', 'key')}
                      className="accent-ide-accent"
                    />
                    <span className="text-sm text-ide-text">SSH 키</span>
                  </label>
                </div>
              </div>

              {/* 비밀번호 인증 */}
              {formData.authType === 'password' && (
                <div>
                  <label className="block text-xs font-medium text-ide-text-muted mb-1">
                    비밀번호
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      placeholder="••••••••"
                      className="flex-1 px-3 py-2 bg-ide-bg border border-ide-border rounded text-ide-text text-sm focus:border-ide-accent outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="px-3 py-2 bg-ide-hover border border-ide-border rounded text-sm text-ide-text hover:bg-ide-border transition-colors"
                    >
                      {showPassword ? '숨김' : '표시'}
                    </button>
                  </div>
                </div>
              )}

              {/* SSH 키 인증 */}
              {formData.authType === 'key' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-ide-text-muted mb-1">
                      SSH 개인 키 파일
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.privateKeyPath}
                        onChange={(e) => handleInputChange('privateKeyPath', e.target.value)}
                        placeholder="C:\Users\...\.ssh\id_rsa"
                        className="flex-1 px-3 py-2 bg-ide-bg border border-ide-border rounded text-ide-text text-sm focus:border-ide-accent outline-none"
                      />
                      <button
                        onClick={handleSelectKeyFile}
                        className="px-3 py-2 bg-ide-hover border border-ide-border rounded text-sm text-ide-text hover:bg-ide-border transition-colors"
                      >
                        찾아보기
                      </button>
                    </div>
                    <p className="text-xs text-ide-text-muted mt-1">
                      OpenSSH 형식 (id_rsa, id_ed25519 등)
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ide-text-muted mb-1">
                      키 암호 (선택)
                    </label>
                    <input
                      type="password"
                      value={formData.passphrase}
                      onChange={(e) => handleInputChange('passphrase', e.target.value)}
                      placeholder="키 파일에 암호가 있는 경우"
                      className="w-full px-3 py-2 bg-ide-bg border border-ide-border rounded text-ide-text text-sm focus:border-ide-accent outline-none"
                    />
                  </div>
                </>
              )}

              {/* 워크스페이스 경로 */}
              <div>
                <label className="block text-xs font-medium text-ide-text-muted mb-1">
                  서버 워크스페이스 경로
                </label>
                <input
                  type="text"
                  value={formData.workspacePath}
                  onChange={(e) => handleInputChange('workspacePath', e.target.value)}
                  placeholder="/home/user/yocto"
                  className="w-full px-3 py-2 bg-ide-bg border border-ide-border rounded text-ide-text text-sm focus:border-ide-accent outline-none"
                />
              </div>

              {/* 테스트 결과 */}
              {testResult && (
                <div
                  className={`p-3 rounded text-sm whitespace-pre-wrap ${
                    testResult.success
                      ? 'bg-ide-success/20 text-ide-success'
                      : 'bg-ide-error/20 text-ide-error'
                  }`}
                >
                  {testResult.message}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 푸터 버튼 */}
        <div className="flex items-center justify-between px-4 py-3 bg-ide-bg border-t border-ide-border">
          <div>
            {selectedProfileId && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm text-ide-error hover:bg-ide-error/20 rounded transition-colors"
              >
                삭제
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={isConnecting}
              className="px-4 py-2 text-sm bg-ide-hover border border-ide-border rounded text-ide-text hover:bg-ide-border transition-colors disabled:opacity-50"
            >
              {isConnecting ? '테스트 중...' : '연결 테스트'}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-ide-hover border border-ide-border rounded text-ide-text hover:bg-ide-border transition-colors"
            >
              저장
            </button>
            <button
              onClick={handleConnect}
              disabled={isConnecting || !selectedProfileId}
              className="px-4 py-2 text-sm bg-ide-accent text-white rounded hover:bg-ide-accent/80 transition-colors disabled:opacity-50"
            >
              {isConnecting ? '연결 중...' : '연결'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
