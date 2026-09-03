// 공통 서브 헤더에 브랜드 페이지 제목을 추가하고, 기본 검색·홈 아이콘은 제거한다.
document.addEventListener('header:ready', () => {
    const headerContainer = document.querySelector('header.main-header .header-container');
    const rightIcons = document.querySelector('header.main-header .header-right-icons');
    if (rightIcons) rightIcons.remove();

    if (headerContainer) {
        const title = document.createElement('h1');
        title.className = 'header-title';
        title.textContent = '브랜드';
        headerContainer.appendChild(title);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const BRAND_CACHE_TTL_MS = 5 * 60 * 1000;
    const BRAND_CACHE_KEY_PREFIX = 'iksanstore:brand-api:v1:';

    // 대표 상품 사진 대신 브랜드 성격을 보여주는 전용 정적 아이콘을 우선 사용한다.
    // API에만 존재하는 새로운 브랜드는 기존 대표 상품 썸네일로 자연스럽게 대체한다.
    const BRAND_ICON_MAP = {
        '익산로컬푸드': '/images/brands/iksan-local-food.png',
        '익산로스터리': '/images/brands/iksan-roastery.png',
        '익산농협': '/images/brands/iksan-nonghyup.png',
        '익산전통식품': '/images/brands/iksan-traditional-food.png'
    };

    const searchForm = document.getElementById('brand-search-form');
    const searchInput = document.getElementById('brand-search-input');
    const listEl = document.getElementById('brand-list');
    const listTitleEl = document.getElementById('brand-list-title');
    const listCountEl = document.getElementById('brand-list-count');
    const listStateEl = document.getElementById('brand-list-state');
    const productListEl = document.getElementById('brand-product-list');
    const productHeadingEl = document.getElementById('brand-product-heading');
    const selectedBrandTitleEl = document.getElementById('selected-brand-title');

    if (!searchForm || !searchInput || !listEl || !productListEl) return;

    let brands = [];
    let brandRequestController = null;

    function getBrandCacheKey(path) {
        return `${BRAND_CACHE_KEY_PREFIX}${encodeURIComponent(path)}`;
    }

    // 홈 상품 목록과 같은 sessionStorage 캐시를 사용하되, 서버 오류는 저장하지 않는다.
    async function requestWithBrandCache(path, options = {}) {
        const cacheKey = getBrandCacheKey(path);
        const cachedResult = window.sessionCache
            ? window.sessionCache.get(cacheKey, BRAND_CACHE_TTL_MS)
            : null;

        if (cachedResult) return cachedResult;

        const result = await window.requestJson(path, options);
        if (window.sessionCache) {
            window.sessionCache.set(cacheKey, result);
        }
        return result;
    }

    // 기존 검색·카테고리 화면과 동일한 상품 카드·스켈레톤·오류 처리 컨트롤러를 재사용한다.
    const productListLoader = window.createProductListLoader(productListEl, {
        buildRequestPath: (brand) => brand
            ? `/api/products?brand=${encodeURIComponent(brand)}`
            : null,
        blankMessage: '왼쪽에서 브랜드를 선택해주세요.',
        emptyMessage: '해당 브랜드에 등록된 상품이 없습니다.',
        errorMessage: '브랜드 상품을 불러오지 못했습니다.',
        request: requestWithBrandCache
    });

    function getBrandFromUrl() {
        return (new URLSearchParams(window.location.search).get('brand') || '').trim();
    }

    function renderBrandListState(message) {
        listEl.innerHTML = '';
        listStateEl.textContent = message;
        listStateEl.hidden = false;
        listCountEl.textContent = '';
    }

    function renderBrandListSkeleton() {
        listStateEl.hidden = true;
        listEl.innerHTML = '';
        for (let index = 0; index < 4; index += 1) {
            const item = document.createElement('li');
            item.className = 'brand-list-item brand-list-skeleton';
            item.setAttribute('aria-hidden', 'true');
            item.innerHTML = `
                <span class="skeleton brand-thumbnail-skeleton"></span>
                <span class="brand-list-copy">
                    <span class="skeleton brand-name-skeleton"></span>
                    <span class="skeleton brand-count-skeleton"></span>
                </span>`;
            listEl.appendChild(item);
        }
    }

    function updateActiveBrand(brand) {
        document.querySelectorAll('#brand-list .brand-list-button').forEach(button => {
            const isActive = button.dataset.brand === brand;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
    }

    function createBrandListItem(brandData) {
        const item = document.createElement('li');
        item.className = 'brand-list-item';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'brand-list-button';
        button.dataset.brand = brandData.brand;
        button.setAttribute('aria-pressed', 'false');

        const thumbnailWrapper = document.createElement('span');
        thumbnailWrapper.className = 'brand-thumbnail-wrapper skeleton';

        const thumbnail = document.createElement('img');
        thumbnail.className = 'brand-thumbnail';
        thumbnail.alt = '';
        const brandIconUrl = BRAND_ICON_MAP[brandData.brand];
        const apiThumbnailUrl = brandData.thumbnailUrl || '';
        let triedApiThumbnail = !brandIconUrl;

        thumbnail.addEventListener('load', () => {
            thumbnailWrapper.classList.remove('skeleton');
            thumbnail.classList.add('loaded');
        });
        thumbnail.addEventListener('error', () => {
            // 전용 아이콘 파일만 실패한 경우에는 API가 제공한 대표 상품 이미지로 한 번 더 대체한다.
            if (!triedApiThumbnail && apiThumbnailUrl) {
                triedApiThumbnail = true;
                thumbnail.classList.remove('brand-icon', 'loaded');
                thumbnail.src = apiThumbnailUrl;
                return;
            }

            thumbnailWrapper.classList.remove('skeleton');
            thumbnail.hidden = true;
            thumbnailWrapper.classList.add('has-fallback');
            thumbnailWrapper.setAttribute('aria-hidden', 'true');
        });
        thumbnailWrapper.appendChild(thumbnail);

        const thumbnailUrl = brandIconUrl || apiThumbnailUrl;
        if (brandIconUrl) thumbnail.classList.add('brand-icon');

        if (thumbnailUrl) {
            thumbnail.src = thumbnailUrl;
        } else {
            thumbnail.hidden = true;
            thumbnailWrapper.classList.remove('skeleton');
            thumbnailWrapper.classList.add('has-fallback');
            thumbnailWrapper.setAttribute('aria-hidden', 'true');
        }

        const copy = document.createElement('span');
        copy.className = 'brand-list-copy';

        const name = document.createElement('strong');
        name.className = 'brand-list-name';
        name.textContent = brandData.brand;

        const count = document.createElement('span');
        count.className = 'brand-product-count';
        count.textContent = `상품 ${Number(brandData.productCount || 0).toLocaleString()}개`;

        copy.append(name, count);
        button.append(thumbnailWrapper, copy);
        button.addEventListener('click', () => selectBrand(brandData.brand));
        item.appendChild(button);
        return item;
    }

    function renderBrands(items) {
        brands = items;
        listEl.innerHTML = '';
        listStateEl.hidden = true;
        listTitleEl.textContent = '전체 브랜드';
        listCountEl.textContent = `${items.length}개`;

        if (items.length === 0) {
            renderBrandListState('검색 결과가 없습니다.');
            return;
        }

        items.forEach(brand => listEl.appendChild(createBrandListItem(brand)));
        updateActiveBrand(getBrandFromUrl());
    }

    async function loadBrands(keyword = '') {
        if (brandRequestController) brandRequestController.abort();
        brandRequestController = new AbortController();
        const controller = brandRequestController;
        const normalizedKeyword = keyword.trim();
        const path = normalizedKeyword
            ? `/api/brands?keyword=${encodeURIComponent(normalizedKeyword)}`
            : '/api/brands';

        renderBrandListSkeleton();

        try {
            // 대표 목록과 검색 결과 모두 같은 5분 캐시 규칙을 사용한다.
            const result = await requestWithBrandCache(path, { signal: controller.signal });
            if (controller.signal.aborted) return;
            const items = result && Array.isArray(result.data) ? result.data : [];
            renderBrands(items);
        } catch (error) {
            if (controller.signal.aborted || error.name === 'AbortError') return;
            console.error('브랜드 목록 조회에 실패했습니다:', error);
            listTitleEl.textContent = '전체 브랜드';
            renderBrandListState('브랜드를 불러오지 못했습니다.');
        } finally {
            if (brandRequestController === controller) brandRequestController = null;
        }
    }

    function loadSelectedBrand(brand, options) {
        const normalizedBrand = (brand || '').trim();
        updateActiveBrand(normalizedBrand);

        if (normalizedBrand) {
            selectedBrandTitleEl.textContent = normalizedBrand;
            productHeadingEl.hidden = false;
        } else {
            selectedBrandTitleEl.textContent = '';
            productHeadingEl.hidden = true;
        }

        productListLoader.load(normalizedBrand, options);
    }

    function selectBrand(brand) {
        if (getBrandFromUrl() === brand) return;
        const url = `brand.html?brand=${encodeURIComponent(brand)}`;
        // 브랜드 전환은 같은 화면 안에서의 상태 변경이므로 히스토리를 새로 쌓지 않고 현재 엔트리를 갱신한다.
        history.replaceState({}, '', url);
        window.refreshBottomNavLoginLink();
        loadSelectedBrand(brand);
    }

    searchForm.addEventListener('submit', event => {
        event.preventDefault();
        loadBrands(searchInput.value);
    });

    // 검색창의 지우기 버튼으로 값이 비워지면 대표 브랜드 목록을 즉시 복원한다.
    searchInput.addEventListener('search', () => {
        if (!searchInput.value.trim()) loadBrands();
    });

    window.addEventListener('popstate', () => {
        const brand = getBrandFromUrl();
        window.refreshBottomNavLoginLink();
        loadSelectedBrand(brand);

        if (brand && !brands.some(item => item.brand === brand)) {
            searchInput.value = brand;
            loadBrands(brand);
        }
    });

    // URL에 brand 값이 있어도(뒤로가기로 재진입 등) 검색 모드로 전환하지 않고,
    // 항상 대표 브랜드 목록을 불러온 뒤 해당 브랜드를 활성화 상태로 복원한다.
    const initialBrand = getBrandFromUrl();
    loadBrands();
    loadSelectedBrand(initialBrand);
});
