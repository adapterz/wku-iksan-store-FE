document.addEventListener('DOMContentLoaded', () => {
  // 캐시 키·TTL은 category.js와 공유해야 하므로 api.js가 노출한 전역 상수를 사용한다.
  const PRODUCT_CACHE_KEY = window.PRODUCT_CACHE_KEY;
  const PRODUCT_CACHE_TTL_MS = window.PRODUCT_CACHE_TTL_MS;
  const CATEGORY_CACHE_KEY = window.CATEGORY_CACHE_KEY;
  const CATEGORY_CACHE_TTL_MS = window.CATEGORY_CACHE_TTL_MS;

  // 상품 카드/스켈레톤 카드 마크업은 component.js가 전역에 노출한
  // createProductCard/createSkeletonCard를 재사용한다.

  // Helper to show skeleton placeholders before API data arrives
  function renderSkeletonState() {
    const browseRow = document.getElementById('browse-product-list');
    const recommendRow = document.getElementById('recommend-product-list');

    [browseRow, recommendRow].forEach(row => {
      if (!row) return;
      row.innerHTML = '';
      for (let i = 0; i < 6; i++) row.appendChild(createSkeletonCard());
    });
  }

  // Helper to show a fallback message across every product section
  function renderFallbackState(message) {
    const browseRow = document.getElementById('browse-product-list');
    const recommendRow = document.getElementById('recommend-product-list');
    const html = `
      <div class="empty-state">
        <i class="fa-solid fa-box-open"></i>
        <p>${message}</p>
      </div>
    `;
    [browseRow, recommendRow].forEach(el => { if (el) el.innerHTML = html; });

    const browsePagination = document.getElementById('browse-pagination');
    if (browsePagination) browsePagination.style.display = 'none';

    const btnRankingMore = document.getElementById('btn-ranking-more');
    if (btnRankingMore) btnRankingMore.style.display = 'none';
  }

  // Helper to show empty state when no products are found
  function showEmptyState() {
    renderFallbackState('등록된 상품이 없습니다.');
  }

  // Helper to show error state when API request fails or times out
  function showErrorState() {
    renderFallbackState('상품 정보를 불러오는 데 실패했습니다.');
  }
  let cachedProducts = [];
  let activeFilteredProducts = [];
  let rankingVisibleCount = 6;
  const BROWSE_PAGE_SIZE = 6; // 고정 3열x2행
  const RECOMMEND_INITIAL_COUNT = 6;
  const RECOMMEND_PAGE_SIZE = 10;

  // Helper to render products into layout elements
  function renderProductsData(products) {
    activeFilteredProducts = products;
    rankingVisibleCount = Math.min(RECOMMEND_INITIAL_COUNT, products.length);

    // 둘러보기 상품: component.js의 공용 캐러셀(페이지당 6개, 3열x2행 + 좌우 페이지네이션)을 재사용한다.
    window.createBrowseCarousel(document.getElementById('browse-section'), products, { pageSize: BROWSE_PAGE_SIZE });

    // Render recommend products (초기에는 RECOMMEND_INITIAL_COUNT개까지만 노출)
    const recommendRow = document.getElementById('recommend-product-list');
    if (recommendRow) {
      recommendRow.innerHTML = '';
      products.slice(0, rankingVisibleCount).forEach((product, idx) => {
        recommendRow.appendChild(createProductCard(product, { showRank: true, rankIndex: idx + 1 }));
      });
    }

    // 남은 상품이 있을 때만 '더보기' 버튼을 노출한다
    const btnRankingMore = document.getElementById('btn-ranking-more');
    if (btnRankingMore) {
      btnRankingMore.style.display = rankingVisibleCount < products.length ? '' : 'none';
    }
  }

  // 5분 이내의 상품 캐시가 있으면 재요청 없이 사용하고, 없으면 API에서 새로 조회한다.
  async function loadProducts() {
    const cached = window.sessionCache
      ? window.sessionCache.get(PRODUCT_CACHE_KEY, PRODUCT_CACHE_TTL_MS)
      : null;

    if (Array.isArray(cached)) {
      cachedProducts = cached;

      if (cached.length === 0) {
        showEmptyState();
      } else {
        renderProductsData(cached);
      }
      return;
    }

    renderSkeletonState();
    const settle = createSkeletonGuard(showErrorState, 5000);

    let apiProducts = [];
    let fetchFailed = false;
    try {
      const result = await window.fetchListWithCache('/api/products', PRODUCT_CACHE_KEY, PRODUCT_CACHE_TTL_MS);
      apiProducts = result.data;
    } catch (error) {
      console.error('Failed to fetch products from API:', error);
      fetchFailed = true;
    }

    settle();
    cachedProducts = apiProducts;

    if (fetchFailed) {
      showErrorState();
    } else if (apiProducts.length === 0) {
      showEmptyState();
    } else {
      renderProductsData(apiProducts);
    }
  }

  // 카테고리 카드 마크업은 component.js가 전역에 노출한 createCategoryCard를 재사용한다.
  // 그리드 마지막에 정적으로 남아있는 '더보기' 항목(.category-more)은 그대로 두고,
  // 가로 스크롤 없이 한 화면(카테고리 4개 + 더보기)에 담기도록 앞 4개 카테고리만 그 앞에 채워 넣는다.
  const HOME_CATEGORY_DISPLAY_COUNT = 4;

  function renderCategoriesData(categories) {
    const grid = document.querySelector('.category-grid');
    if (!grid) return;
    const moreLink = grid.querySelector('.category-more');
    grid.querySelectorAll('.category-card:not(.category-more)').forEach(card => card.remove());
    categories.slice(0, HOME_CATEGORY_DISPLAY_COUNT).forEach(category => {
      grid.insertBefore(createCategoryCard(category), moreLink);
    });
  }

  // 카테고리가 없거나 조회에 실패하면, 하드코딩된 대체 문구 대신 섹션 자체를 숨겨
  // 빈 그리드가 화면에 노출되지 않게 한다.
  function hideCategorySection() {
    const section = document.querySelector('.category-section');
    if (section) section.style.display = 'none';
  }

  // 카테고리 목록은 자주 바뀌지 않으므로 캐시가 있으면 API 요청 없이 바로 그린다.
  async function loadCategories() {
    let apiCategories = [];
    try {
      const result = await window.fetchListWithCache('/api/categories', CATEGORY_CACHE_KEY, CATEGORY_CACHE_TTL_MS);
      apiCategories = result.data;
    } catch (error) {
      console.error('Failed to fetch categories from API:', error);
      apiCategories = [];
    }

    if (apiCategories.length === 0) {
      hideCategorySection();
    } else {
      renderCategoriesData(apiCategories);
    }
  }

  // Call load functions
  loadProducts();
  loadCategories();

  // 노출 기준 안내 툴팁: 여닫힘 로직은 component.js의 공용 유틸리티(찜 랭킹에서 사용한 것과 동일)를 재사용한다.
  window.initInfoTooltip(
    document.getElementById('browse-info-btn'),
    document.getElementById('browse-info-tooltip')
  );
  window.initInfoTooltip(
    document.getElementById('recommend-info-btn'),
    document.getElementById('recommend-info-tooltip')
  );

  // Sync save buttons state across the page
  async function syncSaveButtons() {
    const btns = document.querySelectorAll('.btn-save-bookmark');
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

  // component.js가 화면에 보이는 카드 DOM과 sessionStorage 캐시는 이미 갱신해주지만,
  // cachedProducts/activeFilteredProducts는 이 화면이 메모리에 들고 있는 원본 배열이라
  // 거기까진 손대지 못한다. 이 배열을 그대로 두면 "다음 목록 → 이전 목록"처럼 같은
  // 페이지 안에서 카드를 다시 그릴 때(renderBrowsePage/둘러보기 더보기 등) 토글 이전
  // wishlistCount로 되돌아간다. 두 배열이 항상 같은 상품 객체를 참조하므로(loadProducts에서
  // activeFilteredProducts = cachedProducts로 대입), 한 객체를 두 번 세지 않도록 Set으로
  // 이미 처리한 객체를 걸러내고 각 배열을 순회해 원본 wishlistCount 자체를 보정한다.
  function patchLocalProductCounts(productId, delta) {
    const targetId = Number(productId);
    const patched = new Set();
    [cachedProducts, activeFilteredProducts].forEach(list => {
      list.forEach(item => {
        if (item && item.id === targetId && item.wishlistCount !== undefined && !patched.has(item)) {
          item.wishlistCount = Math.max(0, item.wishlistCount + delta);
          patched.add(item);
        }
      });
    });
  }

  window.addEventListener('saved-products-updated', (e) => {
    const { productId, isSaved } = e.detail;
    patchLocalProductCounts(productId, isSaved ? 1 : -1);
  });









  // Sub Tab Segmented Control (선물 테마, 카테고리, 추천 브랜드) Click Logic
  const pillBtns = document.querySelectorAll('.pill-btn');
  const pillSelector = document.querySelector('.pill-selector');
  if (pillBtns.length > 0 && pillSelector) {
    pillBtns.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        pillBtns.forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        pillSelector.style.setProperty('--active-index', idx);
      });
    });
  }

  // Real-time Ranking "더보기" (Show More) Click Logic
  const btnRankingMore = document.getElementById('btn-ranking-more');

  if (btnRankingMore) {
    btnRankingMore.addEventListener('click', () => {
      const rankingRow = document.getElementById('recommend-product-list');
      if (!rankingRow) return;

      if (rankingVisibleCount >= activeFilteredProducts.length) return;

      // Get the next RECOMMEND_PAGE_SIZE products (남은 상품이 더 적으면 남은 만큼만)
      const nextProducts = activeFilteredProducts.slice(rankingVisibleCount, rankingVisibleCount + RECOMMEND_PAGE_SIZE);
      nextProducts.forEach((product, idx) => {
        rankingRow.appendChild(createProductCard(product, { showRank: true, rankIndex: rankingVisibleCount + idx + 1 }));
      });
      rankingVisibleCount += nextProducts.length;

      // 더 이상 남은 상품이 없으면 버튼을 숨긴다
      if (rankingVisibleCount >= activeFilteredProducts.length) {
        btnRankingMore.style.display = 'none';
      }
    });
  }



  // 로그인 상태 기반 UI 업데이트 (component.js의 이벤트 리스닝)
  document.addEventListener('auth:updated', (e) => {
    const { isLoggedIn, nickname } = e.detail;
    const recTitle = document.getElementById('recommendation-title');
    
    if (recTitle) {
      if (isLoggedIn && nickname) {
        recTitle.textContent = `${nickname}님을 위한 추천 상품`;
      } else {
        recTitle.textContent = '회원님을 위한 추천 상품';
      }
    }
  });
});
