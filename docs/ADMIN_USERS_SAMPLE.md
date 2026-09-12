# 회원 관리(역할 변경) 로컬 샘플

기존 FE develop의 레이아웃·공통 글꼴·컴포넌트(`js/api.js`)를 재사용한 독립 샘플입니다.
브랜치: prototype/admin-users-page. 기존 index.html, product.html, 공통 JS는 변경하지 않았습니다.
admin-inquiries-sample(PR #79), admin-sanctions-sample(PR #81), admin-products-sample(PR #82),
admin-reports-sample(PR #83)과 동일한 구조를 따릅니다.

## 확인할 흐름

- userId와 역할(일반 회원/관리자)을 선택해 `PATCH /api/admin/users/:id/role`을 호출합니다.
- 회원 검색 UI가 없어서(BE에 검색 API 자체가 아직 없음) userId를 직접 입력합니다 — 회원 제재 샘플(PR #81)의 userId 직접 입력과 같은 수준의 임시 방편입니다.
- 역할 변경은 관리자 권한을 주고 뺏는 민감한 조치라, 제출 전 확인 한 번을 더 받습니다.
- 자기 자신을 강등하려고 하면 `403 CANNOT_DEMOTE_SELF`로 거부되고 화면에 안내 문구가 뜹니다(이슈 #90 3-3절 핵심 규칙 — 마지막 관리자가 실수로 스스로 권한을 없애 아무도 관리자 기능에 못 들어가는 상황 방지).

## 이 샘플에서 특히 신경 쓴 보안 포인트

- **자기 자신 강등 방지**: 로그인한 관리자가 자기 자신의 role을 `user`로 바꾸려는 시도가 실제로 거부되는지 확인했습니다. 반대로 자기 자신을 다시 `admin`으로 "변경"(동일 role 재확인)하는 건 강등이 아니므로 막히지 않아야 한다는 것도 함께 확인했습니다.
- **다른 관리자는 강등 가능**: 위 규칙이 "본인"에게만 적용되고 "다른 관리자"를 강등하는 정상 동작까지 막지 않는지 확인했습니다 — 이 구분을 재현하려면 관리자가 최소 2명 있어야 해서, 픽스처에 관리자 계정을 2개(본인 + 다른 관리자) 넣었습니다.
- **권한 경계(401 vs 403)**: 다른 관리자 샘플들과 동일하게 `checkAndLoad()`가 `/api/auth/me`로 로그인 여부와 `role`을 함께 확인합니다. 로그인은 했지만 관리자가 아닌 사용자가 403으로 막히는지 테스트 전용 로그인 라우트로 직접 검증했습니다.
- **입력 검증**: 잘못된 role 값(`INVALID_ROLE`), 존재하지 않는 userId(`USER_NOT_FOUND`), 양의 정수가 아닌 userId(`INVALID_USER_ID`)까지 테스트로 확인했습니다.

## 로컬 실행

```powershell
$env:ADMIN_BE_ROOT = 'C:\path\to\wku-iksan-store-BE'
$env:ADMIN_DB_ENV_FILE = 'C:\path\to\local-db.env'
node scripts/preview-admin-users.cjs
```

http://127.0.0.1:8093/admin-users-sample.html

- 로그인 게이트에서 **샘플 관리자 계정으로 로그인**을 누르면 로컬 전용 고정 관리자 계정으로 로그인합니다.
- `admin_users_preview_랜덤값` DB를 새로 생성해 관리자 2명(본인 + 다른 관리자) + 일반 유저 1명을 채웁니다.
- 다른 관리자 샘플과 포트가 겹치지 않도록 기본 포트는 8093입니다(문의하기 8089, 회원 제재 8090, 상품·카테고리 8091, 리뷰 신고 8092).
- DB 접속은 localhost 계열만 허용하며, 웹서버는 127.0.0.1에만 바인딩합니다.
- Ctrl+C 정상 종료 시 임시 DB를 제거합니다.

## 확인

```powershell
node --check public/js/admin-users-sample.js
node scripts/test-admin-users-preview.cjs
```

브라우저에서는 일반 유저 승격 → 다른 관리자 강등 → 자기 자신 강등 시도(거부 확인)까지 직접 확인했습니다.
API 검증 스크립트(15여 건)는 위 보안 포인트를 포함해 권한 경계, 입력 검증, 정상 처리 흐름을 모두 커버합니다.

## 현재 검토 요청 범위와 후속 작업

- 이 PR도 독립 샘플 초안입니다. 우선 miku의 진행 중인 작업과 파일·기능 범위가 겹치는지만 확인합니다.
- 의존 BE: 관리자 인증/권한 API adapterz/wku-iksan-store-BE#93 (병합됨, 상품·카테고리 API와 같은 PR)
- 설계: adapterz/wku-iksan-store-BE#90 (3-3절)
- 회원 검색 UI는 아직 없습니다 — BE에 검색 API가 생기면(이슈 #90 16절 백로그) userId 직접 입력을 대체할 수 있습니다.
- 운영용 완성 페이지가 아니므로 즉시 머지·배포하지 않습니다.
