# Yocto BSP Studio — 상세 구현 로드맵

> **문서 버전**: 1.0  
> **최종 수정일**: 2026-01-28  
> **총 개발 기간**: 11개월 (44주)  
> **참조 문서**: new_need.md

---

## 목차

1. [로드맵 개요](#1-로드맵-개요)
2. [Phase 0: MVP (핵심 뷰어 + 빌드)](#2-phase-0-mvp-핵심-뷰어--빌드)
3. [Phase 1: 고급 뷰어](#3-phase-1-고급-뷰어)
4. [Phase 2: 커널 자동화](#4-phase-2-커널-자동화)
5. [Phase 3: 팀/재현성](#5-phase-3-팀재현성)
6. [기술 스택 및 아키텍처](#6-기술-스택-및-아키텍처)
7. [마일스톤 및 릴리스 계획](#7-마일스톤-및-릴리스-계획)
8. [리스크 관리](#8-리스크-관리)
9. [품질 보증 계획](#9-품질-보증-계획)

---

## 1. 로드맵 개요

### 1.1 전체 타임라인

```
2026년
    1월      2월      3월      4월      5월      6월      7월      8월      9월      10월     11월     12월
    ├────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤
    │◀─────────── Phase 0 (MVP) ───────────▶│◀──── Phase 1 ────▶│◀─ Phase 2 ─▶│◀─ Phase 3 ─▶│
    │         M1       M2               M3  │    M4        M5   │     M6      │     M7      │
    │         │        │                │   │    │         │    │     │       │     │       │
    │      Editor   First            Policy │  GPIO     Kernel  │   Config    │  Reproduce  │
    │      Ready    Build            Basic  │  Viewer   Auto    │   Verify    │  Complete   │
    │                                       │                   │             │             │
    W1──────W8──────W16─────────────W18────W30──────────────W38────────W44
```

### 1.2 Phase 요약

| Phase | 기간 | 핵심 목표 | 주요 산출물 |
|-------|------|-----------|-------------|
| **Phase 0** | 4.5개월 (W1-W18) | MVP 완성 | 에디터, DT 뷰어, 빌드, 다운로드 |
| **Phase 1** | 3개월 (W19-W30) | 고급 뷰어 | GPIO 뷰어, Include Chain, HW 맵 |
| **Phase 2** | 2개월 (W31-W38) | 커널 자동화 | bbappend/fragment 자동 생성 |
| **Phase 3** | 1.5개월 (W39-W44) | 팀/재현성 | Git 연동, 빌드 재현 |

### 1.3 인력 구성 (권장)

| 역할 | 인원 | 담당 영역 |
|------|------|-----------|
| **Tech Lead** | 1명 | 아키텍처, 코드 리뷰, 기술 의사결정 |
| **Frontend Dev** | 1-2명 | Electron UI, React/Vue, 에디터 통합 |
| **Backend Dev** | 1명 | SSH/rsync, BitBake 연동, 파서 개발 |
| **DevOps** | 0.5명 | CI/CD, 테스트 자동화, 배포 |

---

## 2. Phase 0: MVP (핵심 뷰어 + 빌드)

> **기간**: Week 1 ~ Week 18 (4.5개월)  
> **목표**: "초보자가 30분 내 첫 빌드 성공 + Device Tree 편집/탐색 가능"

### 2.1 Sprint 계획

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Phase 0: MVP (18주)                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Sprint 1-2 (W1-4)        Sprint 3-4 (W5-8)        Sprint 5-6 (W9-12)          │
│  ────────────────         ────────────────         ─────────────────           │
│  🏗️ 프로젝트 기반         ⭐ 에디터 핵심           ⭐ DT 뷰어 + Go to Def     │
│  • Electron 스캐폴딩      • Monaco 통합            • DTS 파서                  │
│  • IPC 아키텍처           • 구문 하이라이트        • 트리 뷰어                 │
│  • SSH 연결               • 파일 탐색기            • 정의 점프                 │
│  • 기본 UI 레이아웃       • 탭 관리                • Peek Definition          │
│                                                                                 │
│  Sprint 7-8 (W13-16)      Sprint 9 (W17-18)                                    │
│  ─────────────────        ─────────────────                                    │
│  🔨 빌드 시스템           📦 완성 + 안정화                                     │
│  • rsync 동기화           • manifest 생성                                      │
│  • bitbake 실행           • Policy Engine                                      │
│  • 로그 스트리밍          • 통합 테스트                                        │
│  • 아티팩트 다운로드      • 버그 수정                                          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Week별 상세 계획

#### 🏗️ Sprint 1: 프로젝트 기반 구축 (W1-W2)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 | 담당 |
|------|---------|--------|-----------|--------|------|
| W1 | T001 | Electron 프로젝트 초기화 | - electron-vite 또는 electron-forge 설정<br>- TypeScript 설정<br>- ESLint/Prettier 설정 | 빌드 가능한 빈 앱 | Frontend |
| W1 | T002 | 프로젝트 구조 설계 | - 디렉토리 구조 정의<br>- 모듈 분리 규칙<br>- 네이밍 컨벤션 | 아키텍처 문서 | Tech Lead |
| W2 | T003 | IPC 통신 기반 | - Main/Renderer 프로세스 분리<br>- IPC 채널 정의<br>- 타입 안전한 IPC 래퍼 | ipc-bridge 모듈 | Frontend |
| W2 | T004 | 기본 UI 레이아웃 | - Eclipse 스타일 레이아웃<br>- 사이드바/에디터/패널 분할<br>- 리사이즈 가능한 패널 | UI 쉘 | Frontend |

**산출물 체크리스트 (W2 완료 시점)**:
- [ ] `npm run dev`로 앱 실행 가능
- [ ] Main/Renderer IPC 통신 동작 확인
- [ ] 3-패널 레이아웃 (좌측/중앙/하단) 렌더링
- [ ] Hot Reload 동작

---

#### 🏗️ Sprint 2: SSH 연결 (W3-W4)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 | 담당 |
|------|---------|--------|-----------|--------|------|
| W3 | T005 | SSH 연결 모듈 | - ssh2 라이브러리 통합<br>- 키 기반 인증<br>- 연결 풀 관리 | ssh-manager 모듈 | Backend |
| W3 | T006 | 연결 UI | - 서버 프로필 폼<br>- 연결 테스트 버튼<br>- 상태 표시 | SSH 설정 다이얼로그 | Frontend |
| W4 | T007 | 연결 테스트 기능 | - 권한 확인 (bitbake, rsync 존재)<br>- 디스크 여유 확인<br>- 에러 메시지 표시 | 진단 리포트 UI | Backend |
| W4 | T008 | 프로필 저장 | - OS Keychain 통합 (keytar)<br>- 프로젝트별 프로필<br>- 암호화 저장 | 설정 persistence | Backend |

**산출물 체크리스트 (W4 완료 시점)**:
- [ ] SSH 키로 서버 연결 성공
- [ ] 연결 상태 UI 표시 (연결됨/끊김)
- [ ] 서버 프로필 저장/불러오기
- [ ] 연결 실패 시 명확한 에러 메시지

---

#### ⭐ Sprint 3: Monaco 에디터 통합 (W5-W6)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 | 담당 |
|------|---------|--------|-----------|--------|------|
| W5 | T009 | Monaco Editor 통합 | - monaco-editor 설치<br>- React/Vue 래퍼<br>- 기본 설정 | editor 컴포넌트 | Frontend |
| W5 | T010 | DTS 구문 하이라이트 | - Device Tree 언어 정의<br>- 토큰화 규칙<br>- 테마 적용 | dts.language.json | Frontend |
| W6 | T011 | BitBake 구문 하이라이트 | - .bb/.bbappend 언어 정의<br>- 변수/함수 하이라이트<br>- 주석/문자열 처리 | bitbake.language.json | Frontend |
| W6 | T012 | 탭 관리 시스템 | - 멀티 탭 UI<br>- 수정 표시 (*)<br>- 저장/닫기 동작 | tab-manager 컴포넌트 | Frontend |

**산출물 체크리스트 (W6 완료 시점)**:
- [ ] .dts/.dtsi 파일 구문 하이라이트 동작
- [ ] .bb/.bbappend 파일 구문 하이라이트 동작
- [ ] 멀티 탭으로 여러 파일 편집 가능
- [ ] Ctrl+S로 파일 저장

---

#### ⭐ Sprint 4: 파일 탐색기 + 자동완성 (W7-W8)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 | 담당 |
|------|---------|--------|-----------|--------|------|
| W7 | T013 | 프로젝트 탐색기 | - 트리 뷰 컴포넌트<br>- 폴더 확장/축소<br>- 아이콘 (레이어/레시피/conf 구분) | project-explorer 컴포넌트 | Frontend |
| W7 | T014 | 파일 필터링 | - 레이어별 필터<br>- 파일 타입 필터<br>- 검색 기능 | filter UI | Frontend |
| W8 | T015 | DTS 자동완성 | - 노드 이름 자동완성<br>- 속성 이름 자동완성<br>- phandle 참조 | dts-completion-provider | Backend |
| W8 | T016 | BitBake 자동완성 | - 변수 자동완성<br>- 함수 자동완성<br>- 클래스 inherit | bb-completion-provider | Backend |

**산출물 체크리스트 (W8 완료 시점)**:
- [ ] 프로젝트 폴더 트리 표시
- [ ] 파일 더블클릭으로 에디터에서 열기
- [ ] DTS 파일에서 Ctrl+Space로 자동완성
- [ ] BB 파일에서 변수 자동완성

---

#### ⭐ Sprint 5: Device Tree 파서 (W9-W10)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 | 담당 |
|------|---------|--------|-----------|--------|------|
| W9 | T017 | DTS 파서 구현 | - 렉서/파서 (tree-sitter 또는 자체)<br>- AST 생성<br>- include 해석 | dts-parser 모듈 | Backend |
| W9 | T018 | Include Chain 해석 | - #include / /include/ 처리<br>- 상대/절대 경로 해석<br>- 순환 참조 감지 | include-resolver | Backend |
| W10 | T019 | DT 트리 뷰어 | - 노드 계층 트리 UI<br>- 속성 표시<br>- 오버라이드 표시 (원본/수정) | dt-tree-viewer 컴포넌트 | Frontend |
| W10 | T020 | 노드 검색 | - 노드 경로 검색<br>- compatible 검색<br>- 필터링 | dt-search UI | Frontend |

**산출물 체크리스트 (W10 완료 시점)**:
- [ ] DTS 파일 파싱 + AST 생성
- [ ] include chain 따라 병합된 트리 생성
- [ ] UI에서 노드 트리 표시
- [ ] 노드 클릭 시 속성 상세 표시

---

#### ⭐ Sprint 6: Go to Definition (W11-W12)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 | 담당 |
|------|---------|--------|-----------|--------|------|
| W11 | T021 | DTS 정의 점프 | - 노드 참조(&xxx) 정의 찾기<br>- include 파일 열기<br>- phandle 추적 | dts-definition-provider | Backend |
| W11 | T022 | Peek Definition | - 인라인 미리보기 UI<br>- 정의 위치 표시<br>- 여러 정의 선택 | peek-definition 컴포넌트 | Frontend |
| W12 | T023 | Find All References | - 노드 사용 위치 검색<br>- 결과 목록 UI<br>- 클릭으로 이동 | references-panel | Frontend |
| W12 | T024 | Breadcrumb 내비게이션 | - 현재 위치 경로 표시<br>- 클릭으로 상위 이동<br>- DT 노드 경로 표시 | breadcrumb 컴포넌트 | Frontend |

**산출물 체크리스트 (W12 완료 시점)**:
- [ ] Ctrl+클릭으로 include 파일 열기
- [ ] &node 참조에서 정의로 점프
- [ ] Alt+F12로 Peek Definition 동작
- [ ] Shift+F12로 모든 참조 표시

---

#### 🔨 Sprint 7: rsync 동기화 (W13-W14)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 | 담당 |
|------|---------|--------|-----------|--------|------|
| W13 | T025 | rsync 모듈 | - node-rsync 또는 spawn<br>- SSH 터널링<br>- 진행률 파싱 | rsync-manager 모듈 | Backend |
| W13 | T026 | exclude 규칙 | - 기본 제외 (tmp/, sstate-cache/)<br>- 사용자 정의 규칙<br>- .rsyncignore 지원 | exclude 설정 UI | Backend |
| W14 | T027 | Windows 지원 | - cwRsync 번들링<br>- WSL rsync 폴백<br>- 경로 변환 | windows-rsync 모듈 | Backend |
| W14 | T028 | 동기화 UI | - 진행률 표시<br>- 전송 파일 목록<br>- 충돌/에러 표시 | sync-panel 컴포넌트 | Frontend |

**산출물 체크리스트 (W14 완료 시점)**:
- [ ] 로컬 → 서버 증분 동기화
- [ ] tmp/, sstate-cache/ 자동 제외
- [ ] Windows에서 동기화 동작
- [ ] 진행률 및 전송 결과 표시

---

#### 🔨 Sprint 8: 빌드 + 로그 (W15-W16)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 | 담당 |
|------|---------|--------|-----------|--------|------|
| W15 | T029 | 빌드 트리거 | - bitbake 명령 실행<br>- 환경 변수 설정 (source oe-init...)<br>- 타겟 선택 UI | build-manager 모듈 | Backend |
| W15 | T030 | 로그 스트리밍 | - SSH exec 실시간 출력<br>- ANSI 컬러 처리<br>- 백프레셔 처리 | log-streamer 모듈 | Backend |
| W16 | T031 | 빌드 콘솔 UI | - 실시간 로그 표시<br>- 가상 스크롤링 (성능)<br>- 로그 검색 | build-console 컴포넌트 | Frontend |
| W16 | T032 | 아티팩트 다운로드 | - deploy/images 스캔<br>- SFTP 다운로드<br>- sha256 검증 | artifact-downloader 모듈 | Backend |

**산출물 체크리스트 (W16 완료 시점)**:
- [ ] UI에서 빌드 타겟 선택 + 빌드 시작
- [ ] 실시간 빌드 로그 표시
- [ ] 빌드 완료 후 이미지 목록 표시
- [ ] 이미지 다운로드 + 체크섬 검증

---

#### 📦 Sprint 9: Manifest + Policy (W17-W18)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 | 담당 |
|------|---------|--------|-----------|--------|------|
| W17 | T033 | Job 시스템 | - job-id 생성 규칙<br>- Job 디렉토리 구조<br>- 상태 추적 | job-manager 모듈 | Backend |
| W17 | T034 | manifest.json 생성 | - 스키마 구현<br>- 빌드 정보 수집<br>- sha256 계산 | manifest-generator | Backend |
| W18 | T035 | Policy Engine 기본 | - policy.yaml 파서<br>- deny/warn/recommend 적용<br>- protected 레이어 검사 | policy-engine 모듈 | Backend |
| W18 | T036 | Policy UI | - 위반 알림 다이얼로그<br>- 대안 버튼<br>- 경고 표시 | policy-violation 컴포넌트 | Frontend |

**산출물 체크리스트 (W18 완료 시점)**:
- [ ] 빌드마다 manifest.json 자동 생성
- [ ] Job 히스토리 목록 표시
- [ ] protected 레이어 수정 시 경고/차단
- [ ] deny 시 대안 버튼 동작

---

### 2.3 Phase 0 마일스톤

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Phase 0 마일스톤                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  M1: Basic Editor (W8)                  M2: First Build (W16)                  │
│  ─────────────────────                  ─────────────────────                  │
│  ✅ Monaco Editor 통합                  ✅ 동기화 + 빌드 동작                   │
│  ✅ DTS/BB 구문 하이라이트              ✅ 로그 스트리밍                        │
│  ✅ 파일 탐색기                         ✅ 아티팩트 다운로드                    │
│  ✅ 자동완성 기본                       ✅ 30분 내 첫 빌드 가능                 │
│                                                                                 │
│  M2.5: DT Viewer (W12)                  M3: MVP Complete (W18)                 │
│  ─────────────────────                  ─────────────────────                  │
│  ✅ DTS 파싱 + 트리 뷰                  ✅ manifest.json 생성                   │
│  ✅ Go to Definition                    ✅ Policy Engine 기본                   │
│  ✅ Peek Definition                     ✅ E2E 테스트 통과                      │
│  ✅ Find All References                 ✅ 알파 릴리스 준비                     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Phase 1: 고급 뷰어

> **기간**: Week 19 ~ Week 30 (3개월)  
> **목표**: "GPIO/핀 정보, Include Chain, 하드웨어 맵 한눈에 파악"

### 3.1 Sprint 계획

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Phase 1: 고급 뷰어 (12주)                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Sprint 10-11 (W19-22)    Sprint 12-13 (W23-26)    Sprint 14-15 (W27-30)       │
│  ─────────────────────    ─────────────────────    ─────────────────────       │
│  ⭐ GPIO/핀 뷰어          ⭐ Include Chain         📊 레시피/변수              │
│  • pinctrl 파서           • C/H 파서               • 의존성 그래프             │
│  • 핀 검색 UI             • 그래프 시각화          • bitbake -e 파싱           │
│  • GPIO Bank 시각화       • 심볼 정의 추적         • 변수 출처 추적            │
│  • 정의 위치 연결         • 매크로 값 확인         • 초보자 진단               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Week별 상세 계획

#### ⭐ Sprint 10: pinctrl 파서 (W19-W20)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W19 | T037 | pinctrl 노드 파서 | - fsl,pins / pins 속성 파싱<br>- 매크로 해석 (S32_PINMUX 등)<br>- 핀 번호/기능 추출 | pinctrl-parser 모듈 |
| W19 | T038 | dt-bindings 매크로 해석 | - #include <dt-bindings/...> 처리<br>- #define 값 추출<br>- 매크로 계산 | dt-bindings-resolver |
| W20 | T039 | 핀 정보 인덱싱 | - 프로젝트 전체 핀 정보 수집<br>- 인덱스 캐싱<br>- 변경 감지 갱신 | pin-index-manager |
| W20 | T040 | 핀 데이터 모델 | - 핀 속성 (이름, 번호, 기능, pull, drive)<br>- 정의 위치 연결<br>- 사용 위치 연결 | pin-data-model |

---

#### ⭐ Sprint 11: GPIO 뷰어 UI (W21-W22)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W21 | T041 | 핀 검색 UI | - 검색 입력<br>- 필터 (Bank, 기능)<br>- 결과 목록 | pin-search 컴포넌트 |
| W21 | T042 | 핀 상세 정보 패널 | - 핀 속성 표시<br>- 정의 파일 링크<br>- 관련 노드 표시 | pin-detail 컴포넌트 |
| W22 | T043 | GPIO Bank 시각화 | - Bank별 핀 그리드<br>- 사용/미사용 표시<br>- 핀 클릭 상호작용 | gpio-bank-view 컴포넌트 |
| W22 | T044 | 핀 → DTS 연결 | - 핀 클릭 → DTS 노드로 이동<br>- 하이라이트 표시<br>- Breadcrumb 업데이트 | pin-navigation |

**Sprint 10-11 산출물 체크리스트**:
- [ ] "UART2_TX" 검색 시 핀 정보 + 정의 위치 표시
- [ ] GPIO Bank 시각화 (사용중/미사용 구분)
- [ ] 핀 클릭 시 해당 DTS 노드로 이동
- [ ] 검색 응답 < 500ms

---

#### ⭐ Sprint 12: C/H Include Chain (W23-W24)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W23 | T045 | C/H 파서 | - #include 추출<br>- #define 추출<br>- #ifdef 조건부 처리 | c-header-parser |
| W23 | T046 | Include 그래프 생성 | - 파일 → 파일 의존성<br>- 깊이 우선 탐색<br>- 순환 참조 감지 | include-graph-builder |
| W24 | T047 | 심볼 인덱싱 | - 매크로 정의 위치<br>- 매크로 값 (계산)<br>- 사용 위치 | symbol-index |
| W24 | T048 | 매크로 값 계산 | - 산술 연산 평가<br>- 참조 매크로 치환<br>- 조건부 값 | macro-evaluator |

---

#### ⭐ Sprint 13: Include Chain UI (W25-W26)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W25 | T049 | Include 그래프 UI | - D3.js / vis.js 기반<br>- 노드(파일) + 엣지(include)<br>- 줌/팬 | include-graph 컴포넌트 |
| W25 | T050 | 심볼 정의 점프 (C/H) | - 매크로 Ctrl+클릭<br>- 함수 선언 점프<br>- 다중 정의 선택 | c-definition-provider |
| W26 | T051 | 매크로 값 표시 | - 호버 시 계산된 값 표시<br>- 참조 체인 표시<br>- #ifdef 조건 표시 | macro-hover-info |
| W26 | T052 | 메모리 맵 뷰어 기본 | - 주소 범위 파싱 (reg 속성)<br>- 메모리 영역 시각화<br>- 페리페럴 목록 | memory-map-viewer |

**Sprint 12-13 산출물 체크리스트**:
- [ ] C/H 파일에서 #include 그래프 시각화
- [ ] 매크로 정의로 Ctrl+클릭 점프
- [ ] 매크로 호버 시 계산된 값 표시
- [ ] 메모리 맵 기본 시각화

---

#### 📊 Sprint 14: 레시피 의존성 (W27-W28)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W27 | T053 | bitbake-layers 연동 | - show-layers 파싱<br>- show-recipes 파싱<br>- 캐싱 | bitbake-layers-parser |
| W27 | T054 | 의존성 그래프 생성 | - DEPENDS / RDEPENDS 추출<br>- 그래프 데이터 구조<br>- 순환 의존성 감지 | recipe-dependency-graph |
| W28 | T055 | 의존성 그래프 UI | - 트리/그래프 뷰 전환<br>- 필터 (레이어, 타입)<br>- 검색 | recipe-graph 컴포넌트 |
| W28 | T056 | 빌드 시간/크기 예측 | - 의존성 수 기반 예측<br>- sstate 히트율 고려<br>- 통계 표시 | build-estimation |

---

#### 📊 Sprint 15: 변수 검색 + 진단 (W29-W30)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W29 | T057 | bitbake -e 파싱 | - 변수 최종값 추출<br>- 출처 (파일:라인) 추출<br>- 오버라이드 순서 | bitbake-e-parser |
| W29 | T058 | 변수 검색 UI | - 변수명 검색<br>- 최종값 표시<br>- 출처 위치 링크 | variable-search 컴포넌트 |
| W30 | T059 | 초보자 진단 모드 | - 빌드 실패 패턴 매칭<br>- 원인 후보 표시<br>- 해결 버튼 | diagnostic-engine |
| W30 | T060 | Problems 패널 | - 진단 결과 목록<br>- 심각도별 정렬<br>- Quick Fix 버튼 | problems-panel 컴포넌트 |

**Sprint 14-15 산출물 체크리스트**:
- [ ] 레시피 의존성 그래프 시각화
- [ ] 변수 검색 → 최종값 + 출처 표시
- [ ] 빌드 실패 시 원인 후보 표시
- [ ] Quick Fix 버튼 동작

---

### 3.3 Phase 1 마일스톤

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Phase 1 마일스톤                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  M4: GPIO Viewer (W22)                  M5: Include Chain (W26)                │
│  ─────────────────────                  ─────────────────────                  │
│  ✅ GPIO/핀 검색 동작                   ✅ C/H include 그래프                   │
│  ✅ GPIO Bank 시각화                    ✅ 매크로 정의 점프                     │
│  ✅ 핀 → DTS 연결                       ✅ 매크로 값 표시                       │
│  ✅ 검색 < 500ms                        ✅ 메모리 맵 기본                       │
│                                                                                 │
│  M6: Recipe Graph (W30)                                                        │
│  ─────────────────────                                                         │
│  ✅ 레시피 의존성 그래프                                                        │
│  ✅ 변수 출처 추적                                                              │
│  ✅ 초보자 진단 모드                                                            │
│  ✅ 베타 릴리스 준비                                                            │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Phase 2: 커널 자동화

> **기간**: Week 31 ~ Week 38 (2개월)  
> **목표**: "벤더 커널도 안전하게, fragment 자동 생성 + CONFIG 검증"

### 4.1 Sprint 계획

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Phase 2: 커널 자동화 (8주)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Sprint 16-17 (W31-34)                  Sprint 18-19 (W35-38)                  │
│  ─────────────────────                  ─────────────────────                  │
│  🔧 커널 Provider 감지                  🔧 CONFIG 검증                          │
│  • bitbake -e virtual/kernel 파싱       • .config 파싱                         │
│  • defconfig/fragment 탐지              • 요청 vs 실제 비교                    │
│  • bbappend 자동 생성                   • 의존성 자동 해결                     │
│  • fragment .cfg 생성                   • 검증 UI                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Week별 상세 계획

#### 🔧 Sprint 16: 커널 Provider 감지 (W31-W32)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W31 | T061 | kernel provider 파싱 | - bitbake -e virtual/kernel 실행<br>- PN, FILE, PREFERRED_PROVIDER 추출<br>- SRC_URI 분석 | kernel-provider-detector |
| W31 | T062 | defconfig 위치 탐지 | - KERNEL_DEFCONFIG 변수<br>- SRC_URI의 file://defconfig<br>- 워크 디렉토리 내 위치 | defconfig-locator |
| W32 | T063 | fragment 기존 탐지 | - SRC_URI의 *.cfg 파일<br>- KERNEL_CONFIG_FRAGMENTS 변수<br>- 기존 bbappend 검사 | fragment-detector |
| W32 | T064 | 커널 설정 대시보드 | - Provider 정보 표시<br>- 현재 전략 표시<br>- 설정 파일 목록 | kernel-dashboard 컴포넌트 |

---

#### 🔧 Sprint 17: bbappend/fragment 자동 생성 (W33-W34)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W33 | T065 | bbappend 템플릿 생성 | - linux-<provider>_%.bbappend<br>- FILESEXTRAPATHS 설정<br>- SRC_URI 추가 | bbappend-generator |
| W33 | T066 | fragment .cfg 생성 | - CONFIG_xxx=y/n/m 형식<br>- 주석 자동 추가<br>- 파일 저장 | cfg-file-generator |
| W34 | T067 | CONFIG 검색 UI | - Kconfig 심볼 검색<br>- HELP 텍스트 표시<br>- 의존성 표시 | config-search 컴포넌트 |
| W34 | T068 | CONFIG 편집 UI | - 체크박스 (y/n/m)<br>- 값 입력 (string/int)<br>- fragment 미리보기 | config-editor 컴포넌트 |

**Sprint 16-17 산출물 체크리스트**:
- [ ] 커널 provider (linux-s32 등) 자동 감지
- [ ] defconfig/fragment 위치 자동 탐지
- [ ] bbappend + .cfg 자동 생성 버튼 동작
- [ ] CONFIG 검색 + HELP 텍스트 표시

---

#### 🔧 Sprint 18: CONFIG 검증 (W35-W36)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W35 | T069 | .config 파싱 | - 최종 .config 파일 읽기<br>- CONFIG=value 파싱<br>- # CONFIG is not set 처리 | dotconfig-parser |
| W35 | T070 | 검증 로직 | - 요청 CONFIG vs 실제 비교<br>- 불일치 감지<br>- 의존성 미충족 감지 | config-validator |
| W36 | T071 | 자동 의존성 해결 | - depends on 분석<br>- select 자동 추가<br>- 충돌 해결 제안 | dependency-resolver |
| W36 | T072 | 검증 결과 UI | - 반영됨/미반영 표시<br>- 값 변경됨 표시<br>- 해결 버튼 | config-verify 컴포넌트 |

---

#### 🔧 Sprint 19: 커널 워크플로 통합 (W37-W38)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W37 | T073 | 커널 빌드 + 검증 자동화 | - fragment 적용<br>- bitbake -c compile<br>- .config 자동 검증 | kernel-build-verify |
| W37 | T074 | 검증 실패 시 가이드 | - 실패 원인 분석<br>- 해결 방법 제안<br>- 자동 수정 버튼 | kernel-fix-guide |
| W38 | T075 | menuconfig 연동 (옵션) | - 서버에서 menuconfig 실행<br>- 변경사항 추출<br>- fragment로 변환 | menuconfig-integration |
| W38 | T076 | 커널 워크플로 테스트 | - E2E 테스트<br>- 다양한 커널 provider 테스트<br>- 엣지 케이스 | kernel-e2e-tests |

**Sprint 18-19 산출물 체크리스트**:
- [ ] CONFIG 반영 검증 자동화
- [ ] 의존성 미충족 시 자동 추가 제안
- [ ] 검증 실패 → 해결 가이드 표시
- [ ] 커널 설정 변경 E2E 테스트 통과

---

## 5. Phase 3: 팀/재현성

> **기간**: Week 39 ~ Week 44 (1.5개월)  
> **목표**: "빌드 이력 추적, manifest 기반 100% 재현, Git 연동"

### 5.1 Sprint 계획

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Phase 3: 팀/재현성 (6주)                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Sprint 20-21 (W39-42)                  Sprint 22 (W43-44)                     │
│  ─────────────────────                  ─────────────────────                  │
│  📦 재현성                              🔗 Git 연동                             │
│  • manifest 기반 재현                   • git status/diff 표시                  │
│  • 빌드 이력 UI                         • commit 연결                           │
│  • 비교 기능                            • 태그 기반 릴리스                      │
│  • Policy CI 연동                       • 최종 안정화                           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Week별 상세 계획

#### 📦 Sprint 20: 빌드 이력 (W39-W40)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W39 | T077 | 빌드 이력 DB | - manifest.json 인덱싱<br>- 검색 쿼리<br>- 필터 (날짜/MACHINE/IMAGE) | history-database |
| W39 | T078 | 빌드 이력 UI | - 목록 뷰<br>- 카드 뷰<br>- 상세 정보 패널 | history-panel 컴포넌트 |
| W40 | T079 | 빌드 비교 | - 두 빌드 선택<br>- 환경 변수 diff<br>- 파일 변경 diff | build-compare 컴포넌트 |
| W40 | T080 | 빌드 검색/필터 | - MACHINE/IMAGE 필터<br>- 날짜 범위<br>- 성공/실패 필터 | history-search |

---

#### 📦 Sprint 21: 재현 + Policy CI (W41-W42)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W41 | T081 | "이 빌드 재현" 기능 | - manifest 로드<br>- git checkout<br>- 환경 복원 | rebuild-manager |
| W41 | T082 | 재현 검증 | - sha256 비교<br>- 불일치 리포트<br>- 원인 분석 | rebuild-validator |
| W42 | T083 | Policy CI 스크립트 | - CLI 모드 지원<br>- policy.yaml 검증<br>- 리포트 출력 | policy-cli |
| W42 | T084 | CI 연동 문서 | - Jenkins 연동<br>- GitLab CI 연동<br>- GitHub Actions 연동 | ci-integration-doc |

**Sprint 20-21 산출물 체크리스트**:
- [ ] 빌드 이력 검색/필터 동작
- [ ] 두 빌드 비교 diff 표시
- [ ] "이 빌드 재현" 버튼 → 동일 sha256
- [ ] Policy CLI로 CI 연동 가능

---

#### 🔗 Sprint 22: Git 연동 + 최종화 (W43-W44)

| Week | Task ID | 태스크 | 상세 작업 | 산출물 |
|------|---------|--------|-----------|--------|
| W43 | T085 | Git 상태 표시 | - dirty/clean 상태<br>- 변경 파일 목록<br>- commit 정보 | git-status 컴포넌트 |
| W43 | T086 | Git diff 뷰어 | - 파일별 diff<br>- staged/unstaged 구분<br>- diff 하이라이트 | git-diff 컴포넌트 |
| W44 | T087 | 최종 안정화 | - 전체 E2E 테스트<br>- 성능 최적화<br>- 버그 수정 | stable release |
| W44 | T088 | 문서화 완료 | - 사용자 가이드<br>- API 문서<br>- 튜토리얼 | documentation |

**Sprint 22 산출물 체크리스트**:
- [ ] Git 상태/diff 표시 동작
- [ ] manifest에 git commit 기록
- [ ] 전체 E2E 테스트 통과
- [ ] v1.0 릴리스 준비 완료

---

## 6. 기술 스택 및 아키텍처

### 6.1 기술 스택

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              기술 스택                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Frontend (Renderer Process)                                                    │
│  ──────────────────────────                                                     │
│  • Framework: React 18 + TypeScript                                             │
│  • State: Zustand 또는 Redux Toolkit                                            │
│  • UI Library: Radix UI + Tailwind CSS                                          │
│  • Editor: Monaco Editor                                                        │
│  • Graph: D3.js 또는 vis.js                                                     │
│  • Tree View: react-arborist                                                    │
│                                                                                 │
│  Backend (Main Process)                                                         │
│  ─────────────────────                                                          │
│  • Runtime: Electron 28+                                                        │
│  • SSH: ssh2                                                                    │
│  • SFTP: ssh2-sftp-client                                                       │
│  • rsync: node-rsync + cwRsync (Windows)                                        │
│  • YAML: yaml (js-yaml)                                                         │
│  • Keychain: keytar                                                             │
│                                                                                 │
│  Parsers                                                                        │
│  ───────                                                                        │
│  • DTS: tree-sitter-devicetree 또는 자체 파서                                   │
│  • BitBake: 자체 파서 (PEG.js 기반)                                             │
│  • C/H: tree-sitter-c                                                           │
│  • Kconfig: 자체 파서                                                           │
│                                                                                 │
│  Storage                                                                        │
│  ───────                                                                        │
│  • Local DB: better-sqlite3                                                     │
│  • Cache: LRU Cache (in-memory)                                                 │
│  • Config: electron-store                                                       │
│                                                                                 │
│  Testing                                                                        │
│  ───────                                                                        │
│  • Unit: Vitest                                                                 │
│  • E2E: Playwright (Electron)                                                   │
│  • Mocking: msw (Mock Service Worker)                                           │
│                                                                                 │
│  Build/Deploy                                                                   │
│  ────────────                                                                   │
│  • Bundler: electron-vite 또는 electron-forge                                   │
│  • Package: electron-builder                                                    │
│  • CI: GitHub Actions                                                           │
│  • Auto Update: electron-updater                                                │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 모듈 아키텍처

```
src/
├── main/                          # Main Process
│   ├── index.ts                   # 진입점
│   ├── ipc/                       # IPC 핸들러
│   │   ├── ssh-handlers.ts
│   │   ├── build-handlers.ts
│   │   └── file-handlers.ts
│   ├── services/
│   │   ├── ssh-manager.ts
│   │   ├── rsync-manager.ts
│   │   ├── build-manager.ts
│   │   ├── job-manager.ts
│   │   └── policy-engine.ts
│   ├── parsers/
│   │   ├── dts-parser.ts
│   │   ├── bitbake-parser.ts
│   │   ├── c-header-parser.ts
│   │   └── pinctrl-parser.ts
│   └── database/
│       ├── index-db.ts
│       └── history-db.ts
│
├── renderer/                      # Renderer Process
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── EditorArea.tsx
│   │   │   └── BottomPanel.tsx
│   │   ├── editor/
│   │   │   ├── MonacoEditor.tsx
│   │   │   └── TabManager.tsx
│   │   ├── viewers/
│   │   │   ├── DTTreeViewer.tsx
│   │   │   ├── GPIOViewer.tsx
│   │   │   ├── IncludeGraph.tsx
│   │   │   └── MemoryMap.tsx
│   │   ├── build/
│   │   │   ├── BuildConsole.tsx
│   │   │   └── ArtifactList.tsx
│   │   └── common/
│   │       ├── Dialog.tsx
│   │       └── Toast.tsx
│   ├── hooks/
│   ├── stores/
│   └── utils/
│
├── shared/                        # 공유 타입/유틸
│   ├── types/
│   ├── constants/
│   └── ipc-channels.ts
│
└── preload/                       # Preload Scripts
    └── index.ts
```

---

## 7. 마일스톤 및 릴리스 계획

### 7.1 마일스톤 상세

| ID | 마일스톤 | 완료 조건 | 목표 일정 | 릴리스 |
|----|----------|-----------|-----------|--------|
| M1 | **Basic Editor** | Monaco 통합, DTS/BB 하이라이트, 자동완성 | W8 (2월) | - |
| M2 | **DT Viewer** | DTS 파싱, 트리 뷰, Go to Definition | W12 (3월) | Alpha 0.1 |
| M3 | **First Build** | 동기화+빌드+다운로드, 30분 내 첫 빌드 | W16 (4월) | Alpha 0.2 |
| M4 | **MVP Complete** | manifest, Policy Engine 기본 | W18 (4월) | Alpha 0.5 |
| M5 | **GPIO Viewer** | GPIO/핀 검색, Bank 시각화 | W22 (5월) | Beta 0.6 |
| M6 | **Include Chain** | C/H include 그래프, 매크로 추적 | W26 (6월) | Beta 0.7 |
| M7 | **Recipe Graph** | 의존성 그래프, 변수 검색, 진단 모드 | W30 (7월) | Beta 0.8 |
| M8 | **Kernel Auto** | fragment 자동 생성, CONFIG 검증 | W38 (9월) | RC 0.9 |
| M9 | **Full Reproduce** | 빌드 재현, Git 연동, CI 지원 | W44 (11월) | **v1.0** |

### 7.2 릴리스 계획

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              릴리스 계획                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Alpha (내부 테스트)                                                            │
│  ──────────────────                                                             │
│  • 0.1 (W12): 에디터 + DT 뷰어                                                  │
│  • 0.2 (W16): 빌드 시스템 추가                                                  │
│  • 0.5 (W18): MVP 완성                                                          │
│                                                                                 │
│  Beta (제한된 외부 테스트)                                                      │
│  ─────────────────────────                                                      │
│  • 0.6 (W22): GPIO 뷰어                                                         │
│  • 0.7 (W26): Include Chain                                                     │
│  • 0.8 (W30): 고급 뷰어 완성                                                    │
│                                                                                 │
│  RC (릴리스 후보)                                                               │
│  ───────────────                                                                │
│  • 0.9 (W38): 커널 자동화 완성                                                  │
│                                                                                 │
│  GA (정식 릴리스)                                                               │
│  ──────────────                                                                 │
│  • 1.0 (W44): 전체 기능 완성                                                    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. 리스크 관리

### 8.1 기술 리스크

| ID | 리스크 | 영향 | 확률 | 완화 전략 | 담당 |
|----|--------|------|------|-----------|------|
| R01 | DTS 파서 복잡도 | 높음 | 중간 | tree-sitter 우선, 자체 파서 폴백 | Backend |
| R02 | Windows rsync 호환 | 중간 | 높음 | cwRsync 번들링 + WSL 폴백 | Backend |
| R03 | 대용량 로그 성능 | 중간 | 중간 | 가상 스크롤링 + 백프레셔 | Frontend |
| R04 | bitbake -e 파싱 | 높음 | 중간 | 정규식 + 캐싱 + 점진적 파싱 | Backend |
| R05 | Monaco 번들 크기 | 낮음 | 높음 | 필요한 언어만 번들링 | Frontend |
| R06 | Electron 보안 | 중간 | 낮음 | contextIsolation, nodeIntegration:false | Tech Lead |

### 8.2 일정 리스크

| ID | 리스크 | 영향 | 확률 | 완화 전략 |
|----|--------|------|------|-----------|
| S01 | 파서 개발 지연 | 높음 | 중간 | 2주 버퍼, 외부 라이브러리 대안 |
| S02 | 테스트 환경 구축 | 중간 | 높음 | Docker 기반 Yocto 환경 준비 |
| S03 | 인력 부족 | 높음 | 중간 | 핵심 기능 우선, MVP 범위 조정 |

### 8.3 리스크 대응 계획

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         리스크 대응 플로우                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [리스크 감지] → [영향 평가] → [대응 결정] → [실행] → [모니터링]               │
│                                                                                 │
│  대응 옵션:                                                                     │
│  ├─ 회피: 요구사항 변경/제거                                                    │
│  ├─ 완화: 대안 기술/접근법 적용                                                 │
│  ├─ 전가: 외부 라이브러리/서비스 활용                                           │
│  └─ 수용: 버퍼 일정 사용                                                        │
│                                                                                 │
│  주간 리스크 리뷰:                                                              │
│  • 매주 금요일 리스크 현황 점검                                                 │
│  • 신규 리스크 식별                                                             │
│  • 완화 조치 효과 평가                                                          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. 품질 보증 계획

### 9.1 테스트 전략

| 테스트 유형 | 도구 | 커버리지 목표 | 실행 시점 |
|-------------|------|---------------|-----------|
| **단위 테스트** | Vitest | 80% (핵심 모듈) | PR마다 |
| **통합 테스트** | Vitest | 60% | PR마다 |
| **E2E 테스트** | Playwright | 주요 워크플로 | 릴리스 전 |
| **성능 테스트** | 자체 벤치마크 | 응답 시간 기준 충족 | 마일스톤마다 |
| **보안 테스트** | npm audit, snyk | 취약점 0 (high/critical) | 주간 |

### 9.2 코드 품질 기준

```yaml
# 코드 품질 체크리스트
lint:
  - ESLint 에러 0
  - Prettier 포맷팅 통과
  
type-safety:
  - TypeScript strict mode
  - any 타입 사용 최소화
  
testing:
  - 새 기능: 단위 테스트 필수
  - 버그 수정: 회귀 테스트 필수
  
documentation:
  - 공개 API: JSDoc 필수
  - 복잡한 로직: 인라인 주석
  
review:
  - PR 리뷰 필수 (최소 1명)
  - 핵심 모듈: Tech Lead 리뷰
```

### 9.3 CI/CD 파이프라인

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CI/CD 파이프라인                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [Push/PR]                                                                      │
│      │                                                                          │
│      ▼                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                         │
│  │   Lint      │───▶│   Build     │───▶│   Test      │                         │
│  │   Check     │    │   (all OS)  │    │   (unit)    │                         │
│  └─────────────┘    └─────────────┘    └─────────────┘                         │
│                                              │                                  │
│                                              ▼                                  │
│                                        [PR Merge]                               │
│                                              │                                  │
│                                              ▼                                  │
│                          ┌─────────────────────────────────┐                   │
│                          │         E2E Test                │                   │
│                          │    (Windows/Linux/macOS)        │                   │
│                          └─────────────┬───────────────────┘                   │
│                                        │                                        │
│                                        ▼                                        │
│  [Tag Release]                   [Nightly Build]                               │
│       │                                │                                        │
│       ▼                                ▼                                        │
│  ┌─────────────┐              ┌─────────────┐                                  │
│  │  Package    │              │  Package    │                                  │
│  │  (signed)   │              │  (unsigned) │                                  │
│  └──────┬──────┘              └──────┬──────┘                                  │
│         │                            │                                          │
│         ▼                            ▼                                          │
│  [GitHub Release]            [Internal Server]                                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 부록 A: 주간 회의 템플릿

```markdown
# Week N 회의록

## 참석자
- [ ] Tech Lead
- [ ] Frontend Dev
- [ ] Backend Dev

## 지난 주 완료 항목
- [ ] T0XX: 태스크명 (담당자)
- [ ] T0XX: 태스크명 (담당자)

## 이번 주 계획
- [ ] T0XX: 태스크명 (담당자)
- [ ] T0XX: 태스크명 (담당자)

## 블로커/이슈
- 이슈 설명 (담당자, 예상 해결일)

## 리스크 현황
- R0X: 상태 업데이트

## 다음 주 예정
- 주요 마일스톤/이벤트
```

---

## 부록 B: Task ID 매핑

| Phase | Task 범위 | 설명 |
|-------|-----------|------|
| Phase 0 | T001 ~ T036 | MVP (에디터, DT 뷰어, 빌드) |
| Phase 1 | T037 ~ T060 | 고급 뷰어 (GPIO, Include Chain) |
| Phase 2 | T061 ~ T076 | 커널 자동화 |
| Phase 3 | T077 ~ T088 | 팀/재현성 |

---

## 10. 실행 계획 (2026-01-29 업데이트)

> **현재 상태**: ROADMAP 기준 W10~W12 수준 (Sprint 5-6 완료 수준, 약 40%)  
> **목표**: 핵폭탄 급 성능의 BSP 개발 툴

### 10.1 우선순위 재정의

기존 ROADMAP의 Phase 순서와 별개로, **실제 사용성 확보**를 위한 긴급 실행 계획입니다.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          실행 계획 타임라인                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Phase A (2-3주)         Phase B (2-3주)         Phase C (2주)    Phase D (1주)│
│  ─────────────────       ─────────────────       ──────────────   ─────────────│
│  🎯 IDE 핵심 기능        🔨 빌드 시스템          🔧 파서 고도화   🔒 보안+안정화│
│  • Go to Definition      • rsync 동기화          • Include 병합   • keytar 통합│
│  • Find All References   • bitbake 실행          • 매크로 해석    • 버그 수정  │
│  • 자동완성              • 로그 스트리밍         • tree-sitter    • 성능 최적화│
│  • Hover 정보            • 아티팩트 다운로드     • 순환 참조 감지 │             │
│                                                                                 │
│  ════════════════════════════════════════════════════════════════════════════  │
│        ↑                      ↑                      ↑              ↑          │
│    Alpha 0.5              Beta 0.6               Beta 0.7      RC 0.8          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### 10.2 Phase A: IDE 핵심 기능 (예상 2-3주)

> **목표**: "개발자가 실제로 쓰고 싶은 에디터"  
> **완료 조건**: Ctrl+클릭 정의 이동, Ctrl+Space 자동완성 동작

#### A-01: Go to Definition (정의로 이동) ⭐ 최우선

| 항목 | 내용 |
|------|------|
| **설명** | 심볼(노드, 매크로, 변수)을 Ctrl+클릭하면 정의된 위치로 이동 |
| **대상 파일** | .dts, .dtsi, .bb, .bbappend, .h |
| **예상 기간** | 3-4일 |

**지원해야 할 패턴:**

```dts
// 1. DTS 라벨 참조
uart0: serial@401C8000 { ... }    // 정의
&uart0 { status = "okay"; }       // Ctrl+클릭 → 정의로 이동

// 2. phandle 참조
clocks = <&clk_uart 0>;           // Ctrl+클릭 → clk_uart 정의로

// 3. include 파일
#include "s32g274a.dtsi"          // Ctrl+클릭 → 파일 열기
/include/ "common.dtsi"           // Ctrl+클릭 → 파일 열기

// 4. C/H 매크로
S32_PINMUX(...)                   // Ctrl+클릭 → #define 위치로
```

**구현 작업:**

1. `monaco.languages.registerDefinitionProvider('dts', ...)` 등록
2. `IndexDatabase`에서 심볼 정의 위치 조회 API
3. 파일 경로 해석 (상대/절대 경로)
4. 에디터에서 해당 파일 열기 + 라인 이동

**테스트 케이스:**

- [ ] `&uart0` 클릭 → `uart0:` 정의 라인으로 이동
- [ ] `<&clk_uart 0>` 클릭 → `clk_uart:` 정의로 이동
- [ ] `#include "xxx.dtsi"` 클릭 → 파일 열기
- [ ] 정의가 여러 파일에 있을 때 선택 다이얼로그

---

#### A-02: Find All References (모든 참조 찾기) ⭐ 최우선

| 항목 | 내용 |
|------|------|
| **설명** | 심볼이 사용되는 모든 위치를 검색하여 목록으로 표시 |
| **단축키** | Shift+F12 또는 우클릭 → "Find All References" |
| **예상 기간** | 2-3일 |

**지원해야 할 패턴:**

```
"uart0" 검색 결과:
┌─────────────────────────────────────────────────────┐
│ 📋 References (4개)                                 │
├─────────────────────────────────────────────────────┤
│ 📄 s32g274a.dtsi:45                                │
│    uart0: serial@401C8000 {        [정의]          │
├─────────────────────────────────────────────────────┤
│ 📄 s32g274ardb2.dts:12                             │
│    &uart0 {                        [오버라이드]    │
├─────────────────────────────────────────────────────┤
│ 📄 s32g274ardb2.dts:89                             │
│    uart-device = <&uart0>;         [phandle 참조]  │
├─────────────────────────────────────────────────────┤
│ 📄 board-common.dtsi:23                            │
│    &uart0 { pinctrl-0 = ... }      [오버라이드]    │
└─────────────────────────────────────────────────────┘
```

**구현 작업:**

1. `monaco.languages.registerReferenceProvider('dts', ...)` 등록
2. `IndexDatabase.findReferences(symbol)` 메서드 추가
3. 검색 결과 UI 패널 (클릭 시 해당 위치로 이동)
4. 정의/사용/오버라이드 구분 표시

**테스트 케이스:**

- [ ] 노드 정의에서 Shift+F12 → 모든 사용 위치 표시
- [ ] 참조 클릭 → 해당 파일:라인으로 이동
- [ ] 결과 필터링 (파일 타입별)

---

#### A-03: DTS 자동완성 (CompletionProvider)

| 항목 | 내용 |
|------|------|
| **설명** | Ctrl+Space 또는 타이핑 중 자동으로 제안 표시 |
| **예상 기간** | 3-4일 |

**제안 항목:**

```dts
// 1. 노드 이름 자동완성
&ua|                    // 입력 중
  ├── uart0
  ├── uart1
  └── uart2

// 2. 속성 이름 자동완성
compatible = "nxp,|"    // 입력 중
  ├── nxp,s32-linflexuart
  ├── nxp,s32-gpio
  └── nxp,s32-i2c

// 3. status 값 자동완성
status = "|"            // 입력 중
  ├── okay
  └── disabled

// 4. phandle 참조 자동완성
clocks = <&|            // 입력 중
  ├── clk_uart
  ├── clk_i2c
  └── clk_spi
```

**구현 작업:**

1. `monaco.languages.registerCompletionItemProvider('dts', ...)` 등록
2. 컨텍스트 감지 (속성 이름 vs 값 vs phandle)
3. `IndexDatabase`에서 후보 심볼 조회
4. 스니펫 지원 (자주 사용하는 노드 템플릿)

---

#### A-04: BitBake 자동완성

| 항목 | 내용 |
|------|------|
| **설명** | .bb/.bbappend 파일에서 변수/함수/태스크 자동완성 |
| **예상 기간** | 2-3일 |

**제안 항목:**

```bitbake
# 1. 변수 자동완성
SRC_|                   // 입력 중
  ├── SRC_URI
  ├── SRCREV
  └── SRC_URI_append

# 2. 태스크 자동완성
do_|                    // 입력 중
  ├── do_compile
  ├── do_install
  └── do_configure

# 3. 클래스 inherit
inherit |               // 입력 중
  ├── cmake
  ├── autotools
  └── kernel
```

---

#### A-05: Hover 정보 표시

| 항목 | 내용 |
|------|------|
| **설명** | 심볼 위에 마우스 올리면 정의/값 정보 표시 |
| **예상 기간** | 1-2일 |

**예시:**

```
┌────────────────────────────────────┐
│ uart0                              │
│ ─────────────────────────────────  │
│ 📍 정의: s32g274a.dtsi:45         │
│ 📦 타입: serial node               │
│ 📋 compatible: nxp,s32-linflexuart │
│ 📍 reg: 0x401C8000                 │
└────────────────────────────────────┘
```

---

#### A-06: Breadcrumb 내비게이션

| 항목 | 내용 |
|------|------|
| **설명** | 에디터 상단에 현재 위치 경로 표시 |
| **예상 기간** | 1일 |

**예시:**

```
📁 s32g274ardb2.dts > 🔷 / > 🔷 soc > 🔷 aips1 > 🔷 uart0
```

---

### 10.3 Phase B: 빌드 시스템 (예상 2-3주)

> **목표**: "30분 내 첫 빌드 성공"  
> **완료 조건**: UI에서 빌드 시작 → 로그 확인 → 이미지 다운로드

#### B-01: rsync 동기화

| 항목 | 내용 |
|------|------|
| **설명** | 로컬 ↔ 서버 간 파일 증분 동기화 |
| **예상 기간** | 4-5일 |

**기능:**

- 로컬 → 서버 업로드 (수정된 파일만)
- 서버 → 로컬 다운로드
- exclude 규칙 (tmp/, sstate-cache/ 자동 제외)
- Windows 지원 (cwRsync 또는 WSL rsync)
- 진행률 표시

---

#### B-02: bitbake 빌드 트리거

| 항목 | 내용 |
|------|------|
| **설명** | 서버에서 bitbake 명령 실행 |
| **예상 기간** | 2-3일 |

**기능:**

- 환경 변수 설정 (source oe-init-build-env)
- 타겟 선택 UI (MACHINE, IMAGE)
- 빌드 명령 실행 (bitbake core-image-minimal 등)
- 빌드 중단/재시작

---

#### B-03: 로그 스트리밍

| 항목 | 내용 |
|------|------|
| **설명** | 실시간 빌드 로그 표시 |
| **예상 기간** | 2일 |

**기능:**

- SSH exec 실시간 출력
- ANSI 컬러 코드 처리
- 가상 스크롤링 (대용량 로그 성능)
- 에러 라인 하이라이트

---

#### B-04: 빌드 콘솔 UI

| 항목 | 내용 |
|------|------|
| **설명** | 빌드 로그 전용 터미널 UI |
| **예상 기간** | 2-3일 |

**기능:**

- 실시간 로그 표시
- 로그 검색 (Ctrl+F)
- 로그 필터 (ERROR/WARNING만)
- 로그 저장

---

#### B-05: 아티팩트 다운로드

| 항목 | 내용 |
|------|------|
| **설명** | 빌드 결과물 다운로드 |
| **예상 기간** | 2일 |

**기능:**

- deploy/images 디렉토리 스캔
- 파일 목록 표시 (크기, 날짜)
- SFTP 다운로드
- sha256 체크섬 검증

---

### 10.4 Phase C: 파서 고도화 (예상 2주)

> **목표**: "정확한 구문 분석"  
> **완료 조건**: 분산된 DTS 파일 통합 트리 표시

#### C-01: Include 병합 파싱

| 항목 | 내용 |
|------|------|
| **설명** | 여러 DTS 파일을 하나의 트리로 통합 |
| **예상 기간** | 4-5일 |

**예시:**

```
s32g274ardb2.dts
├── #include "s32g274a.dtsi"
│   ├── #include "s32g.dtsi"
│   └── #include "s32g-pinctrl.dtsi"
└── #include "s32g274ardb2-pinctrl.dtsi"

→ 모든 파일 병합하여 최종 Device Tree 표시
→ 오버라이드된 속성 표시 (원본값 / 최종값)
```

---

#### C-02: dt-bindings 매크로 해석

| 항목 | 내용 |
|------|------|
| **설명** | C 헤더의 #define 값을 DTS에서 해석 |
| **예상 기간** | 3일 |

**예시:**

```c
// dt-bindings/pinctrl/s32-pinmux.h
#define S32_PINMUX(a, b, c) ((a << 16) | (b << 8) | c)
```

```dts
// DTS에서 사용
pinctrl-0 = <S32_PINMUX(1, 2, 3)>;  // → 0x010203 으로 계산
```

---

### 10.5 Phase D: 보안 + 안정화 (예상 1주)

> **목표**: "안전하고 안정적인 앱"

#### D-01: keytar 통합

| 항목 | 내용 |
|------|------|
| **설명** | SSH 비밀번호를 OS Keychain에 암호화 저장 |
| **예상 기간** | 1-2일 |
| **현재 문제** | localStorage에 평문 저장 (보안 취약) |

---

#### D-02: 에러 처리 강화

| 항목 | 내용 |
|------|------|
| **설명** | 사용자 친화적 에러 메시지 |
| **예상 기간** | 1일 |

---

#### D-03: 인덱싱 안정화

| 항목 | 내용 |
|------|------|
| **설명** | FOREIGN KEY 에러 등 버그 수정 |
| **예상 기간** | 1-2일 |

---

### 10.6 성능 목표 (핵폭탄 급 기준)

| 측정 항목 | 목표 | 측정 방법 |
|----------|------|----------|
| 검색 속도 | < 100ms | 10만 심볼에서 쿼리 |
| 정의 점프 | < 500ms | Ctrl+클릭 응답 시간 |
| 자동완성 | < 200ms | 제안 표시까지 |
| 파일 열기 | < 1초 | 1MB 파일 기준 |
| 빌드 로그 | 끊김 없음 | 10만 줄 로그 처리 |
| 인덱싱 | < 5분 | Yocto 전체 (50만 파일) |

---

### 10.7 진행 상태 추적

| ID | 태스크 | 상태 | 완료일 |
|----|--------|------|--------|
| A-01 | Go to Definition | ✅ 완료 | 2026-01-29 |
| A-02 | Find All References | ✅ 완료 | 2026-01-29 |
| A-03 | DTS 자동완성 | ✅ 완료 | 2026-01-29 |
| A-04 | BitBake 자동완성 | ✅ 완료 | 2026-01-29 |
| A-05 | Hover 정보 | ✅ 완료 | 2026-01-29 |
| A-06 | Breadcrumb | ✅ 완료 | 2026-01-29 |
| B-01 | rsync 동기화 | ⬜ 대기 | - |
| B-02 | bitbake 빌드 | ⬜ 대기 | - |
| B-03 | 로그 스트리밍 | ⬜ 대기 | - |
| B-04 | 빌드 콘솔 UI | ⬜ 대기 | - |
| B-05 | 아티팩트 다운로드 | ⬜ 대기 | - |
| C-01 | Include 병합 | ✅ 완료 | 2026-01-29 |
| C-02 | 매크로 해석 | ✅ 완료 | 2026-01-29 |
| D-01 | keytar 통합 | ⬜ 대기 | - |
| D-02 | 에러 처리 | ⬜ 대기 | - |
| D-03 | 인덱싱 안정화 | ✅ 완료 | 2026-01-29 |

### 10.8 추가 완료 항목 (2026-01-29)

> 기존 ROADMAP에 없었으나 핵폭탄 급 성능 달성을 위해 추가 구현된 항목

| ID | 태스크 | 상태 | 설명 |
|----|--------|------|------|
| X-01 | 서버측 고속 인덱싱 | ✅ 완료 | Python 스크립트로 서버에서 직접 인덱싱 (~30초) |
| X-02 | 인덱스 서버 공유 | ✅ 완료 | 팀원 간 인덱스 공유 (서버에 저장/로드) |
| X-03 | FTS5 검색 최적화 | ✅ 완료 | SQLite 전문검색으로 심볼 검색 < 100ms |
| X-04 | 파일 탐색기 개선 | ✅ 완료 | 더블클릭 폴더 진입, 상위 폴더 이동, 경로 검색 |
| X-05 | UI 인덱스 상태 개선 | ✅ 완료 | 서버 인덱스 감지 시 바로 완료 표시 |

### 10.9 다음 우선순위 작업

```
┌─────────────────────────────────────────────────────────────────┐
│                     다음 구현 우선순위                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ 완료 (2026-01-29)                                           │
│  ├── A-03: DTS 자동완성 ✅                                      │
│  ├── A-04: BitBake 자동완성 ✅                                  │
│  ├── A-05: Hover 정보 표시 ✅                                   │
│  ├── A-06: Breadcrumb 네비게이션 ✅                             │
│  ├── C-01: Include 병합 뷰 ✅                                   │
│  ├── C-02: dt-bindings 매크로 해석 ✅                           │
│  ├── 패널 리사이즈 (드래그) ✅                                   │
│  └── Toast 알림 시스템 ✅                                       │
│                                                                 │
│  🔴 긴급 (다음 목표)                                             │
│  ├── B-01: rsync 동기화 (4-5일)                                 │
│  ├── B-02: bitbake 빌드 트리거 (2-3일)                          │
│  └── B-03: 빌드 로그 스트리밍 (2일)                              │
│                                                                 │
│  🟢 개선 (이후 목표)                                             │
│  ├── C-01: Include 병합 파싱                                    │
│  ├── C-02: dt-bindings 매크로 해석                              │
│  └── D-01: keytar 통합 (보안)                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 10.10 현재 성능 지표

| 측정 항목 | 목표 | 현재 | 상태 |
|----------|------|------|------|
| 검색 속도 | < 100ms | ~50ms | ✅ 달성 |
| 정의 점프 | < 500ms | ~200ms | ✅ 달성 |
| 자동완성 | < 200ms | ~100ms | ✅ 달성 |
| Hover 정보 | < 300ms | ~50ms | ✅ 달성 |
| 파일 열기 | < 1초 | ~300ms | ✅ 달성 |
| 인덱싱 (서버) | < 5분 | ~30초 | ✅ 초과 달성 |
| 인덱스 크기 | - | 76,644 파일 / 6,073,025 심볼 | ✅ |

---

> **문서 종료**  
> 본 로드맵은 프로젝트 진행에 따라 지속적으로 업데이트됩니다.  
> 최신 버전은 프로젝트 저장소의 `ROADMAP.md`를 참조하세요.
