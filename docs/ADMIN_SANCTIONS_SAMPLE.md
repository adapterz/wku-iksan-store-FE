# 회원 제재 로컬 샘플

기존 FE develop의 레이아웃·공통 글꼴·컴포넌트(`js/api.js`)를 재사용한 독립 샘플입니다.
브랜치: prototype/admin-sanctions-page. 기존 index.html, product.html, 공통 JS는 변경하지 않았습니다.
review-sample(prototype/review-pages), admin-inquiries-sample(PR #79)과 동일한 구조를 따릅니다.

## 확인할 흐름

- `userId`를 입력해 해당 회원의 제재 이력을 조회합니다 — 경고/정지, 활성/해제됨/만료 상태를 배지로 구분해서 보여줍니다.
- 활성 정지 건에는 **조기 해제** 버튼이 붙고, 누르면 실제로 `PATCH /api/admin/sanctions/:id`를 호출해 상태를 `lifted`로 바꿉니다.
- 하단의 "새 제재 부여" 폼에서 경고/정지를 선택해 새 제재를 부여할 수 있습니다. 정지를 선택하면 종료 시각 입력란이 나타납니다.
- 같은 유저에게 경고가 이미 있는 상태에서 또 경고를 부여하려 하면 서버가 `409 WARNING_LIMIT_EXCEEDED`로 거부하고, 화면에 "이미 경고 이력이 있어 정지로 처리해야 합니다" 안내가 뜹니다(이슈 #90 7-2절).
- 회원 목록/검색 화면이 없어서 `userId`를 직접 입력해야 합니다. 문의하기 샘플(PR #79)의 sanctionId 수동 입력과 같은 수준의 임시 방편입니다 — 실제 화면 연결 시 회원 검색 UI가 별도로 필요합니다.
- 레이아웃은 기존 430px 모바일 프레임을 그대로 유지합니다.

## 로컬 실행

```powershell
$env:ADMIN_BE_ROOT = 'C:\path\to\wku-iksan-store-BE'
$env:ADMIN_DB_ENV_FILE = 'C:\path\to\local-db.env'
node scripts/preview-admin-sanctions.cjs
```

http://127.0.0.1:8090/admin-sanctions-sample.html

- 로그인 게이트에서 **샘플 관리자 계정으로 로그인**을 누르면 로컬 전용 고정 관리자 계정으로 로그인합니다.
- `admin_sanctions_preview_랜덤값` DB를 새로 생성해 관리자 1명, 일반 유저 3명(제재 이력 있음/활성 정지/이력 없음)을 채웁니다.
- 문의하기 샘플과 포트가 겹치지 않도록 기본 포트는 8090입니다(문의하기는 8089).
- DB 접속은 localhost 계열만 허용하며, 웹서버는 127.0.0.1에만 바인딩합니다.
- Ctrl+C 정상 종료 시 임시 DB를 제거합니다.

## 확인

```powershell
node --check public/js/admin-sanctions-sample.js
node scripts/test-admin-sanctions-preview.cjs
```

브라우저에서는 이력 있는 유저 조회 → 활성 정지 조기 해제(실제 반영 확인) → 정지 폼에서 종료 시각 입력란 노출 → 이력 없는 유저에게 새 제재 부여까지 직접 확인했습니다.
API 검증 스크립트(16건)는 경고 중복 거부, 과거 종료 시각 거부, 존재하지 않는 유저/제재 거부까지 포함합니다.

## 현재 검토 요청 범위와 후속 작업

- 이 PR도 독립 샘플 초안입니다. 우선 miku의 진행 중인 작업과 파일·기능 범위가 겹치는지만 확인합니다.
- 의존 BE: 회원 제재 API https://github.com/adapterz/wku-iksan-store-BE/pull/99 (병합됨)
- 설계: https://github.com/adapterz/wku-iksan-store-BE/issues/90 (7절)
- 아직 남은 사항: 회원 검색 UI(현재는 userId 직접 입력), 문의하기 샘플의 sanctionId 입력란과 연결(제재 이의제기 승인 시 여기서 조회한 sanctionId를 바로 쓸 수 있게)
- 운영용 완성 페이지가 아니므로 즉시 머지·배포하지 않습니다.
