# wku-iksan-store-FE

카카오 선물하기 클론 코딩 프로젝트(익산 지역상생 테마)의 프론트엔드(FE) 저장소입니다.

기존에는 FE/BE가 하나의 저장소(`wku-2026-2-kakao-shop`)에 통합되어 있었으나, 관리 포인트를 분리하기 위해 BE/FE 2개 저장소 체제로 정리되었습니다. 이 저장소는 FE(클라이언트 화면 및 UI 로직) 코드만 다룹니다.

## 기술 스택

- **HTML5**
- **CSS3**
- **JavaScript**

## 폴더 구조

```text
public/
  ├─ css/
  │   └─ style.css          # 공통 및 페이지 스타일시트
  ├─ images/                # 정적 이미지 자원
  ├─ js/
  │   ├─ api.js             # API 연동 및 네트워크 요청 모듈
  │   ├─ cache.js           # 클라이언트 캐싱 관련 모듈
  │   ├─ component.js       # 공통 컴포넌트 JS
  │   ├─ skeleton.js        # 로딩 스켈레톤 UI 제어
  │   ├─ home.js            # 메인 페이지 로직
  │   ├─ product.js         # 상품 상세 페이지 로직
  │   ├─ login.js           # 로그인 페이지 로직
  │   ├─ signup.js          # 회원가입 페이지 로직
  │   ├─ order.js           # 주문/결제 페이지 로직
  │   ├─ complete.js        # 주문 완료 페이지 로직
  │   ├─ giftbox.js         # 선물함 페이지 로직
  │   ├─ giftuse.js         # 선물 바코드/사용 처리 로직
  │   └─ mypage.js          # 마이페이지 로직
  ├─ index.html             # 메인 화면 (홈)
  ├─ product.html           # 상품 상세 화면
  ├─ login.html             # 로그인 화면
  ├─ signup.html            # 회원가입 화면
  ├─ order.html             # 주문/결제 화면
  ├─ complete.html          # 주문 완료 화면
  ├─ giftbox.html           # 선물함 화면
  ├─ giftuse.html           # 선물 사용/바코드 화면
  └─ mypage.html            # 마이페이지 화면
```

## 실행 방법 (로컬) - FE, BE 모두 실행해야함

```
# FE
# 1. 패키지 설치
npm install

# 2. 프론트엔드 개발 서버 실행
npm start
# 또는
npm run dev
```
```
# BE
npm install
cp .env.example .env    # 값 채운 뒤 사용
npm run dev             # nodemon으로 개발 서버 실행
# 또는
npm start
```

## 화면 및 주요 기능 개요

* **메인 / 상품 목록 (`index.html`, `home.js`)**: 익산 지역 상생 상품 목록 조회 및 UI 표시
* **상품 상세 (`product.html`, `product.js`)**: 상품 상세 정보 확인 및 구매/선물하기 선택
* **인증 (`login.html`, `signup.html`, `login.js`, `signup.js`)**: 로그인 및 회원가입 폼 처리
* **주문 / 결제 (`order.html`, `complete.html`, `order.js`, `complete.js`)**: 주문서 작성 및 결제 완료 처리
* **선물함 및 사용 (`giftbox.html`, `giftuse.html`, `giftbox.js`, `giftuse.js`)**: 수신/발신 선물함 조회 및 선물 바코드 사용 처리
* **마이페이지 (`mypage.html`, `mypage.js`)**: 사용자 정보 및 주문 내역 확인


## 배포

FE 단독 배포 및 컨테이너화 작업 관련 파일(`Dockerfile`, `docker-compose.yml`, `deploy.sh` 등)이 포함되어 있으며, 백엔드 API 서버와의 연동 환경 구축을 위해 설정이 지속적으로 업데이트될 예정입니다.

