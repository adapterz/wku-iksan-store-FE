# wku-iksan-store-FE

**익산 지역상생**을 테마로 한 **기프티콘 선물 쇼핑몰**의 **프론트엔드(화면) 서버** 저장소입니다.
처음에는 카카오톡 선물하기 기능을 그대로 클론하는 것을 목표로 시작했지만, 산지직송 등 다양한 상품군을 함께 다루던 초기 기획에서
**기프티콘 중심**으로 서비스 형태를 통일해, 익산 지역 상권을 살리는 기프티콘 선물 서비스로 방향을 다듬었습니다.
회원가입/로그인부터 상품 탐색, 장바구니·주문, 선물 발송·수신, 리뷰, 마이페이지, 관리자 운영 화면까지 서비스 전 구간의 화면을 제공합니다.

원래는 FE/BE가 하나의 저장소(`wku-2026-2-kakao-shop`)로 통합되어 있었으나, 관리 포인트를 분리하기 위해
BE/FE 2개 저장소 체제로 정리되었습니다. 이 저장소는 **FE(화면) 코드만** 다루며, API 서버는 [BE 저장소](https://github.com/adapterz/wku-iksan-store-BE)에서 진행합니다.

## 이런 걸 할 수 있어요

- **회원/인증** — 회원가입·로그인, 마이페이지에서 닉네임·이메일·비밀번호 변경, 계정 삭제
- **상품 탐색** — 홈 화면 상품 목록, 브랜드·카테고리별 조회, 검색
- **상품 상세** — 상품 정보·상세 이미지, 추천 상품, 선물후기 조회
- **장바구니 & 주문** — bottom-sheet로 수량 선택 후 장바구니 담기, 장바구니 묶음 주문·단건 즉시구매·결제 완료 화면
- **선물하기** — 선물 발송, 선물함(나에게 선물/받은 선물/사용완료) 조회, 선물 도착 시 모달 안내
- **위시리스트** — 관심 상품 찜하기, 찜 랭킹
- **리뷰** — 사용 완료한 선물에 대한 리뷰 작성·조회·수정·삭제
- **관리자 페이지** — 대시보드, 상품·카테고리 관리, 신고 모더레이션, 회원 제재, 문의 응대

## 어떤 프로젝트인가요

지역 상권과 연계한 온라인 선물하기 서비스를 목표로 팀이 함께 만드는 부트캠프 팀 프로젝트입니다.
FE/BE/Cloud 역할을 나눠 기능 단위 브랜치에서 개발 → `develop`에서 통합 검증 → `main`으로 운영 배포하는 흐름으로 협업하고 있으며,
매일 데일리 스크럼과 정기 미팅으로 진행 상황을 맞춰가고 있습니다. 진행 중인 논의와 회의 기록은
[GitHub Wiki](https://github.com/adapterz/wku-iksan-store-FE/wiki)에 누적하고 있습니다.

### 팀 구성

| 담당자 | 역할 | 주로 하는 일 |
| --- | --- | --- |
| **Miku** | 팀장 · FE | 화면 구현, 사용자 흐름 설계, FE 저장소 작업 조율 |
| **Aon** | BE | 기존 BE 기능 유지보수·운영 안정화, 인증/공통 구조, 기존 API·DB 정합성 |
| **Ethan** | BE | BE 기능 개선·확장, 신규 기능(API/ERD/DB) 설계·구현, FE 연동 검증 |
| **Bio** | Cloud | 서버·CI/CD·Docker·Nginx 운영, 배포 실행, 운영 DB 마이그레이션 적용 |

BE 두 명(Aon/Ethan)의 구분은 업무를 고정하는 기준이 아니라 "먼저 이걸 주로 본다" 정도의 우선 담당 방향입니다.
실제로는 영역을 딱 나눠 각자만 작업하지 않고, 서로 필요하다고 느끼면 유동적으로 넘나들며 돕고 서로 다른 사람이 작성한 PR을 상호 리뷰합니다.
자세한 역할·PR·배포 절차 기준은 Wiki의 [GitHub·직무 운영 Rule](https://github.com/adapterz/wku-iksan-store-FE/wiki/GitHub-직무-운영-Rule) 문서를 참고하세요.

## 사용한 개발 도구

| 구분 | 도구 |
| --- | --- |
| 런타임 / 프레임워크 | Node.js, Express (별도 FE 프레임워크·번들러 없이 바닐라 HTML/CSS/JS) |
| API 연동 | `http-proxy-middleware` — `/api` 요청을 BE 서버로 프록시 |
| 테스트 | Node.js 내장 테스트 러너(`node --test`) |
| 개발 편의 | nodemon |
| 배포 / 인프라 | Docker, GitHub Actions, Private Registry, Tailscale(SSH 재배포) |

페이지 라우팅은 `server/page-router.js`가 담당하며, `.html` 확장자 없는 주소로도 접속할 수 있도록
확장자 있는 요청을 정규화된 경로로 308 리다이렉트합니다.

## 폴더 구조

```
app.js                  # 앱 진입점, BE API 프록시·페이지 라우터 등록
server/page-router.js    # .html 확장자 정규화, 정적 파일 서빙
public/                  # 실제 서비스 화면 (html/css/js)
  ├─ *.html               # 페이지별 화면 (홈=index, 상품상세=product, 장바구니=cart, 주문=order, 관리자=admin-* 등)
  ├─ css/                 # 페이지별 스타일시트
  └─ js/                  # 페이지별 로직 + api.js/component.js 등 공용 모듈
docs/                    # FE 개발 기록, 기능별 설계 문서(DEVLOG, TROUBLESHOOTING 등)
scripts/                 # 로컬 프리뷰/수동 확인용 스크립트
tests/                   # Node 테스트 러너 기반 테스트
.github/workflows/       # 배포 자동화(GitHub Actions)
Dockerfile, docker-compose.yml, deploy.sh  # 배포 관련 설정
```

## 로컬 실행 방법

```bash
npm install
npm run dev              # nodemon으로 개발 서버 실행 (기본 포트 8080)
# 또는
npm start
```

BE API 서버 주소는 환경변수 `BE_URL`로 지정합니다(기본값 `http://localhost:3000`). BE 저장소를 함께 실행한 뒤
`BE_URL=http://localhost:3000 npm run dev`처럼 지정하면 `/api` 요청이 실제 BE 서버로 프록시됩니다.

```bash
npm test                 # Node 내장 테스트 러너로 tests/*.test.cjs 실행
```

## 배포

`main` 브랜치에 반영되면 `.github/workflows/deploy.yml`이 Docker 이미지를 빌드해 Private Registry에 올리고,
Tailscale로 FE 서버에 직접 접속해 `deploy.sh`를 실행하는 방식으로 재배포합니다. 운영 환경에서는
`docker-compose.yml`의 `BE_URL`로 BE 서버 주소를 지정합니다. 배포 절차의 세부 기준은
Wiki [GitHub·직무 운영 Rule](https://github.com/adapterz/wku-iksan-store-FE/wiki/GitHub-직무-운영-Rule) 문서를 따릅니다.
