# Yocto BSP Studio — Kernel Configuration Strategy (Vendor Kernel)

## 목적
벤더 커널 환경에서도 **안전하고 재현 가능한 커널 설정 변경**을 보장한다.

---

## 1. 커널 Provider 감지
```bash
bitbake -e virtual/kernel
```

필수 파싱 항목:
- PN
- FILE
- PREFERRED_PROVIDER_virtual/kernel
- SRC_URI
- KERNEL_DEFCONFIG

---

## 2. 전략 분류
### 2.1 Strategy A — Fragment (권장)
- meta-local/recipes-kernel/linux/linux-*.bbappend
- files/*.cfg 사용
```bitbake
SRC_URI += "file://myfeature.cfg"
```

장점:
- 벤더 업데이트 안전
- 변경 추적 용이

---

### 2.2 Strategy B — Defconfig 직접 관리
- vendor 커널에서만 제한 허용
- 강력 경고 표시

---

### 2.3 Strategy C — Patch
- Kconfig/소스 구조 변경 시 사용
- git-format-patch 기반

---

## 3. 자동 탐지 로직
1. SRC_URI에 defconfig/fragment 존재 여부
2. KERNEL_DEFCONFIG 유무
3. 없으면 fragment 전략 자동 추천

---

## 4. Electron 툴 동작 규칙
- vendor 커널 감지 시:
  - defconfig 직접 수정 차단(기본)
  - fragment 생성 버튼 제공
- CONFIG 변경 후:
  - 서버에서 최종 .config 검증
  - 반영 여부 UI 표시

---

## 5. 초보자 보호 장치
- CONFIG_* 검색 UI 제공
- 의미 설명(HELP 텍스트)
- 위험 옵션 경고

---

## 6. 검증 단계
```bash
bitbake virtual/kernel -c compile -f
grep CONFIG_MY_FEATURE .config
```

툴은 이 과정을 자동화해야 한다.
