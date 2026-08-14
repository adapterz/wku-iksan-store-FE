// 전체화면 검색 모달 공통 HTML 반환 함수
function getSearchOverlayHTML() {
    return `
<div id="search-overlay" class="search-overlay">
    <div class="search-overlay-header">
        <button id="btn-search-close" class="btn-search-back" aria-label="뒤로가기">
            <i class="fa-solid fa-arrow-left"></i>
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

// 검색 모달 동적 삽입 (가장 먼저 실행되어야 DOMContentLoaded에서 다른 스크립트들이 찾을 수 있음)
if (document.body && !document.getElementById('search-overlay')) {
    document.body.insertAdjacentHTML('beforeend', getSearchOverlayHTML());
}

// 검색어를 받아 검색 결과 페이지로 이동하는 공통 유틸리티 (빈 값은 무시)
function navigateToSearch(keyword) {
    const trimmed = (keyword || '').trim();
    if (!trimmed) return;
    window.location.href = `search.html?keyword=${encodeURIComponent(trimmed)}`;
}

// 하단 네비게이션의 로그인 링크(redirect 파라미터)를 현재 window.location.href 기준으로 다시 계산한다.
// history.pushState로 URL만 바뀌는 화면(search.js의 재검색 등)은 페이지가 새로 로드되지 않아
// checkGlobalAuthStatus가 다시 실행되지 않으므로, 그런 화면에서 URL이 바뀔 때마다 직접 호출해야 한다.
window.refreshBottomNavLoginLink = function() {
    const myBtn = document.getElementById('btn-bottom-my');
    if (!myBtn) return;
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (!isLoggedIn) {
        myBtn.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
    }
};

// 헤더의 #btn-back 뒤로가기 버튼 공통 이벤트 바인딩 (히스토리가 없으면 홈으로 이동)
function bindHeaderBackButton() {
    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
        btnBack.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'index.html';
            }
        });
    }
}

// 검색 결과 페이지(search.html) 전용 헤더 HTML 반환 함수
// index.html의 회색 검색 인라인 박스(.header-search-box)를 재사용하되, 오버레이 대신
// 이 자리에서 바로 입력·재검색할 수 있도록 실제 <input>으로 구성한다.
function getSearchHeaderHTML(keyword) {
    const escapedKeyword = (keyword || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `
    <div class="header-container">
        <a href="#" id="btn-back" class="header-icon" title="뒤로가기">
            <i class="fa-solid fa-arrow-left"></i>
        </a>
        <div class="header-search-box search-header-box">
            <input type="text" id="search-page-input" class="header-search-text has-keyword" value="${escapedKeyword}" placeholder="브랜드, 상품, 프로필, 태그 등">
            <div class="header-search-icon" id="search-page-submit" style="cursor: pointer;">
                <i class="fa-solid fa-magnifying-glass"></i>
            </div>
        </div>
        <div class="header-right-icons">
            <a href="index.html" class="header-icon" title="홈">
                <i class="fa-solid fa-house"></i>
            </a>
            <a href="#" class="header-icon" title="주문내역">
                <i class="fa-solid fa-receipt"></i>
            </a>
            <a href="giftbox.html" class="header-icon" title="선물함">
                <i class="fa-solid fa-gift"></i>
            </a>
        </div>
    </div>`;
}

// search.html에서 header:ready 이후 호출하여 검색 전용 헤더를 그려주는 공통 함수
// 오버레이를 열지 않고, 헤더의 검색창에서 바로 입력해 재검색할 수 있도록 바인딩한다.
window.renderSearchHeader = function(keyword) {
    const headerElement = document.querySelector('header.main-header');
    if (!headerElement) return;
    headerElement.innerHTML = getSearchHeaderHTML(keyword);
    bindHeaderBackButton();

    const searchPageInput = document.getElementById('search-page-input');
    const searchPageSubmit = document.getElementById('search-page-submit');

    // search.html 안에서의 재검색은 페이지 새로고침 없이 처리하기 위해
    // search.js가 등록한 콜백(window.onSearchPageKeywordSubmit)에 위임한다.
    // 콜백이 없는 경우(비정상 진입 등)에는 기존처럼 페이지 이동으로 대체한다.
    function submitPageSearch() {
        if (!searchPageInput) return;
        const trimmed = searchPageInput.value.trim();
        if (!trimmed) return;
        if (typeof window.onSearchPageKeywordSubmit === 'function') {
            window.onSearchPageKeywordSubmit(trimmed);
        } else {
            navigateToSearch(trimmed);
        }
    }

    if (searchPageInput) {
        searchPageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitPageSearch();
            }
        });
    }

    if (searchPageSubmit) {
        searchPageSubmit.addEventListener('click', submitPageSearch);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // 서브 페이지 공통 헤더 HTML 반환 함수
    function getSubHeaderHTML() {
        return `
        <div class="header-container" style="justify-content: space-between;">
            <a href="#" id="btn-back" class="header-icon" title="뒤로가기">
                <i class="fa-solid fa-arrow-left"></i>
            </a>
            <div class="header-right-icons" style="gap: 16px;">
                <a href="#" id="btn-search-open" class="header-icon" title="검색">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </a>
                <a href="index.html" class="header-icon" title="홈">
                    <i class="fa-solid fa-house"></i>
                </a>
                <a href="#" class="header-icon" title="주문내역">
                    <i class="fa-solid fa-receipt"></i>
                </a>
            </div>
        </div>`;
    }

    // 메인(index.html) 및 마이페이지(mypage.html) 제외 서브 페이지 헤더 동적 삽입
    let currentPath = window.location.pathname;
    let currentFile = currentPath.substring(currentPath.lastIndexOf('/') + 1);
    if (currentFile === '' || currentFile === '/') {
        currentFile = 'index.html';
    }

    // search.html은 검색 인라인 박스가 포함된 전용 헤더(window.renderSearchHeader)를 사용하므로 공통 헤더 자동 삽입에서 제외
    if (currentFile !== 'index.html' && currentFile !== 'mypage.html' && currentFile !== 'search.html') {
        const headerElement = document.querySelector('header.main-header');
        if (headerElement) {
            headerElement.innerHTML = getSubHeaderHTML();
            document.dispatchEvent(new Event('header:ready'));
            bindHeaderBackButton();
        }
    }

    // 하단 네비게이션 바 공통 HTML 반환 함수
    function getBottomNavHTML() {
        const isPresumedLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        const userIconClass = isPresumedLoggedIn ? "fa-solid fa-user logged-in" : "fa-regular fa-user";
        const dotHidden = isPresumedLoggedIn ? "" : "hidden";
        const textStr = isPresumedLoggedIn ? "my" : "login";
        const myHref = isPresumedLoggedIn ? "mypage.html" : "login.html";

        return `
        <a href="index.html" class="nav-item">
            <i class="fa-solid fa-house"></i>
            <span class="nav-text">HOME</span>
        </a>
        <a href="#" class="nav-item">
            <i class="fa-solid fa-receipt"></i>
            <span class="nav-text">RECEIPT</span>
        </a>
        <a href="#" class="nav-item">
            <i class="fa-solid fa-magnifying-glass"></i>
            <span class="nav-text">SHOP</span>
        </a>
        <a href="wishlist.html" class="nav-item" data-icon-active="fa-solid fa-bookmark" data-icon-inactive="fa-regular fa-bookmark">
            <i class="fa-regular fa-bookmark"></i>
            <span class="nav-text">SAVED</span>
        </a>
        <a href="${myHref}" id="btn-bottom-my" class="nav-item">
            <div class="login-status-icon-wrapper">
                <i id="bottom-login-status-icon" class="${userIconClass}"></i>
                <span id="bottom-login-status-dot" class="login-status-dot" ${dotHidden}></span>
            </div>
            <span id="bottom-login-status-text" class="nav-text">${textStr}</span>
        </a>`;
    }

    // 하단 네비게이션 바 동적 삽입 (예외 페이지 제외)
    const bottomNavElements = document.querySelectorAll('nav.bottom-nav:not(.product-bottom-nav)');
    bottomNavElements.forEach(nav => {
        nav.innerHTML = getBottomNavHTML();
    });

    // 전역 인증 상태 체크 및 하단 네비게이션 업데이트
    async function checkGlobalAuthStatus() {
        let isLoggedIn = false;
        let nickname = '';
        try {
            // requestJson이 전역(api.js)에 선언되어 있다고 가정
            // silent401: 로그인 여부만 조용히 확인하는 배경 호출이므로 전역 401 리다이렉트를 건너뛴다.
            if (typeof requestJson === 'function') {
                const result = await requestJson('/api/auth/me', { silent401: true });
                isLoggedIn = true;
                nickname = result.data?.nickname || '';
            }
        } catch (error) {
            isLoggedIn = false;
        }

        const myBtn = document.getElementById('btn-bottom-my');
        const myIcon = document.getElementById('bottom-login-status-icon');
        const myDot = document.getElementById('bottom-login-status-dot');
        const myText = document.getElementById('bottom-login-status-text');

        if (myBtn) {
            if (isLoggedIn) {
                localStorage.setItem('isLoggedIn', 'true');
                myBtn.href = 'mypage.html';
                if (myIcon) {
                    myIcon.className = 'fa-solid fa-user logged-in';
                }
                if (myDot) myDot.hidden = false;
                if (myText) myText.textContent = 'my';
            } else {
                localStorage.removeItem('isLoggedIn');
                window._wishlistCache = null;
                window._wishlistFetchPromise = null;
                window.refreshBottomNavLoginLink();
                if (myIcon) {
                    myIcon.className = 'fa-regular fa-user';
                }
                if (myDot) myDot.hidden = true;
                if (myText) myText.textContent = 'login';
            }
            updateActiveStates();
        }

        // 인증 정보를 필요한 곳(home.js 등)에서 사용할 수 있도록 커스텀 이벤트 디스패치
        document.dispatchEvent(new CustomEvent('auth:updated', { detail: { isLoggedIn, nickname } }));
    }

    checkGlobalAuthStatus();

    function updateActiveStates() {
        const navItems = document.querySelectorAll('.bottom-nav .nav-item, .nav-bar .nav-item');
        if (navItems.length === 0) return;

        let currentPath = window.location.pathname;
        let currentFile = currentPath.substring(currentPath.lastIndexOf('/') + 1);
        
        // Default to index.html if root path
        if (currentFile === '' || currentFile === '/') {
            currentFile = 'index.html';
        }


        navItems.forEach(item => {
            let href = item.getAttribute('href');
            if (!href || href === '#') {
                item.classList.remove('active');
                return;
            }

            // Parse href to get filename, ignoring query strings
            let hrefFile = href;
            const qIndex = href.indexOf('?');
            if (qIndex !== -1) hrefFile = href.substring(0, qIndex);
            hrefFile = hrefFile.substring(hrefFile.lastIndexOf('/') + 1);

            const isActive = currentFile === hrefFile;
            item.classList.toggle('active', isActive);

            // data-icon-active/data-icon-inactive가 지정된 nav 아이템은 현재 페이지 여부에 따라
            // 아이콘 클래스(fa-regular ↔ fa-solid 등)를 전환한다 (예: 위시리스트의 빈/채워진 북마크).
            const activeIconClass = item.dataset.iconActive;
            const inactiveIconClass = item.dataset.iconInactive;
            if (activeIconClass && inactiveIconClass) {
                const icon = item.querySelector('i');
                if (icon) {
                    icon.className = isActive ? activeIconClass : inactiveIconClass;
                }
            }
        });
    }

    function initNavGroup(selector) {
        const navItems = document.querySelectorAll(selector);
        if (navItems.length === 0) return;

        navItems.forEach(item => {
            // Handle click for placeholder links so they feel responsive
            item.addEventListener('click', (e) => {
                let href = item.getAttribute('href');
                if (!href || href === '#') {
                    e.preventDefault();
                    navItems.forEach(nav => nav.classList.remove('active'));
                    item.classList.add('active');
                }
            });
        });
    }

    initNavGroup('.bottom-nav .nav-item');
    initNavGroup('.nav-bar .nav-item');
    updateActiveStates();

    // 검색 오버레이 공통 로직 (전역 위임 또는 DOMContentLoaded 이후 바인딩)
    const searchOverlay = document.getElementById('search-overlay');
    if (searchOverlay) {
        const searchInput = searchOverlay.querySelector('.search-overlay-input');
        const searchIcon = searchOverlay.querySelector('.search-overlay-input-icon');

        // btn-search-open은 메인(index.html)에서는 정적, 서브페이지에서는 동적 삽입됨
        // 동적 삽입 이후에 바인딩하기 위해 문서 전체에 위임(이벤트 버블링) 사용
        document.addEventListener('click', (e) => {
            const openBtn = e.target.closest('#btn-search-open');
            if (openBtn) {
                e.preventDefault();
                searchOverlay.classList.add('open');
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

        // 검색어 제출(Enter 입력 또는 검색 아이콘 클릭) 시 검색 결과 페이지로 이동
        function submitSearch() {
            if (!searchInput) return;
            navigateToSearch(searchInput.value);
        }

        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitSearch();
                }
            });
        }

        if (searchIcon) {
            searchIcon.addEventListener('click', submitSearch);
        }
    }

    // SHOP 버튼 검색 오버레이 연결
    const shopBtns = Array.from(document.querySelectorAll('.bottom-nav .nav-item')).filter(btn => {
        const textSpan = btn.querySelector('.nav-text');
        return textSpan && textSpan.textContent.trim() === 'SHOP';
    });
    
    shopBtns.forEach(shopBtn => {
        shopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (searchOverlay) {
                searchOverlay.classList.add('open');
                const searchInput = searchOverlay.querySelector('.search-overlay-input');
                if (searchInput) {
                    setTimeout(() => searchInput.focus(), 50);
                }
            }
        });
    });

    window.addEventListener('popstate', () => {
        updateActiveStates();
    });

    const navBar = document.querySelector('.nav-bar');
    if (navBar) {
        navBar.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                navBar.scrollLeft += e.deltaY;
            }
        }, { passive: false });
    }
});

// Ad Banner Slider Logic
document.addEventListener('DOMContentLoaded', () => {
    const sliderSlides = document.querySelector('.ad-banner-slides');
    if (!sliderSlides) return;
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    
    const originalSlides = sliderSlides.querySelectorAll('img');
    const totalOriginalSlides = originalSlides.length;
    if (totalOriginalSlides === 0) return;

    // 무한 루프를 위한 첫 번째, 마지막 요소 복제
    const firstClone = originalSlides[0].cloneNode(true);
    const lastClone = originalSlides[totalOriginalSlides - 1].cloneNode(true);

    sliderSlides.appendChild(firstClone);
    sliderSlides.insertBefore(lastClone, originalSlides[0]);

    // 복제된 인덱스 포함 모든 이미지에 스타일과 클릭 이벤트 추가
    const allSlides = sliderSlides.querySelectorAll('img');
    allSlides.forEach(img => {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => {
            const productId = img.getAttribute('data-product-id');
            if (productId) {
                window.location.href = `product.html?id=${productId}`;
            }
        });
    });

    // 복제된 마지막 요소(0번 인덱스) 다음인 실제 첫 번째 요소(1번 인덱스)부터 시작
    let currentIndex = 1;
    let isTransitioning = false; // 연속 클릭 방지용 플래그

    // 초기 위치 설정 (트랜지션 없이 이동)
    sliderSlides.style.transition = 'none';
    sliderSlides.style.transform = `translateX(-${currentIndex * 100}%)`;

    function updateSlider(animate = true) {
        if (animate) {
            sliderSlides.style.transition = 'transform 0.4s ease-in-out';
        } else {
            sliderSlides.style.transition = 'none';
        }
        sliderSlides.style.transform = `translateX(-${currentIndex * 100}%)`;
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isTransitioning) return;
            isTransitioning = true;
            currentIndex++;
            updateSlider(true);
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isTransitioning) return;
            isTransitioning = true;
            currentIndex--;
            updateSlider(true);
        });
    }

    // 트랜지션이 끝났을 때 인덱스를 점프하여 무한 순환처럼 보이게 함
    sliderSlides.addEventListener('transitionend', () => {
        isTransitioning = false;
        if (currentIndex === totalOriginalSlides + 1) { // 마지막 복제본에 도달
            currentIndex = 1;
            updateSlider(false);
        } else if (currentIndex === 0) { // 첫 번째 복제본에 도달
            currentIndex = totalOriginalSlides;
            updateSlider(false);
        }
    });
});

// 전역 찜 목록 캐시 및 단일 요청 프라미스
window._wishlistCache = null;
window._wishlistFetchPromise = null;

// 찜 목록 캐시가 없다면 서버에서 최초 1회 전체 조회하여 캐시를 채우는 공통 헬퍼 (Singleflight 패턴 적용)
async function ensureWishlistLoaded() {
    if (!window._wishlistCache) {
        if (!window._wishlistFetchPromise) {
            window._wishlistFetchPromise = (async () => {
                try {
                    // silent401: 비로그인 상태에서도 홈 화면 등에서 조용히 빈 찜 목록으로 처리해야 하므로
                    // 전역 401 리다이렉트를 건너뛴다.
                    const result = await requestJson('/api/wishlists', { silent401: true });
                    if (result && result.data) {
                        return result.data.map(item => item.product.id.toString());
                    }
                    return [];
                } catch (error) {
                    if (error.status === 401) {
                        // 비로그인 상태는 정상 상태이므로 빈 배열로 캐시
                        return [];
                    }
                    // 네트워크 오류, 500 등은 캐시를 오염시키지 않고 다음 요청에서 재조회하도록 함
                    window._wishlistCache = null;
                    throw error;
                } finally {
                    window._wishlistFetchPromise = null;
                }
            })();
        }
        window._wishlistCache = await window._wishlistFetchPromise;
    }
    return window._wishlistCache;
}

// 공통 관심상품(북마크) 토글 유틸리티
window.toggleSavedProduct = async function(productId) {
    // 초기 목록 조회가 진행 중이라면 완료를 기다려, 늦게 도착한 조회 결과가
    // 이후의 토글 결과를 덮어쓰는 레이스 컨디션을 방지
    const wishlist = await ensureWishlistLoaded();
    const productIdStr = productId.toString();
    const isWished = wishlist.includes(productIdStr);
    let isSaved = isWished;

    try {
        if (isWished) {
            // 이미 찜한 상품이면 해제 요청
            await requestJson(`/api/wishlists/${productId}`, { method: 'DELETE' });
            window._wishlistCache = window._wishlistCache.filter(id => id !== productIdStr);
            isSaved = false;
        } else {
            // 찜하지 않은 상품이면 등록 요청
            await requestJson('/api/wishlists', {
                method: 'POST',
                body: { productId: Number(productId) }
            });
            // 등록 성공 후 재조회 대신 캐시에 바로 추가하여, 재조회 실패로 인한 상태 불일치를 방지
            window._wishlistCache = [...wishlist, productIdStr];
            isSaved = true;
        }
    } catch (error) {
        if (error.status === 401 || error.code === 'UNAUTHORIZED') {
            // 인증 안됨 에러 처리
            alert('로그인이 필요합니다.');
            window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
            throw error;
        }
        console.error('찜 토글 에러:', error.status, error.code, error);
        alert(error.message || '찜 처리에 실패했습니다.');
        throw error; // 실패 시 기존 상태 유지를 위해 에러 전달
    }

    // UI 업데이트 이벤트를 발생시키고 결과를 반환
    window.dispatchEvent(new CustomEvent('saved-products-updated', { detail: { productId, isSaved } }));
    return isSaved;
};

// 공통 관심상품 여부 확인 유틸리티 (비동기 및 캐싱 처리)
window.isProductSaved = async function(productOrId) {
    const productId = typeof productOrId === 'object' ? productOrId.id : productOrId;

    // 캐시가 없다면 서버에서 최초 1회 전체 조회하여 N+1 방지
    const wishlist = await ensureWishlistLoaded();

    return wishlist.includes(productId.toString());
};

// 찜 아이콘 UI 상태 공통 변경 유틸리티
window.updateWishlistIcon = function(icon, isSaved) {
    if (!icon || !document.body.contains(icon)) return;
    if (isSaved) {
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
        icon.classList.add('wished-icon');
    } else {
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
        icon.classList.remove('wished-icon');
    }
};

// 카테고리 이름별 아이콘 이미지. API 응답(id, name)에는 아이콘이 없으므로 FE에서 이름으로 매핑한다.
// 매핑에 없는 이름(백엔드에 새 카테고리가 추가된 경우 등)은 CATEGORY_DEFAULT_ICON_URL을 사용한다.
const CATEGORY_ICON_MAP = {
    '음료': 'https://em-content.zobj.net/source/apple/453/hot-beverage_2615.png',
    '베이커리·간식': 'https://em-content.zobj.net/source/apple/453/ice-cream_1f368.png',
    '축산·농산물': 'https://em-content.zobj.net/source/apple/453/cooked-rice_1f35a.png',
    '외식·상품권': 'https://em-content.zobj.net/source/apple/453/fork-and-knife-with-plate_1f37d-fe0f.png',
    '체험·관광이용권': 'https://em-content.zobj.net/source/apple/453/bow-and-arrow_1f3f9.png',
    '지역특산 선물세트': 'https://em-content.zobj.net/source/apple/453/carp-streamer_1f38f.png'
};
const CATEGORY_DEFAULT_ICON_URL = 'https://em-content.zobj.net/source/apple/453/shopping-bags_1f6cd-fe0f.png';

// 공통 카테고리 카드 마크업 생성 유틸리티 (home.js 등 여러 화면에서 재사용)
// 클릭 시 category.html?categoryId=ID(category.js)로 이동해 해당 카테고리의 상품 목록을 보여준다.
window.createCategoryCard = function(category) {
    const card = document.createElement('a');
    card.className = 'category-card';
    card.href = `category.html?categoryId=${category.id}`;
    card.dataset.categoryId = category.id;

    const name = category.name || '';
    const iconUrl = CATEGORY_ICON_MAP[name] || CATEGORY_DEFAULT_ICON_URL;

    card.innerHTML = `
      <div class="category-icon-wrapper">
        <img class="category-img" src="${iconUrl}" alt="">
      </div>
      <span class="category-name"></span>
    `;

    const imgEl = card.querySelector('.category-img');
    if (imgEl) imgEl.alt = name;
    const nameEl = card.querySelector('.category-name');
    if (nameEl) nameEl.textContent = name;

    return card;
};

// 공통 상품 카드 마크업 생성 유틸리티 (home.js, search.js 등 여러 화면에서 재사용)
window.createProductCard = function(product, options = {}) {
    const card = document.createElement('article');
    card.className = 'product-card';

    const price = Number(product.price || 0);
    const discountRate = product.discountRate || 0;
    const thumbnailUrl = product.thumbnailUrl || '';
    const name = product.name || '';
    const brand = product.brand || '';

    const formattedPrice = price.toLocaleString() + '원';
    const discountHtml = discountRate ? `<span class="discount-rate">${discountRate}%</span>` : '';
    const rankHtml = options.showRank && options.rankIndex ? `<span class="rank-badge">${options.rankIndex}</span>` : '';

    card.innerHTML = `
      <div class="card-img-wrapper skeleton">
        ${rankHtml}
        <img class="product-img" alt="" onload="this.parentElement.classList.remove('skeleton'); this.classList.add('loaded');" onerror="this.parentElement.classList.remove('skeleton'); this.style.opacity=1;">
      </div>
      <div class="card-body">
        <span class="brand-name"></span>
        <h4 class="product-title"></h4>
        <div class="price-info" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            ${discountHtml}
            <span class="price">${formattedPrice}</span>
          </div>
          <button class="btn-save-bookmark" data-product-id="${product.id}" title="저장" style="background:none; border:none; padding:4px; cursor:pointer;">
            <i class="fa-regular fa-bookmark" style="font-size: 20px; color: #999;"></i>
          </button>
        </div>
        <div class="stats-row">
          관심 0 · 리뷰 0
        </div>
      </div>
    `;

    const imgEl = card.querySelector('.product-img');
    if (imgEl) {
        imgEl.src = thumbnailUrl;
        imgEl.alt = name;
    }
    const brandEl = card.querySelector('.brand-name');
    if (brandEl) brandEl.textContent = brand;
    const titleEl = card.querySelector('.product-title');
    if (titleEl) titleEl.textContent = name;

    // Initialize save button state asynchronously
    const saveBtn = card.querySelector('.btn-save-bookmark');
    if (saveBtn) {
        const icon = saveBtn.querySelector('i');
        (async () => {
            try {
                const isSaved = await window.isProductSaved(product);
                window.updateWishlistIcon(icon, isSaved);
            } catch (error) {
                console.error('찜 상태 초기화 실패:', error);
            }
        })();

        saveBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // prevent card click
            try {
                const isNowSaved = await window.toggleSavedProduct(product.id);
                const icon = saveBtn.querySelector('i');
                window.updateWishlistIcon(icon, isNowSaved);
            } catch (error) {
                // 실패하면 기존 아이콘 유지
                console.error('찜 토글 에러:', error);
            }
        });
    }

    // Card click handler to navigate to product.html?id=ID
    card.addEventListener('click', () => {
        window.location.href = `product.html?id=${product.id}`;
    });

    return card;
};

// 공통 스켈레톤 상품 카드 마크업 생성 유틸리티 (.product-card 레이아웃과 동일한 자리표시자)
window.createSkeletonCard = function() {
    const card = document.createElement('div');
    card.className = 'product-card skeleton-card';
    card.innerHTML = `
      <div class="card-img-wrapper"><div class="skeleton skeleton-card-img"></div></div>
      <div class="card-body">
        <div class="skeleton skeleton-line" style="width:35%;height:11px;"></div>
        <div class="skeleton skeleton-line" style="width:90%;height:13px;"></div>
        <div class="skeleton skeleton-line" style="width:45%;height:15px;"></div>
      </div>
    `;
    return card;
};

// GET /api/products 기반 상품 목록 화면(검색 결과, 카테고리 상품 목록, 위시리스트 등)이 공통으로 쓰는 컨트롤러.
// listEl에 스켈레톤/결과/빈 상태/에러 상태를 그려주고, 빠른 재요청 시 오래된 응답이 최신 결과를
// 덮어쓰지 않도록 이전 요청을 취소하는 레이스 컨디션 방지 로직까지 포함한다. (search.js의 기존 로직을 일반화)
// buildRequestPath(query): query(검색어·categoryId 등)를 받아 '/api/products?...' 경로 문자열을 반환.
// emptyMessage / errorMessage: 결과 0건 / 요청 실패 시 노출할 안내 문구.
//   emptyMessage는 문자열 대신 (rawItems, products) => 문자열 함수로도 줄 수 있다.
//   (예: 위시리스트에서 mapResults가 걸러낸 항목이 있으면 "찜한 상품 없음"과 다른 문구로 안내)
// mapResults(data): 응답의 data 배열을 상품 배열로 변환하는 훅. 생략 시 data를 그대로 상품 배열로 사용한다.
//   (예: 위시리스트 API의 data는 [{product: {...}}] 형태라 item => item.product로 매핑해야 함)
// unauthorizedMessage: 지정하면 401 응답 시 errorMessage 대신 이 메시지로 안내(로그인 필요 등). 미지정 시 기존처럼 일반 에러로 처리.
// removeUnsavedCards: true면 saved-products-updated에서 찜 해제된 카드를 아이콘 동기화 대신 목록에서 완전히 제거한다.
//   (위시리스트처럼 "찜한 상품만 보여주는" 화면 전용. 미지정 시 기존처럼 아이콘만 동기화)
window.createProductListLoader = function(listEl, { buildRequestPath, emptyMessage, errorMessage, blankMessage, mapResults, unauthorizedMessage, removeUnsavedCards }) {
    function renderSkeletonState() {
        if (!listEl) return;
        listEl.classList.remove('is-empty');
        listEl.innerHTML = '';
        for (let i = 0; i < 6; i++) listEl.appendChild(createSkeletonCard());
    }

    // is-empty: 결과가 없거나 실패했을 때, 리스트 영역을 남은 화면 높이만큼 늘려
    // 안내 문구가 화면 세로 중앙에 오도록 하는 CSS 훅(style.css의 .page-search 규칙 참고)
    function renderFallbackState(message) {
        if (!listEl) return;
        listEl.classList.add('is-empty');
        listEl.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-box-open"></i>
            <p>${message}</p>
          </div>
        `;
    }

    function renderResults(products) {
        if (!listEl) return;
        listEl.classList.remove('is-empty');
        listEl.innerHTML = '';
        products.forEach(product => {
            listEl.appendChild(createProductCard(product));
        });
    }

    // removeUnsavedCards가 켜진 화면(위시리스트)에서 찜 해제된 상품의 카드를 목록에서 제거하고,
    // 마지막 카드가 사라지면 빈 목록 안내로 전환한다.
    function removeUnsavedCard(productId) {
        const btn = listEl.querySelector(`.btn-save-bookmark[data-product-id="${productId}"]`);
        const card = btn ? btn.closest('.product-card') : null;
        if (!card) return;
        card.remove();
        if (!listEl.querySelector('.product-card')) {
            // 남은 카드가 없는 것은 실제로 목록이 빈 상태이지, mapResults가 걸러낸 상황이 아니므로
            // 함수형 emptyMessage에는 빈 배열을 넘겨 "진짜 빈 목록" 문구가 나오도록 한다.
            const message = typeof emptyMessage === 'function' ? emptyMessage([], []) : emptyMessage;
            renderFallbackState(message);
        }
    }

    async function syncSaveButtons(e) {
        if (!listEl) return;

        // removeUnsavedCards 화면은 찜 해제 시 이벤트로 전달된 productId만 즉시 제거하면 되지만,
        // 다른 화면(product.html 등)에서 같은 상품을 다시 찜한 경우에는 카드를 만들 상품 정보가
        // 이벤트에 없으므로 전체 목록을 다시 불러와야 한다(이미 목록에 있으면 재조회 없이 무시).
        if (removeUnsavedCards) {
            const { productId, isSaved } = (e && e.detail) || {};
            if (productId === undefined) return;
            if (!isSaved) {
                removeUnsavedCard(productId);
            } else if (!listEl.querySelector(`.btn-save-bookmark[data-product-id="${productId}"]`)) {
                load(undefined, { showSkeleton: false });
            }
            return;
        }

        const btns = listEl.querySelectorAll('.btn-save-bookmark');
        for (const btn of btns) {
            const pid = btn.getAttribute('data-product-id');
            if (!pid) continue;
            const icon = btn.querySelector('i');
            try {
                const isSaved = await window.isProductSaved(pid);
                window.updateWishlistIcon(icon, isSaved);
            } catch (error) {
                console.error('찜 상태 동기화 실패:', error);
            }
        }
    }

    window.addEventListener('saved-products-updated', syncSaveButtons);

    // 빠르게 재요청할 때 응답이 요청 순서와 다르게 도착해 이전(오래된) 결과가
    // 최신 결과를 덮어쓰는 것을 막기 위해, 새 요청을 시작할 때마다 진행 중인 이전 요청을 취소한다.
    let current = null;

    // showSkeleton=false: 이미 결과가 떠 있는 상태에서의 재요청은 기존 카드를 그대로 유지하다가
    // 응답이 오면 바로 새 카드로 교체한다(스켈레톤 왕복으로 인한 깜빡임 방지).
    async function load(query, { showSkeleton = true } = {}) {
        if (current) {
            current.controller.abort();
            current.settle();
            current = null;
        }

        const path = buildRequestPath(query);
        if (!path) {
            const message = blankMessage || (typeof emptyMessage === 'function' ? emptyMessage([], []) : emptyMessage);
            renderFallbackState(message);
            return;
        }

        const controller = new AbortController();

        if (showSkeleton) {
            renderSkeletonState();
        }
        const settle = createSkeletonGuard(() => {
            renderFallbackState(errorMessage);
        }, 5000);

        current = { controller, settle };

        try {
            // silent401: unauthorizedMessage가 지정된 화면(예: 위시리스트)은 전역 401 리다이렉트 대신
            // 이 컨트롤러의 catch 블록에서 안내 문구로 직접 처리한다.
            const result = await requestJson(path, { signal: controller.signal, silent401: !!unauthorizedMessage });
            settle();
            if (controller.signal.aborted) return;
            const rawItems = (result && result.data && Array.isArray(result.data)) ? result.data : [];
            const products = mapResults ? mapResults(rawItems) : rawItems;
            if (products.length === 0) {
                const message = typeof emptyMessage === 'function' ? emptyMessage(rawItems, products) : emptyMessage;
                renderFallbackState(message);
            } else {
                renderResults(products);
            }
        } catch (error) {
            settle();
            if (controller.signal.aborted || error.name === 'AbortError') return;
            if (error.status === 401 && unauthorizedMessage) {
                renderFallbackState(unauthorizedMessage);
                return;
            }
            console.error('상품 목록 조회에 실패했습니다:', error);
            renderFallbackState(errorMessage);
        }
    }

    return { load };
};
