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

    if (currentFile !== 'index.html' && currentFile !== 'mypage.html') {
        const headerElement = document.querySelector('header.main-header');
        if (headerElement) {
            headerElement.innerHTML = getSubHeaderHTML();
            document.dispatchEvent(new Event('header:ready'));
            
            // 뒤로가기 버튼 이벤트 바인딩
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
            if (typeof requestJson === 'function') {
                const result = await requestJson('/api/auth/me');
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
                myBtn.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
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

            if (currentFile === hrefFile) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
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

// 공통 관심상품(북마크) 토글 유틸리티
window.toggleSavedProduct = async function(productId) {
    let isSaved = false;
    try {
        // 찜 추가 시도
        await requestJson('/api/wishlists', {
            method: 'POST',
            body: { productId: Number(productId) }
        });
        isSaved = true; // 성공 시 찜 상태로 변경
    } catch (error) {
        if (error.status === 401 || error.code === 'UNAUTHORIZED') {
            // 인증 안됨 에러 처리
            alert('로그인이 필요합니다.');
            window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
            return false;
        } else if (error.status === 409 || error.code === 'PRODUCT_ALREADY_WISHED') {
            // 이미 찜한 상태라면 해제 요청
            try {
                await requestJson(`/api/wishlists/${productId}`, { method: 'DELETE' });
                isSaved = false; // 성공 시 찜 해제 상태로 변경
            } catch (deleteError) {
                console.error('찜 해제 에러:', deleteError);
                return true; // 에러 시 기존 찜 상태 유지
            }
        } else {
            console.error('찜 등록 에러:', error);
            return false; // 에러 시 기존 상태 유지 (false라 가정)
        }
    }
    
    // UI 업데이트 이벤트를 발생시키고 결과를 반환
    window.dispatchEvent(new CustomEvent('saved-products-updated', { detail: { productId, isSaved } }));
    return isSaved;
};

// 백그라운드 이벤트 리스너를 통해 기존 localStorage 상태를 동기화 및 캐시 갱신
window.addEventListener('saved-products-updated', (e) => {
    if (e.detail && e.detail.productId) {
        const { productId, isSaved } = e.detail;
        let savedProducts = JSON.parse(localStorage.getItem('saved_products') || '[]');
        const productIdStr = productId.toString();
        
        // localStorage 업데이트 (하위 호환)
        if (isSaved && !savedProducts.includes(productIdStr)) {
            savedProducts.push(productIdStr);
            localStorage.setItem('saved_products', JSON.stringify(savedProducts));
        } else if (!isSaved && savedProducts.includes(productIdStr)) {
            savedProducts = savedProducts.filter(id => id !== productIdStr);
            localStorage.setItem('saved_products', JSON.stringify(savedProducts));
        }

        // 메모리 캐시 업데이트
        if (window._wishlistCache) {
            if (isSaved && !window._wishlistCache.includes(productIdStr)) {
                window._wishlistCache.push(productIdStr);
            } else if (!isSaved) {
                window._wishlistCache = window._wishlistCache.filter(id => id !== productIdStr);
            }
        }
    }
});

// 전역 찜 목록 캐시 및 단일 요청 프라미스
window._wishlistCache = null;
window._wishlistFetchPromise = null;

// 공통 관심상품 여부 확인 유틸리티 (비동기 및 캐싱 처리)
window.isProductSaved = async function(productOrId) {
    // 1. 객체 형태로 전달받았고 isWished 속성이 있다면 API 호출 없이 즉시 반환 (조회 최적화)
    if (typeof productOrId === 'object' && productOrId !== null && 'isWished' in productOrId) {
        return productOrId.isWished;
    }
    
    const productId = typeof productOrId === 'object' ? productOrId.id : productOrId;
    
    // 2. 캐시가 없다면 서버에서 최초 1회 전체 조회하여 N+1 방지 (Singleflight 패턴 적용)
    if (!window._wishlistCache) {
        if (!window._wishlistFetchPromise) {
            window._wishlistFetchPromise = (async () => {
                try {
                    const result = await requestJson('/api/wishlists');
                    if (result && result.data) {
                        return result.data.map(item => item.product.id.toString());
                    }
                } catch (error) {
                    // 비로그인(401) 또는 네트워크 에러 시 빈 배열 반환하여 false 처리
                    return [];
                }
                return [];
            })();
        }
        window._wishlistCache = await window._wishlistFetchPromise;
    }
    
    return window._wishlistCache.includes(productId.toString());
};
