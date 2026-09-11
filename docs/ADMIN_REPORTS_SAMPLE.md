# 리뷰 신고 모더레이션 로컬 샘플

기존 FE develop의 레이아웃·공통 글꼴·컴포넌트(`js/api.js`)를 재사용한 독립 샘플입니다.
브랜치: prototype/admin-reports-page. 기존 index.html, product.html, 공통 JS는 변경하지 않았습니다.
admin-inquiries-sample(PR #79), admin-sanctions-sample(PR #81), admin-products-sample(PR #82)과 동일한 구조를 따릅니다.

## 확인할 흐름

- 신고 큐를 **대기 중 / 기각 / 숨김 처리** 3개 탭으로 조회합니다(`GET /api/admin/reports?status=`).
- 대기 중인 신고에는 **기각**과 **리뷰 숨김 처리** 버튼이 붙습니다. 숨김 처리는 되돌리려면 리뷰 담당자 쪽 복구 API를 따로 타야 하는 조치라, 클릭 시 확인 한 번을 더 요구합니다.
- 처리 버튼은 클릭 즉시 비활성화됩니다 — 같은 신고를 연타로 두 번 처리 요청하는 걸 막기 위함입니다(서버가 같은 상태로의 재요청 자체를 막지는 않습니다).
- 신고된 리뷰가 이미 삭제됐거나(`reviewId === null`) 신고자가 탈퇴했으면(`reporterId === null`) "삭제된 리뷰"/"탈퇴한 사용자"로 안내합니다 — 두 FK 모두 `ON DELETE SET NULL`이라 신고 기록과 스냅샷은 그대로 남습니다(이슈 #90 6-2절).

## 이 샘플에서 특히 신경 쓴 보안 포인트

- **저장형 XSS**: `reviewContentSnapshot`(리뷰 작성자가 쓴 원문)과 `reason`(신고자가 쓴 사유)은 둘 다 일반 사용자가 자유 입력한 텍스트이고, 그대로 `innerHTML`에 꽂으면 관리자가 큐를 열어보는 순간 스크립트가 실행되는 공격 벡터가 됩니다. 두 값 모두 `escapeHtml()`을 거쳐서만 렌더링합니다. 테스트 픽스처에 `<script>`/`<img onerror>`가 섞인 신고를 실제로 하나 심어뒀습니다(`test-admin-reports-preview.cjs`가 API 응답에는 원본 그대로 남아있는지 확인 — 이스케이프는 렌더링 책임이라 API가 텍스트를 임의로 바꾸면 오히려 증거가 훼손됩니다).
- **권한 경계(401 vs 403)**: `checkAndLoad()`가 `/api/auth/me`로 로그인 여부와 `role`을 함께 확인합니다. 로그인은 했지만 관리자가 아닌 사용자가 신고 큐에 들어오면 "서버 연결 실패"가 아니라 "관리자 권한이 필요합니다"로 안내됩니다. 테스트 스크립트가 실제로 이런 사용자로 로그인해 `403 FORBIDDEN_NOT_ADMIN`을 받는지까지 확인합니다(프리뷰 서버 전용 `/__preview/login-as-user` 라우트).
- **상태 되돌리기/우회 시도**: `PATCH /api/admin/reports/:id`는 `status`를 `dismissed`/`actioned`로만 바꿀 수 있고 `pending`으로 되돌릴 수 없습니다(신고를 다시 열어 은폐하는 흐름 방지). 테스트에서 `{status:'pending'}` 요청이 거부되는지 확인합니다.
- **마스 어사인먼트**: `{status:'dismissed', reviewId: 999999}`처럼 허용 안 된 필드를 끼워 보내면 서버가 body 전체를 `400 INVALID_REPORT_BODY`로 거부합니다 — FE가 실수로 여분 필드를 보내도, 악의적으로 다른 필드를 조작하려 해도 서버가 막아줍니다.
- **입력 검증**: 존재하지 않는 reportId(`404 REPORT_NOT_FOUND`), 양의 정수가 아닌 reportId(`400 INVALID_REPORT_ID`), 잘못된 status 필터(`400 INVALID_REPORT_STATUS`)까지 테스트로 확인합니다.

## 로컬 실행

```powershell
$env:ADMIN_BE_ROOT = 'C:\path\to\wku-iksan-store-BE'
$env:ADMIN_DB_ENV_FILE = 'C:\path\to\local-db.env'
node scripts/preview-admin-reports.cjs
```

http://127.0.0.1:8092/admin-reports-sample.html

- 로그인 게이트에서 **샘플 관리자 계정으로 로그인**을 누르면 로컬 전용 고정 관리자 계정으로 로그인합니다.
- `admin_reports_preview_랜덤값` DB를 새로 생성해 관리자 1명, 리뷰 작성자 1명, 신고자 1명 + 이후 탈퇴시킬 신고자 1명, 상품 2개, 리뷰·신고 6건(대기 4 / 기각 1 / 숨김처리 1, XSS 페이로드 1건·리뷰 삭제됨 1건·신고자 탈퇴 1건 포함)을 채웁니다.
- 다른 관리자 샘플과 포트가 겹치지 않도록 기본 포트는 8092입니다(문의하기 8089, 회원 제재 8090, 상품·카테고리 8091).
- DB 접속은 localhost 계열만 허용하며, 웹서버는 127.0.0.1에만 바인딩합니다.
- Ctrl+C 정상 종료 시 임시 DB를 제거합니다.

## 확인

```powershell
node --check public/js/admin-reports-sample.js
node scripts/test-admin-reports-preview.cjs
```

브라우저에서는 대기/기각/숨김처리 탭 전환 → XSS 페이로드가 포함된 신고가 순수 텍스트로만 보이는지(개발자 도구로 실행되지 않음을 확인) → 삭제된 리뷰/탈퇴한 사용자 안내 문구 → 기각·숨김 처리 버튼 클릭 후 목록에서 즉시 빠지는지까지 직접 확인했습니다.
API 검증 스크립트(20여 건)는 위 보안 포인트를 포함해 권한 경계, 입력 검증, 정상 처리 흐름을 모두 커버합니다.

## 현재 검토 요청 범위와 후속 작업

- 이 PR도 독립 샘플 초안입니다. 우선 miku의 진행 중인 작업과 파일·기능 범위가 겹치는지만 확인합니다.
- 의존 BE: 리뷰 신고 API https://github.com/adapterz/wku-iksan-store-BE/pull/95 (병합됨)
- 설계: https://github.com/adapterz/wku-iksan-store-BE/issues/90 (6절)
- 아직 남은 사항: 대시보드의 "신고 대기" 카드(PR #79)에서 이 화면으로 바로 연결되는 진입점 — 지금은 각자 별도 URL로만 접근 가능
- 운영용 완성 페이지가 아니므로 즉시 머지·배포하지 않습니다.
