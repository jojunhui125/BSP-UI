# Yocto BSP Studio — Policy Specification (policy.yaml)

## 목적
이 문서는 Yocto BSP Studio에서 **사용자 행동을 제어·유도·차단**하기 위한 정책 시스템을 정의한다.
정책은 “초보자 실수 방지 + 팀 표준 강제 + 재현성 확보”를 목표로 한다.

---

## 1. 정책 개요
정책은 프로젝트 단위로 적용되며, 툴은 정책을 **강제(deny)**, **경고(warn)**, **권장(recommend)** 수준으로 적용한다.

정책 파일은 프로젝트 루트에 위치한다.

```yaml
bsp_policy_version: 1.0
project_name: example-bsp
mode: strict   # strict | normal | expert
```

---

## 2. 레이어/레시피 수정 정책
### 2.1 벤더 레이어 보호
```yaml
layers:
  protected:
    - meta-alb
    - meta-nxp
```

- protected 레이어의 `.bb`, `.conf`, `.inc` 직접 수정은 **기본 차단**
- 대안:
  - meta-local 생성
  - bbappend 자동 생성

---

## 3. 커널 정책
### 3.1 커널 Provider 규칙
```yaml
kernel:
  provider:
    allow:
      - linux-s32
```

### 3.2 커널 설정 방식 강제
```yaml
kernel:
  config_strategy:
    default: fragment   # fragment | defconfig | patch
    forbid:
      - direct_vendor_defconfig_edit
```

---

## 4. conf 파일 정책
```yaml
conf:
  local.conf:
    allow_keys:
      - IMAGE_FSTYPES
      - DISTRO_FEATURES
      - EXTRA_IMAGE_FEATURES
```

허용되지 않은 키 변경 시 경고 또는 차단.

---

## 5. 빌드 정책
```yaml
build:
  allow_targets:
    - core-image-minimal
    - custom-image
  forbid_tasks:
    - cleansstate
```

---

## 6. 초보자 모드 보호 장치
```yaml
beginner_mode:
  enabled: true
  forbid:
    - bitbake_shell
    - manual_tmp_edit
```

---

## 7. 정책 위반 처리
- deny: 작업 차단 + 대안 버튼 제공
- warn: 경고 표시 + 계속 가능
- recommend: 가이드 표시

---

## 8. 정책 확장성
- 정책은 플러그인처럼 추가 가능
- CI/빌드 서버에서도 동일 정책 적용 가능
