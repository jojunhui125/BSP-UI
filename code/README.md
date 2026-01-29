<<<<<<< HEAD
# Yocto BSP Studio

Yocto 기반 BSP 개발을 위한 통합 개발 환경 (IDE)

## 📋 개요

Yocto BSP Studio는 Yocto 기반 Linux BSP 개발을 초보자도 수행 가능한 수준으로 단순화·표준화하는 Electron 기반 데스크탑 애플리케이션입니다.

## 🚀 시작하기

### 사전 요구사항

- Node.js 20.x 이상
- npm 또는 yarn

### 설치

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run dev

# 프로덕션 빌드
npm run build
```

## 📁 프로젝트 구조

```
code/
├── src/
│   ├── main/           # Electron Main Process
│   │   ├── index.ts    # 메인 진입점
│   │   └── ipc/        # IPC 핸들러
│   │       ├── file-handlers.ts
│   │       ├── window-handlers.ts
│   │       └── project-handlers.ts
│   │
│   ├── preload/        # Preload Scripts
│   │   └── index.ts    # API 브리지
│   │
│   ├── renderer/       # Renderer Process (React)
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── layout/     # 레이아웃 컴포넌트
│   │       │   ├── panels/     # 패널 컴포넌트
│   │       │   └── views/      # 뷰 컴포넌트
│   │       ├── stores/         # Zustand 스토어
│   │       └── styles/         # CSS 스타일
│   │
│   └── shared/         # 공유 타입/유틸
│       ├── types/
│       └── ipc-channels.ts
│
├── package.json
├── electron.vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## 🛠️ 기술 스택

- **Electron**: 데스크탑 앱 프레임워크
- **React 18**: UI 라이브러리
- **TypeScript**: 타입 안전성
- **Tailwind CSS**: 스타일링
- **Zustand**: 상태 관리
- **electron-vite**: 빌드 도구

## 📚 주요 기능

### Phase 0 (MVP)
- [x] Electron 프로젝트 초기화
- [x] 기본 3패널 UI 레이아웃
- [x] IPC 통신 기반
- [ ] SSH 연결 관리
- [ ] 파일 동기화 (rsync)
- [ ] 원격 빌드
- [ ] 아티팩트 다운로드

## 📄 라이선스

MIT License
=======
# bsp-ui
>>>>>>> 7a0e92b2e3e3d372d3a13d90b6a6217d1349cb24
