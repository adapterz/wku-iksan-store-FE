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

    // SHOP 버튼 검색 오버레이 연결
    const shopBtns = Array.from(document.querySelectorAll('.bottom-nav .nav-item')).filter(btn => {
        const textSpan = btn.querySelector('.nav-text');
        return textSpan && textSpan.textContent.trim() === 'SHOP';
    });
    
    shopBtns.forEach(shopBtn => {
        shopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const topSearchBtn = document.getElementById('btn-search-open');
            if (topSearchBtn) {
                topSearchBtn.click(); // 기존 로직 재사용
            } else {
                const searchOverlay = document.getElementById('search-overlay');
                if (searchOverlay) {
                    searchOverlay.classList.add('show');
                    searchOverlay.classList.add('open');
                }
            }
        });
    });

    // 검색 오버레이 닫기(뒤로가기) 시 active 상태 복구
    const searchCloseBtn = document.getElementById('btn-search-close');
    if (searchCloseBtn) {
        searchCloseBtn.addEventListener('click', () => {
            updateActiveStates();
        });
    }

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
