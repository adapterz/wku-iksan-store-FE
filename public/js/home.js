document.addEventListener('DOMContentLoaded', () => {
  const PRODUCT_CACHE_KEY = 'iksanstore:products:v1';
  const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;
  const CATEGORY_CACHE_KEY = 'iksanstore:categories:v1';
  const CATEGORY_CACHE_TTL_MS = 5 * 60 * 1000;

  // 상품 카드/스켈레톤 카드 마크업은 component.js가 전역에 노출한
  // createProductCard/createSkeletonCard를 재사용한다.

  // Helper to show skeleton placeholders before API data arrives
  function renderSkeletonState() {
    const list1 = document.getElementById('horizontal-list-1');
    const list2 = document.getElementById('horizontal-list-2');
    const rankingRow = document.querySelector('.ranking-cards-row');

    [list1, list2].forEach(list => {
      if (!list) return;
      list.innerHTML = '';
      for (let i = 0; i < 4; i++) list.appendChild(createSkeletonCard());
    });

    if (rankingRow) {
      rankingRow.innerHTML = '';
      for (let i = 0; i < 6; i++) rankingRow.appendChild(createSkeletonCard());
    }
  }

  // Helper to show a fallback message across every product section
  function renderFallbackState(message) {
    const list1 = document.getElementById('horizontal-list-1');
    const list2 = document.getElementById('horizontal-list-2');
    const rankingRow = document.querySelector('.ranking-cards-row');
    const html = `
      <div class="empty-state">
        <i class="fa-solid fa-box-open"></i>
        <p>${message}</p>
      </div>
    `;
    [list1, list2, rankingRow].forEach(el => { if (el) el.innerHTML = html; });

    const btnRankingMore = document.getElementById('btn-ranking-more');
    if (btnRankingMore) {
      btnRankingMore.style.display = 'none';
    }
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
  let productsVisibleCount = 6;

  // Helper to render products into layout elements
  function renderProductsData(products) {
    activeFilteredProducts = products;
    rankingVisibleCount = products.length; // Default to all products

    // Render horizontal list 1 (today's top traded)
    const list1 = document.getElementById('horizontal-list-1');
    if (list1) {
      list1.innerHTML = '';
      products.forEach(product => {
        list1.appendChild(createProductCard(product));
      });
    }

    // Render horizontal list 2 (most noted)
    const list2 = document.getElementById('horizontal-list-2');
    if (list2) {
      list2.innerHTML = '';
      [...products].reverse().forEach(product => {
        list2.appendChild(createProductCard(product));
      });
    }

    // Render ranking products
    const rankingRow = document.querySelector('.ranking-cards-row');
    if (rankingRow) {
      rankingRow.innerHTML = '';
      products.forEach((product, idx) => {
        rankingRow.appendChild(createProductCard(product, { showRank: true, rankIndex: idx + 1 }));
      });
    }

    // Hide the '더보기' button as we are rendering all by default
    const btnRankingMore = document.getElementById('btn-ranking-more');
    if (btnRankingMore) {
      btnRankingMore.style.display = 'none';
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
  // API로 받아온 카테고리 카드만 그 앞에 채워 넣는다.
  function renderCategoriesData(categories) {
    const grid = document.querySelector('.category-grid');
    if (!grid) return;
    const moreLink = grid.querySelector('.category-more');
    grid.querySelectorAll('.category-card:not(.category-more)').forEach(card => card.remove());
    categories.forEach(category => {
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
  let cachedCategories = [];

  async function loadCategories() {
    let apiCategories = [];
    try {
      const result = await window.fetchListWithCache('/api/categories', CATEGORY_CACHE_KEY, CATEGORY_CACHE_TTL_MS);
      apiCategories = result.data;
    } catch (error) {
      console.error('Failed to fetch categories from API:', error);
      apiCategories = [];
    }

    cachedCategories = apiCategories;

    if (apiCategories.length === 0) {
      hideCategorySection();
    } else {
      renderCategoriesData(apiCategories);
    }
  }

  // Call load functions
  loadProducts();
  loadCategories();

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









  // Mouse wheel horizontal scrolling for product lists
  const horizontalLists = document.querySelectorAll('.horizontal-product-list');
  horizontalLists.forEach(list => {
    list.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        list.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  });

  // Mouse wheel & drag scrolling for .category-grid
  const categoryGrid = document.querySelector('.category-grid');
  if (categoryGrid) {
    // Wheel scroll
    categoryGrid.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        categoryGrid.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    // Drag to scroll
    let isDown = false;
    let startX;
    let scrollLeft;

    categoryGrid.addEventListener('mousedown', (e) => {
      isDown = true;
      categoryGrid.style.cursor = 'grabbing';
      startX = e.pageX - categoryGrid.offsetLeft;
      scrollLeft = categoryGrid.scrollLeft;
    });
    categoryGrid.addEventListener('mouseleave', () => {
      isDown = false;
      categoryGrid.style.cursor = 'pointer';
    });
    categoryGrid.addEventListener('mouseup', () => {
      isDown = false;
      categoryGrid.style.cursor = 'pointer';
    });
    categoryGrid.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - categoryGrid.offsetLeft;
      const walk = (x - startX) * 2;
      categoryGrid.scrollLeft = scrollLeft - walk;
    });

    // 카테고리 카드는 아직 실제 이동 대상(href)이 정해지지 않은 placeholder(#)이므로,
    // 클릭 시 페이지 맨 위로 튀는 기본 동작만 막는다. '더보기'(.category-more)는 실제 링크이므로 제외.
    // API 응답으로 동적 삽입되는 카드까지 포함해야 하므로 이벤트 위임으로 처리한다.
    categoryGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.category-card');
      if (card && !card.classList.contains('category-more')) {
        e.preventDefault();
      }
    });
  }

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
      const rankingRow = document.querySelector('.ranking-cards-row');
      if (!rankingRow) return;

      if (rankingVisibleCount >= activeFilteredProducts.length) {
        alert('더 이상 불러올 상품이 없습니다.');
        return;
      }

      // Get the next 9 products
      const nextProducts = activeFilteredProducts.slice(rankingVisibleCount, rankingVisibleCount + 9);
      nextProducts.forEach((product, idx) => {
        rankingRow.appendChild(createProductCard(product, { showRank: true, rankIndex: rankingVisibleCount + idx + 1 }));
      });
      rankingVisibleCount += nextProducts.length;
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
