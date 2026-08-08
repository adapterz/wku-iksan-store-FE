document.addEventListener('DOMContentLoaded', () => {
  const PRODUCT_CACHE_KEY = 'iksanstore:products:v1';
  const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;

  // Helper to dynamically build a product card element
  function createProductCard(product, options = {}) {
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
  }

  // Helper to build one skeleton product card matching .product-card layout
  function createSkeletonCard() {
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
  }

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
    const sessionProducts = window.sessionCache
      ? window.sessionCache.get(PRODUCT_CACHE_KEY, PRODUCT_CACHE_TTL_MS)
      : null;

    if (Array.isArray(sessionProducts)) {
      cachedProducts = sessionProducts;

      if (sessionProducts.length === 0) {
        showEmptyState();
      } else {
        renderProductsData(sessionProducts);
      }
      return;
    }

    renderSkeletonState();
    const settle = createSkeletonGuard(showErrorState, 5000);

    let apiProducts = [];
    let fetchFailed = false;
    try {
      const result = await requestJson('/api/products');
      if (result && result.data && Array.isArray(result.data)) {
        apiProducts = result.data;
        if (window.sessionCache) {
          window.sessionCache.set(PRODUCT_CACHE_KEY, apiProducts);
        }
      }
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

  // Call load functions
  loadProducts();

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

    // Disable click navigation for all category items (ui only)
    const categoryCards = categoryGrid.querySelectorAll('.category-card');
    categoryCards.forEach((card) => {
      card.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default link behavior (jumping to top)
        // Additional functional behaviors are disabled here
      });
    });

    // Handle '더보기' button click normally if clicked without dragging
    // The browser natively handles link clicks if drag isn't significantly moving the mouse.
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
