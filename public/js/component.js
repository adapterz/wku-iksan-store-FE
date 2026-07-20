document.addEventListener('DOMContentLoaded', () => {
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
