## 2026-07-21

### 오늘 한 일
- 프론트엔드·백엔드 서버 포트 충돌 문제 해결
- 로컬 개발 환경에서 프론트엔드 → 백엔드 API 요청을 위한 Proxy 설정 추가

### 마주한 문제
- 프론트엔드 서버와 백엔드 서버가 동일한 포트(3000)를 사용하여 `EADDRINUSE` 에러 발생
- 로컬 환경에서 프론트엔드가 백엔드 API로 직접 요청 시 CORS 문제 발생 가능성 존재

### 해결 과정
**1) 포트 충돌 해결**
- `app.js`에서 프론트엔드 기본 구동 포트를 3000 → 8080으로 변경

```js
// 변경 전
const PORT = process.env.PORT || 3000;

// 변경 후
const PORT = process.env.PORT || 8080;
```

**2) Proxy 설정 추가**
- `http-proxy-middleware`를 사용해 백엔드 포트(3000)로 요청을 포워딩하도록 설정
- `pathFilter: '/api'` 옵션을 적용하여 `/api` 경로만 백엔드로 라우팅되도록 구성
- `/api`가 포함되지 않은 정적 파일 요청·페이지 이동 요청은 프록시하지 않고 프론트엔드 서버가 직접 처리하도록 필터링

```js
const { createProxyMiddleware } = require('http-proxy-middleware');

// 백엔드 API 서버로 요청 전달 (Proxy)
app.use(
  createProxyMiddleware({
    pathFilter: '/api',
    target: 'http://localhost:3000',
    changeOrigin: true,
  })
);
```

### 배운 점
- 프론트엔드와 백엔드를 별도 서버로 분리 실행할 때는 포트 설계를 사전에 명확히 해야 `EADDRINUSE` 같은 충돌을 예방할 수 있음
- `http-proxy-middleware`의 `pathFilter` 옵션으로 특정 경로만 선택적으로 라우팅하면, 정적 리소스 요청과 API 요청을 명확히 분리할 수 있음
- 개발 환경에서 Proxy를 통해 API 요청을 우회시키면 CORS 설정 없이도 프론트-백엔드 연동 테스트가 가능함

---

## 2026-07-22

### 오늘 한 일
- `component.js`에 서브페이지 공통 헤더(`getSubHeaderHTML`) 생성 및 동적 삽입 로직 구현
- `component.js`에 공통 하단 네비게이션 바(`getBottomNavHTML`) 생성 및 렌더링 로직 구현
- `component.js`에 전체화면 검색 모달(`getSearchOverlayHTML`) 공통 함수 작성 및 조기 삽입 처리
- `product.js`의 '나에게 선물하기' 버튼 이벤트 핸들러 수정


### 마주한 문제
1. **검색 버튼 이벤트 미바인딩**
   - 검색 버튼(`btn-search-open`)이 `component.js`에 의해 동적으로 생성·삽입되다 보니, `product.js` 등 개별 페이지 스크립트 실행 시점에는 아직 DOM에 존재하지 않아 이벤트가 바인딩되지 않는 문제 발생
2. **'나에게 선물하기' 버튼 미동작**
   - `.btn-bottom-buy` 클릭 시 존재하지 않는 구매 바텀 시트(`bottomSheetOverlay`)를 열려고 시도하여 아무 동작도 일어나지 않는 오류 발생
3. **공통 컴포넌트(헤더/네비게이션) 렌더링 타이밍 경쟁(Race Condition)**
   - `complete.js`, `giftbox.js` 등에서 `DOMContentLoaded` 시점에 하단 네비게이션(`.nav-item`) 이벤트를 바인딩했으나, `component.js`가 헤더·네비게이션 HTML을 주입하는 시점과 경쟁이 발생하여 요소를 아직 찾지 못하는 경우 발생


### 해결 과정

**1) 공통 서브헤더 삽입 (`component.js`)**
- `getSubHeaderHTML()` 함수 추가: 뒤로가기 버튼, 검색, 홈, 선물함 아이콘 그룹이 포함된 공통 헤더 HTML 반환
- `DOMContentLoaded` 시점에 메인 페이지(`index.html`)·마이페이지(`mypage.html`)를 제외한 서브페이지에서 `header.main-header` 영역 내부에 동적 삽입
- 동적으로 삽입된 뒤로가기 버튼(`id="btn-back"`)에 이전 페이지 이동 이벤트 리스너 재바인딩

**2) 공통 하단 네비게이션 렌더링 (`component.js`)**
- `getBottomNavHTML()` 함수 추가: 하단 네비게이션 바 HTML 구조 반환
- `DOMContentLoaded` 시점에 `nav.bottom-nav:not(.product-bottom-nav)` 요소를 찾아 내부 HTML을 해당 함수 결과값으로 덮어쓰기 (예외 페이지 제외 로직 적용)

**3) 검색 모달 공통화 및 이벤트 위임 처리 (`component.js`)**
- `getSearchOverlayHTML()` 함수 추가: 검색 모달(닫기 버튼, 검색창, 최근 검색어 영역) HTML 반환

```js
function getSearchOverlayHTML() {
    return `
<div id="search-overlay" class="search-overlay">
    <div class="search-overlay-header">
        <button id="btn-search-close" class="btn-search-back" aria-label="뒤로가기">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><line x1="20" y1="12" x2="4" y2="12"></line><polyline points="10 18 4 12 10 6"></polyline></svg>
        </button>
        <div class="search-input-wrapper">
            <i class="fa-solid fa-magnifying-glass search-overlay-input-icon"></i>
            <input type="text" class="search-overlay-input" placeholder="원하는 선물을 검색해보세요" autofocus>
        </div>
    </div>
    <div class="search-overlay-body">
        <h4 class="recent-searches-title">최근 검색어</h4>
        <div class="recent-keywords-list"></div>
    </div>
</div>`;
}
```

- 다른 페이지 종속 스크립트(`home.js`, `mypage.js` 등)의 `DOMContentLoaded`보다 먼저 모달 DOM을 확보하기 위해, `component.js` 파싱 시점에 즉시(`insertAdjacentHTML`) `<body>` 하단에 모달 삽입 처리
- 동적 삽입 타이밍 문제 해결을 위해 **전역 이벤트 위임(Event Delegation)** 방식 적용: `btn-search-open`은 동적 삽입되므로 `document` 레벨에서 버블링을 이용해 클릭 감지, `btn-search-close`는 정적 삽입되므로 직접 바인딩

```js
const searchOverlay = document.getElementById('search-overlay');
if (searchOverlay) {
    // btn-search-open은 메인(index.html)에서는 정적, 서브페이지에서는 동적 삽입됨
    // 동적 삽입 이후에 바인딩하기 위해 문서 전체에 위임(이벤트 버블링) 사용
    document.addEventListener('click', (e) => {
        const openBtn = e.target.closest('#btn-search-open');
        if (openBtn) {
            e.preventDefault();
            searchOverlay.classList.add('open');
            const searchInput = searchOverlay.querySelector('.search-overlay-input');
            if (searchInput) {
                setTimeout(() => searchInput.focus(), 50);
            }
        }
    });
    // btn-search-close는 정적 삽입(component.js 최상단)되어 있으므로 바로 바인딩 가능
    const searchCloseBtn = document.getElementById('btn-search-close');
    if (searchCloseBtn) {
        searchCloseBtn.addEventListener('click', () => {
            searchOverlay.classList.remove('open');
            updateActiveStates(); // 검색 오버레이 닫기 시 active 상태 복구
        });
    }
}
```

**4) 구매 버튼 이벤트 핸들러 수정 (`product.js`)**
- 존재하지 않는 바텀 시트 오픈 로직 및 불필요한 드래그(스와이프) 이벤트 코드 제거
- 클릭 시 즉시 `goToOrder(productId, 'self')`가 호출되도록 변경

```js
if (buyBtn) {
    buyBtn.addEventListener('click', () => {
        goToOrder(productId, 'self');
    });
}
```

- `goToOrder` 함수 내부의 로그인 상태 검증(`api/auth/me`) 및 검증 통과 시 상품 ID·구매 타입(`type=self`)을 URL Query Parameter로 담아 `order.html?productId=X&type=self`로 이동하는 라우팅 로직은 그대로 보존

**5) 공통 컴포넌트 렌더링 타이밍 경쟁 해결 (`component.js`, `complete.js`, `giftbox.js`)**
- 원인: 헤더·네비게이션 HTML이 `component.js`에서 비동기적으로 주입되는 반면, `complete.js`/`giftbox.js`는 `DOMContentLoaded` 시점에 곧바로 네비게이션 요소(`.nav-item`)를 참조하려고 시도해 타이밍 경쟁 발생
- 조치: 타이밍 경쟁 자체를 없애는 방식(방법 2)으로 해결

**커스텀 이벤트 Dispatch (`component.js`)**
- 헤더와 네비게이션 HTML 주입이 완전히 끝난 직후 `header:ready` 커스텀 이벤트를 명시적으로 발생시켜 완료를 알림

```js
document.dispatchEvent(new Event('header:ready'));
```

**커스텀 이벤트 Subscribe (`complete.js`, `giftbox.js`)**
- 기존 `DOMContentLoaded` 리스너 대신 `header:ready` 커스텀 이벤트를 구독하도록 변경
- 파일 하단에 전역으로 분리되어 파싱 시점에 즉시 실행되던 하단 네비게이션 바(`.nav-item`) 이벤트 바인딩 로직을 `header:ready` 콜백 내부로 모두 이동시켜, 동적으로 주입된 네비게이션 요소도 안전하게 참조 가능하도록 보장

```js
document.addEventListener("header:ready", async () => { ... }
```

**참고 및 검토 사항**
- `product.js`, `order.js` 등 다른 서브페이지 스크립트는 `<script defer>`가 명시되어 있어 `component.js` 실행 이후 순차 실행이 보장되므로 동일한 타이밍 이슈가 발생하지 않음을 교차 검증 완료
- 타이밍을 강제하는 방식을 도입하여, 향후 네트워크·로딩 속도가 지연되는 환경에서도 버튼 이벤트가 안전하게 바인딩됨

### 배운 점
- 여러 페이지에서 공통으로 쓰이는 UI(헤더, 네비게이션, 모달)는 별도 컴포넌트 함수로 분리하고 `DOMContentLoaded` 시점에 동적 삽입하면 중복 코드를 줄이고 유지보수성을 높일 수 있음
- 동적으로 삽입된 요소는 삽입 시점 이후에 이벤트를 바인딩해야 하며, 삽입 타이밍이 스크립트마다 다를 경우 **이벤트 위임(Event Delegation)** 을 사용하면 타이밍 문제를 근본적으로 해결할 수 있음
- 공통 스크립트(`component.js`)가 페이지 종속 스크립트보다 먼저 실행되어야 하는 DOM(모달 등)은 `DOMContentLoaded`를 기다리지 않고 스크립트 파싱 시점에 즉시 삽입하는 방식이 유효함
- `DOMContentLoaded`는 "문서 파싱 완료" 시점일 뿐, 동적으로 주입되는 컴포넌트의 "렌더링 완료" 시점을 보장하지 않는다는 점을 명확히 인지해야 함
- 스크립트 간 실행 순서에 의존하는 대신, **커스텀 이벤트를 통한 명시적 완료 신호(Dispatch/Subscribe)** 를 사용하면 로딩 속도나 네트워크 환경에 관계없이 안정적으로 동작하는 구조를 만들 수 있음
- `<script defer>` 속성이 있는 스크립트는 문서 파싱 완료 후, 선언된 순서대로 실행되므로, 스크립트 로드 순서를 보장해야 하는 상황에서 유용하게 활용할 수 있음
- 존재하지 않는 UI 요소를 참조하는 코드는 조용히 실패(no-op)할 수 있으므로, 실제 동작 여부를 항상 브라우저에서 직접 확인하는 습관이 중요함
