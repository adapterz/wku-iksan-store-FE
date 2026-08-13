// 공통 서브 헤더 우측 아이콘들(검색/홈/주문내역)을 이 페이지에서만 북마크 버튼 하나로 교체
document.addEventListener('header:ready', () => {
    const headerContainer = document.querySelector('header.main-header .header-container');
    const rightIcons = document.querySelector('header.main-header .header-right-icons');
    if (!rightIcons) return;
    rightIcons.innerHTML = `
        <a href="wishlist.html" class="header-icon" title="위시리스트">
            <i class="fa-solid fa-bookmark"></i>
        </a>`;

    // 상단바 중앙 탭: 카테고리 | 브랜드
    // TODO: 브랜드를 별도 페이지로 분리하고 클릭 시 이동/active 전환 기능 추가
    if (headerContainer) {
        const centerTabs = document.createElement('div');
        centerTabs.className = 'header-center-tabs';
        centerTabs.innerHTML = `
            <span class="header-tab-btn active">카테고리</span>
            <span class="header-tab-divider">|</span>
            <span class="header-tab-btn">브랜드</span>`;
        headerContainer.appendChild(centerTabs);
    }
});

// 우측 상품 목록 로더: component.js의 공통 컨트롤러(스켈레톤/빈 상태/에러 상태/레이스 컨디션 방지) 재사용
const productListEl = document.getElementById('category-product-list');
const productListLoader = window.createProductListLoader(productListEl, {
    buildRequestPath: (categoryId) => categoryId ? `/api/products?categoryId=${encodeURIComponent(categoryId)}` : null,
    blankMessage: '왼쪽에서 카테고리를 선택해주세요.',
    emptyMessage: '해당 카테고리에 상품이 없습니다.',
    errorMessage: '상품을 불러오지 못했습니다.'
});

// 좌측 리스트에서 선택된 카테고리를 active로 강조 표시
function updateActiveCategoryLink(categoryId) {
    document.querySelectorAll('#category-list .category-list-link').forEach(link => {
        link.classList.toggle('active', link.dataset.categoryId === categoryId);
    });
}

// URL의 categoryId를 읽어 우측 상품 목록을 로드하고 좌측 강조 상태를 갱신
function syncFromUrl() {
    const categoryId = new URLSearchParams(window.location.search).get('categoryId');
    updateActiveCategoryLink(categoryId);
    productListLoader.load(categoryId);
}

// 좌측 1열 카테고리 텍스트 리스트 로딩
// 클릭 시 페이지 이동 없이 URL만 갱신(history.pushState)하고 우측 상품 목록을 즉시 로드한다.
(async function loadCategoryList() {
    const listEl = document.getElementById('category-list');
    if (!listEl) return;

    let categories = [];
    try {
        const result = await window.fetchListWithCache('/api/categories', window.CATEGORY_CACHE_KEY, window.CATEGORY_CACHE_TTL_MS);
        categories = result.data;
    } catch (error) {
        console.error('Failed to fetch categories from API:', error);
        categories = [];
    }

    listEl.innerHTML = '';
    categories.forEach(category => {
        const li = document.createElement('li');
        li.className = 'category-list-item';
        const link = document.createElement('a');
        link.className = 'category-list-link';
        link.href = `category.html?categoryId=${category.id}`;
        link.textContent = category.name || '';
        link.dataset.categoryId = String(category.id);
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const categoryId = link.dataset.categoryId;
            if (new URLSearchParams(window.location.search).get('categoryId') === categoryId) return;
            history.pushState({}, '', link.href);
            syncFromUrl();
        });
        li.appendChild(link);
        listEl.appendChild(li);
    });

    // 가장 긴 텍스트를 기준으로 모든 인라인 박스의 너비를 통일
    const links = listEl.querySelectorAll('.category-list-link');
    let maxWidth = 0;
    links.forEach(link => {
        maxWidth = Math.max(maxWidth, link.offsetWidth);
    });
    links.forEach(link => {
        link.style.width = `${maxWidth}px`;
    });

    // 카테고리 목록 로드가 끝난 뒤 초기 URL 상태를 반영 (categoryId를 들고 진입한 경우 강조 표시)
    updateActiveCategoryLink(new URLSearchParams(window.location.search).get('categoryId'));
})();

// 뒤로가기/앞으로가기 시 URL과 화면 상태 동기화
window.addEventListener('popstate', syncFromUrl);

// 최초 진입 시 categoryId가 있으면 우측 상품 목록을 바로 로드
syncFromUrl();
