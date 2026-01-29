# Yocto BSP Studio — Build Job & manifest.json Specification

## 목적
모든 빌드 결과를 **완전 재현 가능**하게 만들기 위한 job 구조와 manifest 정의.

---

## 1. Job 디렉토리 구조
```
/artifacts/<project>/<job-id>/
 ├─ manifest.json
 ├─ images/
 │   ├─ *.wic.gz
 │   └─ *.img
 └─ logs/
     └─ bitbake.log
```

---

## 2. Job ID 규칙
```
<YYYYMMDD-HHMMSS>-<machine>-<image>
```

---

## 3. manifest.json 스키마
```json
{
  "job_id": "20260128-103012-s32g274a-custom-image",
  "project": "s32g-bsp",
  "machine": "s32g274a",
  "image": "custom-image",
  "kernel_provider": "linux-s32",
  "timestamp": "2026-01-28T10:30:12+09:00",
  "git": {
    "commit": "abc123",
    "branch": "main",
    "dirty": true
  },
  "build_command": "bitbake custom-image",
  "artifacts": [
    {
      "file": "custom-image-s32g274a.wic.gz",
      "sha256": "..."
    }
  ],
  "environment": {
    "DISTRO": "fsl-auto",
    "IMAGE_FSTYPES": "wic.gz"
  }
}
```

---

## 4. 서버 Job 실행 흐름
1. job-id 생성
2. bitbake 실행
3. deploy/images에서 결과 수집
4. sha256 계산
5. manifest.json 생성

---

## 5. 실패 Job 처리
- 로그 보존
- manifest에 error 필드 기록
- UI에서 재시도 버튼 제공

---

## 6. 재현(Rebuild) 요구사항
- manifest.json만 있으면 동일 빌드 가능
- 툴은 manifest 기반 rebuild 버튼 제공
