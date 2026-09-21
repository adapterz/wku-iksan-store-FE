# 상품·카테고리 관리 로컬 샘플

기존 FE develop의 레이아웃·공통 글꼴·컴포넌트(`js/api.js`)를 재사용한 독립 샘플입니다.
브랜치: prototype/admin-products-page. 기존 index.html, product.html, 공통 JS는 변경하지 않았습니다.
admin-inquiries-sample(PR #79), admin-sanctions-sample(PR #81)과 동일한 구조를 따릅니다.

## 확인할 흐름

- **상품 관리**: 전체/판매중/숨김/단종 필터로 목록 조회, 상품 등록, 수정(상세 정보는 `<details>`로 접어둠), 상태 전환(판매중 ↔ 숨김 ↔ 단종) 버튼.
- **카테고리 관리**: 목록 조회, 추가, 이름 수정. 중복 이름은 `409 CATEGORY_ALREADY_EXISTS`로 거부되고 화면에 안내됩니다.
- 카테고리 목록은 관리자 전용 API가 따로 없어 기존 공개 API(`GET /api/categories`)를 재사용합니다(이슈 #90 4-2절에 이미 명시된 방식).
- 상품 수정 폼은 목록에 표시되지 않는 위치(항상 화면 맨 아래)에 렌더링됩니다 — 카드 옆에 인라인으로 붙이지 않은 임시 구조라, 실제 화면 연동 시 개선이 필요합니다.

## 이 샘플을 만들다가 고친 BE 버그

`GET /api/admin/products`가 `description`/`description_image_url`/`valid_period`/`usage_method`/`exchange_location`/`caution` 컬럼을 SELECT하지 않아, 상품 수정 폼을 열어도 이 4개 필드(유효기간/사용방법/교환처/주의사항)가 항상 비어있었습니다. BE PR로 별도 수정했습니다: adapterz/wku-iksan-store-BE#109

## 로컬 실행

```powershell
$env:ADMIN_BE_ROOT = 'C:\path\to\wku-iksan-store-BE'
$env:ADMIN_DB_ENV_FILE = 'C:\path\to\local-db.env'
node scripts/preview-admin-products.cjs
```

http://127.0.0.1:8091/admin-products-sample.html

- 로그인 게이트에서 **샘플 관리자 계정으로 로그인**을 누르면 로컬 전용 고정 관리자 계정으로 로그인합니다.
- `admin_products_preview_랜덤값` DB를 새로 생성해 카테고리 2개, 상품 4개(판매중 2 / 숨김 1 / 단종 1)를 채웁니다.
- 다른 샘플과 포트가 겹치지 않도록 기본 포트는 8091입니다(문의하기 8089, 회원 제재 8090).
- DB 접속은 localhost 계열만 허용하며, 웹서버는 127.0.0.1에만 바인딩합니다.
- Ctrl+C 정상 종료 시 임시 DB를 제거합니다.

## 확인

```powershell
node --check public/js/admin-products-sample.js
node scripts/test-admin-products-preview.cjs
```

브라우저에서는 로그인 → 상품 목록·상태 필터 → 상품 수정(상세 정보 프리필 확인) → 상태 전환 → 카테고리 추가/중복 거부/수정까지 직접 확인했습니다.
API 검증 스크립트(18건)는 상태 필터, 카테고리 중복 거부, 필수 필드 누락 거부, 잘못된 상태값 거부, 존재하지 않는 상품 거부까지 포함합니다.

## 현재 검토 요청 범위와 후속 작업

- 이 PR도 독립 샘플 초안입니다. 우선 miku의 진행 중인 작업과 파일·기능 범위가 겹치는지만 확인합니다.
- 의존 BE: 상품·카테고리 관리 API adapterz/wku-iksan-store-BE#93 (병합됨), 상세 필드 누락 수정 adapterz/wku-iksan-store-BE#109 (리뷰 대기)
- 설계: adapterz/wku-iksan-store-BE#90 (4절)
- 아직 남은 사항: 수정 폼을 카드 옆으로 인라인 배치, 브랜드 자동완성(이슈 #90 4-2절에 명시된 방향)
- 운영용 완성 페이지가 아니므로 즉시 머지·배포하지 않습니다.
