Yocto BSP Studio (Electron) — 요구사항 문서 (PRD / SRS)
0. 문서 목적

본 문서는 Yocto 기반 Linux BSP 개발을 초보자도 수행 가능한 수준으로 단순화·표준화하는 전용 데스크탑 툴( Electron 앱 )의 요구사항을 정의한다.
목표는 “SSH로 서버 접속 → 명령어 숙련 → 파일 위치 암기” 중심의 작업을 GUI 중심의 워크플로로 바꾸고, 실수 가능성을 시스템적으로 제거(가드레일)하여 재현성·품질·속도를 동시에 끌어올리는 것이다.

1. 비전 / 핵심 가치
1.1 비전

BSP 개발의 진입장벽을 파괴한다.

초보자가 “이유를 몰라도” 안전하게 올바른 결과를 내도록 돕고, 숙련자에겐 “속도와 재현성”을 제공한다.

1.2 핵심 가치(Non-negotiable)

한눈에 보이기: 레이어/레시피/설정/커널/아티팩트를 구조적으로 시각화

실수 방지: 위험한 변경(벤더 레이어 직접 수정 등)은 차단 또는 강력 경고

재현성: 모든 빌드가 “누가/언제/무엇을/왜” 했는지 기록되고 다시 만들 수 있음

초보자 가이드 내장: 용어·규칙·추천 흐름이 툴 안에서 완결

서버는 빌드 전용: 로컬에서 편집 → 서버에서 빌드 → 로컬로 아티팩트 다운로드

2. 사용자 정의
2.1 대상 사용자(Persona)

초보자: Yocto/BitBake 경험이 거의 없음. BSP를 “설계”하고 싶지만 명령어/파일구조를 모름.

중급자: 레시피/레이어/커널 설정을 어느 정도 이해. 반복 작업과 실수를 줄이고 싶음.

숙련자: CI/재현성/규모 확장을 중요시. 규칙 기반 자동화·검증·기록이 필요.

2.2 사용자 목표

conf 파일 수정, defconfig/fragment 적용, 레시피 추가/패치 적용, 빌드 실행, sdcard 이미지 다운로드까지 툴 내에서 흐름으로 수행

변경이 실제 빌드 결과에 반영되는지 확실하게 검증받기

문제 발생 시 “무엇을 봐야 하는지” 툴이 안내하기

3. 범위 정의
3.1 In Scope (1차 범위)

로컬 프로젝트 열기(레이어/레시피/설정 자동 인식)

로컬 편집(코드/레시피/conf/커널 설정 파일)

서버 동기화(optional / deferred, rsync 기반, 변경분)

원격 빌드 트리거(bitbake) + 로그 스트리밍

빌드 결과 아티팩트 자동 수집 + 로컬 다운로드

Yocto 지식 내장 가이드(초보자 모드)

위험/오류 진단(설정 충돌, 레이어 누락, 커널 provider 감지 등)

3.2 Out of Scope (후순위/차기)

보드 플래싱(USB/NFS/OTA) 자동화

보드 부팅 로그/시리얼 콘솔 통합

멀티 서버 빌드 팜/스케줄러 통합

완전한 코드 에디터 구현(초기에는 내장 편집은 최소, 외부 에디터 연동 허용)

4. 성공 기준 (정량/정성)
4.1 정량 KPI

초보자 온보딩: 30분 내 첫 빌드 성공(가이드 따라)

설정 변경 후 반영 검증: “변경→빌드→아티팩트 다운로드” 5 클릭 이내

흔한 실수(벤더 레이어 직접 수정, bblayers 오타, MACHINE 불일치)로 인한 실패율 50% 이상 감소

4.2 정성 KPI

“무엇을 어떻게 해야 할지 모르겠다”가 아니라 “툴이 다음 행동을 제안한다”

팀 내 빌드/설정 표준이 문서가 아니라 툴의 규칙으로 강제된다

5. 시스템 구성(최소 아키텍처)
5.1 구성 요소

Electron App (Local)

UI/워크플로/프로젝트 인덱싱

SSH 연결 관리

rsync 동기화 제어 (optional / deferred)

빌드 요청/로그 스트리밍/다운로드

로컬 메타데이터 DB(인덱스/히스토리)

Build Server (Remote)

Yocto 빌드 환경 유지(DL_DIR, SSTATE_DIR 고정)

Workspace 디렉토리(소스 동기화 대상)

빌드 실행 및 결과 job 디렉토리 정리

통신은 1차 MVP에서 SSH + SFTP/scp (rsync optional / deferred)로 완결한다. (서버 데몬 없이)

5.2 디렉토리 규칙(서버)

/workspaces/<project>/ : 소스/레이어/빌드 스크립트

/build-cache/downloads, /build-cache/sstate-cache : 공유 캐시(프로젝트 간 재사용 가능)

/artifacts/<project>/<job-id>/ : 아티팩트 + manifest 저장

6. 핵심 워크플로(사용자 여정)
6.1 프로젝트 시작(초보자)

“새 프로젝트” → 서버 SSH 등록(키/포트)

BSP 소스 폴더 선택(로컬)

서버 워크스페이스 경로 지정

“초기 진단 실행” → 레이어/머신/커널 provider/이미지 타겟 자동 감지

“추천 빌드 버튼”으로 첫 빌드

6.2 일반 개발(중급/숙련)

conf 수정 → 자동 동기화 → 원격 빌드 → 아티팩트 다운로드

커널 설정 변경(추천 방식) → bbappend 자동 생성 → 반영 검증

레시피 패치 추가 → patch 파일 생성/적용 → 빌드로 검증

7. 기능 요구사항 (Functional Requirements)
7.1 연결/인증

FR-SSH-01: 서버 SSH 연결(키 기반) 지원

FR-SSH-02: 연결 테스트(권한, 디스크 여유, 필요한 커맨드 존재 확인)

FR-SSH-03: 프로젝트별 서버 프로필 저장(암호 저장은 OS 키체인 사용)

7.2 프로젝트 인식/인덱싱

FR-PRJ-01: bblayers.conf, local.conf, 레이어 구조 자동 탐색

FR-PRJ-02: 레이어 목록/우선순위 표시(layer.conf 파싱)

FR-PRJ-03: 레시피 인덱스 생성(서버에서 아래 명령 결과를 수집)

bitbake-layers show-layers

bitbake-layers show-recipes

FR-PRJ-04: 핵심 변수 인덱싱(서버에서)

bitbake -e <image> 또는 bitbake -e virtual/kernel 기반

최소: MACHINE, DISTRO, IMAGE_FSTYPES, PREFERRED_PROVIDER_virtual/kernel 등

7.3 편집(로컬)

FR-EDIT-01: conf 파일 편집(구문 하이라이트, 스니펫, 템플릿)

FR-EDIT-02: 레시피(.bb/.bbappend/.inc) 편집

FR-EDIT-03: 패치 파일 관리(추가/삭제/적용 대상 표시)

FR-EDIT-04: 커널 설정 편집(아래 7.4 참조)

7.4 커널 provider 자동 감지 및 커널 설정 관리(중요)

FR-KRN-01: virtual/kernel provider 자동 감지

bitbake -e virtual/kernel에서 PN, FILE, PREFERRED_PROVIDER_virtual/kernel 파싱

FR-KRN-02: “벤더 커널 레시피 감지 시” 경고 및 추천 워크플로 제공

벤더 레이어 레시피 직접 수정 금지(기본)

기본 경로: meta-local 생성 → linux-s32_%.bbappend 생성 → fragment/patch로 반영

FR-KRN-03: defconfig/fragment 위치 자동 탐지

bitbake -e virtual/kernel에서 SRC_URI, KERNEL_DEFCONFIG, S, WORKDIR 등을 분석

FR-KRN-04: 커널 설정 변경 방식 3종 지원(프로젝트 정책에 따라 선택)

defconfig 직접 변경(가능하나 위험 표시)

config fragment 생성/관리(추천)

메뉴config 실행(서버에서) 후 결과 저장/추출(후순위)

FR-KRN-05: 변경 반영 검증 기능

“내가 바꾼 CONFIG가 최종 .config에 들어갔는지” 확인(서버에서 검증 커맨드 실행)

7.5 동기화

FR-SYNC-01 (optional / deferred): rsync 기반 증분 동기화(저장 시 자동/수동 옵션)

FR-SYNC-02 (optional / deferred): 기본 exclude 규칙 제공

tmp/, downloads/, sstate-cache/, build/ 산출물 등

FR-SYNC-03 (optional / deferred): 동기화 결과 리포트(전송 파일/충돌/실패 원인)

7.6 원격 빌드 및 로그

FR-BLD-01: 이미지 타겟 선택 및 원격 bitbake 실행

FR-BLD-02: 로그 스트리밍(실시간)

FR-BLD-03: 빌드 옵션 제공

clean/cleansstate

-c compile, -c deploy 등

FR-BLD-04: 빌드 실패 시 “원인 후보” 자동 추정(초보자 모드)

레이어 누락, 변수 오타, 디스크 부족, 다운로드 실패 등

7.7 아티팩트 수집/다운로드

FR-ART-01: 빌드 완료 시 tmp/deploy/images/<machine>/에서 sdcard 이미지 후보 자동 탐지

FR-ART-02: job-id 폴더에 결과 복사 + manifest.json 생성(서버 스크립트)

job-id, 시간, git commit(optional), MACHINE, IMAGE, 파일 목록, sha256

FR-ART-03: 로컬 다운로드(폴더 지정, 중복 방지, 체크섬 검증)

FR-ART-04: 다운로드 히스토리/즐겨찾기(“이 이미지가 어떤 설정에서 나온 건지” 연결)

7.8 지식 내장(초보자 모드)

FR-GUIDE-01: 단계별 가이드(“다음에 뭘 해야 하는지”)

FR-GUIDE-02: 용어 사전(레이어/레시피/append/overlay/provider 등)

FR-GUIDE-03: 위험한 작업 차단 + 대안 제시

예: “벤더 레이어의 linux-s32.bb 수정” 시 → “meta-local bbappend로 하세요” 자동 생성 버튼 제공

FR-GUIDE-04: 추천 규칙(프로젝트 정책) 적용

예: 커널 설정은 fragment로만 허용, local.conf 변경은 특정 항목만 허용 등

7.9 히스토리/감사(재현성)

FR-HIST-01: 모든 빌드에 대해:

변경된 파일 목록(가능하면 git diff 또는 파일 해시 기반)

실행된 명령

결과 아티팩트 sha256

서버 환경(메타데이터) 요약 기록

FR-HIST-02: “이 빌드 재현” 버튼(동일 설정/동일 타겟로 다시 빌드)

8. 비기능 요구사항 (NFR)
8.1 안정성

NFR-01: 빌드 중 앱 종료/네트워크 끊김 후에도 job 상태 복구 가능

NFR-02: 실패 내역은 사용자에게 “다음 행동”까지 안내

8.2 보안

NFR-SEC-01: SSH 키/비밀번호는 OS Keychain/보안 저장소 사용

NFR-SEC-02: 임의 명령 실행 기능은 제한(화이트리스트 기반) + 프로젝트 정책

NFR-SEC-03: 서버 경로/권한 검증(unsafe path 방지)

8.3 성능

NFR-PERF-01: 대형 레이어 구성에서도 인덱싱/검색이 끊기지 않아야 함

NFR-PERF-02: 로그 스트리밍이 UI를 멈추게 하지 않아야 함(백프레셔 처리)

8.4 이식성

NFR-PORT-01: Windows/Ubuntu에서 동작(우선 Windows)

NFR-PORT-02: 서버는 Linux(우분투 등) 가정

9. UI 요구사항(“Eclipse처럼”)
9.1 레이아웃

좌측: Project Explorer (Layers / Recipes / Kernel / Conf / Patches)

중앙: Editor/View (선택한 항목 뷰/편집)

우측: Inspector (선택 항목의 메타 정보: 우선순위, 오버라이드, 출처)

하단: Console/Logs + Problems(진단/경고) 탭

9.2 필수 패널

Dashboard(프로젝트 상태, 커널 provider, MACHINE, 최근 빌드)

Layers(우선순위/시리즈/경로)

Recipes(검색/필터/레이어별)

Config(변수 검색, 최종값, 출처)

Kernel Config(감지 결과 + 추천 흐름 + fragment/defconfig 관리)

Build(타겟/옵션/로그)

Artifacts(다운로드/검증/manifest)

Problems(진단 결과, 해결 버튼)

10. “초보자도 BSP 설계 가능”을 위한 강제 장치(가드레일)

GR-01: 위험한 변경 감지 시 “차단 + 자동 대안 생성”

벤더 레이어 수정 → meta-local/ bbappend 생성 유도

GR-02: 설정 변경 시 영향 분석(가능 범위 내)

MACHINE 변경 시 deploy 경로/이미지명 변화 안내

GR-03: 빌드 실패 시, 로그에서 흔한 패턴을 탐지해 “원인 후보 TOP 3 + 해결 버튼”

GR-04: “정상 설정 베이스라인”을 저장하고, 현재 상태가 얼마나 벗어났는지 시각화

11. 리스크 / 난이도 높은 지점

R-01: Yocto 변수 오버라이드/우선순위 추적은 복잡 → bitbake -e 파싱을 표준화해야 함

R-02: 벤더 커널 레시피마다 defconfig 적용 방식이 다름 → “자동 탐지 + 수동 규칙 등록” 둘 다 필요

R-03: Windows에서 rsync/ssh 환경 이슈 (only if rsync enabled) → 내장 rsync(예: cwRsync) 또는 자체 전송 모듈 고려

R-04: 프로젝트마다 정책이 다름 → “정책 파일(policy.yaml)”로 규칙을 외부화해야 확장 가능

12. 로드맵(권장)
Phase 0 — 기반(MVP)

SSH/SFTP (rsync optional), 프로젝트 열기, conf 편집, 원격 빌드, 로그, 아티팩트 다운로드, manifest 기록

Phase 1 — Yocto 인덱스/가이드 강화

레이어/레시피 인덱스

변수 검색(최종값/출처)

초보자 모드(진단/해결 버튼)

Phase 2 — 커널 설정 “완전 자동화”

vendor kernel 감지

bbappend/fragment 자동 생성

CONFIG 반영 검증 자동화

Phase 3 — 팀/표준/재현성 폭발

정책 파일로 규칙 강제

빌드 이력/재현 버튼

(옵션) Git 연동(커밋/태그/릴리즈)

13. 수용 기준(Acceptance Criteria) 예시

AC-01: 사용자가 local.conf에서 IMAGE_FSTYPES를 바꾸고 빌드하면, 아티팩트 탭에서 새 이미지가 자동 감지되어 다운로드 가능해야 한다.

AC-02: virtual/kernel이 linux-s32인 프로젝트에서, 사용자가 커널 설정 변경을 시도하면 툴은 기본적으로 bbappend + fragment 방식을 제안하고 자동 생성할 수 있어야 한다.

AC-03: 빌드 실패 시 Problems 탭에 최소 1개 이상의 “원인 후보”와 “다음 행동”이 표시되어야 한다.

AC-04: 빌드 1회 수행 후, 해당 job의 manifest.json에 MACHINE/IMAGE/파일 sha256/명령/시간이 기록되어야 한다.

14. 용어(Glossary, 최소)

Layer, Recipe(.bb), Append(.bbappend), Conf, MACHINE, DISTRO, Provider(virtual/kernel), SSTATE, DL_DIR, WORKDIR, deploy/images, fragment, defconfig, bitbake

15. 부록: 현재 확인된 사실(프로젝트 전제)

Yocto 기반 BSP

서버는 빌드 전용

커널 provider: linux-s32 (벤더 커널 레시피)

FILE: .../meta-alb/recipes-kernel/linux/linux-s32_5.10.bb
