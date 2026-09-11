# 관리자 콘솔 로컬 샘플 (대시보드 + 문의하기)

기존 FE develop(bcf3953)의 레이아웃·공통 글꼴·컴포넌트(`js/api.js`)를 재사용한 독립 샘플입니다.
브랜치: prototype/admin-inquiries-page. 기존 index.html, product.html, 공통 JS는 변경하지 않았습니다.
review-sample(prototype/review-pages)과 동일한 구조를 따릅니다.

## 확인할 흐름

- 대시보드: 처리 대기(신고/문의/활성 정지 회원) + 상품 현황(활성/숨김/브랜드별) — 실제 `GET /api/admin/dashboard` 응답 그대로 표시.
- 문의 큐: 대기/답변완료 탭. 일반 문의는 답변만 등록, 제재 이의제기는 승인 시 `sanctionId`를 함께 보내 정지 해제까지 한 트랜잭션으로 처리(이슈 #90 8-1절).
- "문의 대기" 카드를 클릭하면 문의 큐로 바로 이동합니다.
- 레이아웃은 기존 430px 모바일 프레임을 그대로 유지합니다(초안에서 데스크톱용 960px로 넓혔다가, 프로젝트 전체가 모바일 우선이라는 방향에 맞춰 되돌렸습니다). 글꼴·색·버튼·카드 톤은 `css/style.css` 토큰을 그대로 재사용합니다.
- `sanctionId`는 이 샘플에서 관리자가 직접 입력합니다. 실제로는 `GET /api/admin/users/:id/sanctions`로 조회한 값을 보고 입력해야 하는데, 그 조회 화면(회원 제재)은 아직 없어서 임시로 입력창만 뒀습니다.
- 이 샘플 범위 밖: 상품·카테고리 관리, 리뷰 신고 큐, 회원 제재 부여/조회, 회원 관리(역할 변경) 화면.

## 로컬 실행

Node.js 및 관리자 API가 구현된 BE 체크아웃(feature/admin-dashboard 또는 그 이후), 로컬 MySQL 8.0.16+가 필요합니다.
아래 경로는 자신의 체크아웃과 로컬 DB 환경 파일 위치로 지정합니다. 환경 파일을 커밋하지 마세요.

```powershell
$env:ADMIN_BE_ROOT = 'C:\path\to\wku-iksan-store-BE'
$env:ADMIN_DB_ENV_FILE = 'C:\path\to\local-db.env'
node scripts/preview-admin-inquiries.cjs
```

http://127.0.0.1:8089/admin-inquiries-sample.html

- 로그인 게이트에서 **샘플 관리자 계정으로 로그인**을 누르면 로컬에서만 존재하는 고정 관리자 계정으로 로그인합니다. 실제 계정 비밀번호는 필요 없습니다.
- 로컬 환경 파일에서는 DB_HOST/PORT/USER/PASSWORD만 읽고, DB_NAME은 사용하지 않습니다.
- admin_inquiries_preview_랜덤값 DB를 새로 생성해 관리자 1명, 일반 유저 3명, 상품 5개(브랜드 5개, 1개 hidden), 활성 정지 2건·경고 1건, 신고 2건, 문의 3건(대기 2 + 답변완료 1)을 채웁니다.
- DB 접속은 localhost 계열만 허용하며, 웹서버는 127.0.0.1에만 바인딩합니다.
- 샘플 로그인 엔드포인트는 이 로컬 실행기에만 존재합니다. 운영 배포에 포함하면 안 됩니다.
- Ctrl+C 정상 종료 시 해당 임시 DB를 제거합니다. 강제 프로세스 종료 시 임시 DB가 남을 수 있습니다.
- 기존 로컬 DB, 운영 DB, Wiki, GitHub 이슈/PR은 변경하지 않습니다.

## 확인

```powershell
node --check public/js/admin-inquiries-sample.js
node scripts/test-admin-inquiries-preview.cjs
```

브라우저에서는 로그인 → 대시보드 숫자 확인 → 문의 대기 카드 클릭 → 이동 → 일반 문의 답변 → 제재 이의제기 승인(sanctionId 입력) → 정지 해제까지 반영되는지 직접 확인했습니다.
API 검증 스크립트(23건)는 샘플 서버가 켜져 있을 때 실행하며, 대시보드 집계·문의 답변 멱등성·재시도 충돌(409)·이의제기 승인 시 실제 정지 해제까지 확인합니다.

## 현재 검토 요청 범위와 후속 작업

- 현재 PR은 독립 샘플 초안입니다. 우선 miku의 진행 중인 작업과 파일·기능 범위가 겹치는지만 확인합니다.
- 디자인과 전체 사용자 흐름의 상세 검토는 miku가 가능한 시점에 진행하며, 지금 최종 승인을 요청하는 것은 아닙니다.
- 기존 공통 CSS/JS, index.html 등은 변경하지 않습니다. 실제 화면 연결 전 변경할 파일과 담당 범위를 조율합니다.
- 의존 BE: 관리자 대시보드 API PR https://github.com/adapterz/wku-iksan-store-BE/pull/105 (병합됨, `discontinuedCount` 필드 포함), 문의하기 API PR https://github.com/adapterz/wku-iksan-store-BE/pull/100 (병합됨), 정지 회원 리뷰 제한 PR https://github.com/adapterz/wku-iksan-store-BE/pull/107 (병합됨)
- 설계: https://github.com/adapterz/wku-iksan-store-BE/issues/90
- 아직 남은 사항: `sanctionId` 조회 화면(회원 제재), 리뷰 신고 큐, 상품·카테고리 관리 화면 — 이번 샘플에 없음. inquiryCount는 여전히 일반/이의제기 구분 없이 합산됩니다(별도 결정 없으면 이대로 유지).
- 운영용 완성 페이지가 아니므로 즉시 머지·배포하지 않습니다.
