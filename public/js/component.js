// 전체화면 검색 모달 공통 HTML 반환 함수
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
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><line x1="20" y1="12" x2="4" y2="12"></line><polyline points="10 18 4 12 10 6"></polyline></svg>
            </a>
            <div class="header-right-icons" style="gap: 16px;">
                <a href="#" id="btn-search-open" class="header-icon" title="검색">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16" y2="16"></line></svg>
                </a>
                <a href="index.html" class="header-icon" title="홈">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 10l8-7 8 7v10H4z"></path>
                        <line x1="10" y1="16" x2="14" y2="16"></line>
                    </svg>
                </a>
                <a href="giftbox.html" class="header-icon" title="선물함">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 8h14l1 13H4L5 8z"></path>
                        <path d="M9 11V6a3 3 0 0 1 6 0v5"></path>
                    </svg>
                </a>
                <a href="#" class="header-icon" title="더보기">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
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
        return `
        <a href="index.html" class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path class="home-path" d="M4 10l8-7 8 7v11H4z"></path>
                <line class="home-line" x1="9" y1="17" x2="15" y2="17"></line>
            </svg>
            <span class="nav-text">HOME</span>
        </a>
        <a href="#" class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect class="style-rect" x="4" y="4" width="16" height="16"></rect>
                <path class="style-heart" d="M7 8.5a1.5 1.5 0 0 1 3 0 1.5 1.5 0 0 1 3 0c0 2-3 4-3 4s-3-2-3-4z" fill="currentColor" stroke="none"></path>
                <line class="style-line" x1="7" y1="14.5" x2="17" y2="14.5"></line>
                <line class="style-line" x1="7" y1="17.5" x2="14" y2="17.5"></line>
            </svg>
            <span class="nav-text">STYLE</span>
        </a>
        <a href="#" class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="14" cy="10" r="6"></circle>
                <line x1="18.5" y1="14.5" x2="22" y2="18"></line>
                <line x1="2" y1="10" x2="6" y2="10"></line>
                <line x1="4" y1="6" x2="6" y2="6"></line>
                <line x1="4" y1="14" x2="6" y2="14"></line>
            </svg>
            <span class="nav-text">SHOP</span>
        </a>
        <a href="mypage.html" class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span class="nav-text">MY</span>
        </a>`;
    }

    // 하단 네비게이션 바 동적 삽입 (예외 페이지 제외)
    const bottomNavElements = document.querySelectorAll('nav.bottom-nav:not(.product-bottom-nav)');
    bottomNavElements.forEach(nav => {
        nav.innerHTML = getBottomNavHTML();
    });

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
