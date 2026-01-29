# Yocto BSP Studio (bsp-ui)

Yocto/BitBake 기반 BSP 개발을 위한 Electron 데스크톱 IDE입니다. 로컬 앱에서 원격 빌드 서버와
연동해 프로젝트/파일/설정/빌드 흐름을 GUI로 다루는 것을 목표로 합니다.

## 목표

- Yocto BSP 개발의 CLI 작업을 프로젝트 중심 GUI 워크플로로 단순화
- SSH 기반 원격 빌드 서버 연동, 로그/아티팩트 관리
- 개발 초보자도 이해 가능한 정보 구조와 가이드 제공

## 주요 구성(현재 포함된 UI/모듈 기준)

- 프로젝트/워크스페이스 관리
- SSH 연결 및 서버 대시보드
- 파일 탐색기 + Monaco 편집기
- 인덱싱/검색 인프라
- Yocto 특화 뷰어 UI (BitBake 변수, Device Tree, Include Chain 등)

## 진행 현황 (ROADMAP 기준: 2026-01-29 업데이트)

### Phase A: IDE 핵심 기능 (완료)

- A-01: Go to Definition
- A-02: Find All References
- A-03: DTS 자동완성
- A-04: BitBake 자동완성
- A-05: Hover 정보 표시
- A-06: Breadcrumb

### Phase B: 빌드 파이프라인 (진행/대기)

- B-01: rsync 동기화
- B-02: bitbake 빌드 실행
- B-03: 빌드 로그 스트리밍
- B-04: 빌드 콘솔 UI
- B-05: 아티팩트 다운로드

### Phase C: 파서/분석 고도화 (완료)

- C-01: Include 병합
- C-02: dt-bindings 매크로 해석

### Phase D: 보안/안정성 (부분 완료)

- D-01: keytar 통합(보안) - 대기
- D-02: 에러 처리 강화 - 대기
- D-03: 인덱스 안정화(FOREIGN KEY 오류 수정) - 완료

### 추가 완료 항목

- X-01: 서버측 인덱싱 스크립트
- X-02: 인덱스 공유
- X-03: FTS5 검색 최적화
- X-04: 파일 탐색기 개선
- X-05: UI 인덱싱 상태 표시 개선

## 기술 스택

- Electron + React 18 + TypeScript
- Tailwind CSS, Zustand
- electron-vite, better-sqlite3, ssh2

## 시작하기

### 사전 요구사항

- Node.js 20.x 이상
- npm (또는 yarn/pnpm)

### 설치/실행

```bash
npm install

# 개발 모드
npm run dev

# 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

## 유용한 스크립트

```bash
npm run lint
npm run format
npm run typecheck
npm run test
```

## 프로젝트 구조

```
code/
  src/
    main/            # Electron Main Process
    preload/         # Preload Scripts
    renderer/        # Renderer Process (React)
    shared/          # 공용 타입/IPC 채널
  package.json
  electron.vite.config.ts
  tailwind.config.js
  tsconfig.json
```

## 문서

- 요구사항/PRD: `need.md`, `new_need.md`
- 정책/명세: `01_policy_spec.md`, `02_manifest_and_job_spec.md`
- 전략/아키텍처: `03_kernel_config_strategy.md`, `04_performance_architecture.md`
- 로드맵/체크리스트: `ROADMAP.md`, `체크리스트.md`

## 라이선스

MIT
