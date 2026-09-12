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
  let browsePageIndex = 0;
  let rankingVisibleCount = 6;
  const BROWSE_PAGE_SIZE = 6; // 고정 2열x3행
  const RECOMMEND_INITIAL_COUNT = 6;
  const RECOMMEND_PAGE_SIZE = 10;

  // createSkeletonCard()는 스켈레톤 전용 마크업(줄 3개)이라 실제 카드의 .product-title(고정
  // 34px)/.price-info(북마크 버튼 포함)/.stats-row 높이와 정확히 맞지 않아, 자리표시자 행의
  // 높이가 실제 카드 행과 달라져 마지막 페이지에서 박스 크기가 달라지는 원인이 됐다.
  // 대신 실제 카드와 동일한 클래스 구조를 빈 내용으로 그대로 재사용해 높이를 정확히 맞춘다.
  function createBrowseCardPlaceholder() {
    const card = document.createElement('div');
    card.className = 'product-card browse-card-placeholder';
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML = `
      <div class="card-img-wrapper"></div>
      <div class="card-body">
        <span class="brand-name">&nbsp;</span>
        <h4 class="product-title">&nbsp;</h4>
        <div class="price-info" style="display: flex; justify-content: space-between; align-items: center;">
          <div><span class="price">&nbsp;</span></div>
          <button class="btn-save-bookmark" tabindex="-1" disabled style="background:none; border:none; padding:4px;">
            <i class="fa-regular fa-bookmark" style="font-size: 20px; color: #999;"></i>
          </button>
        </div>
        <div class="stats-row">&nbsp;</div>
      </div>
    `;
    return card;
  }

  // 실제 상품 카드를 채운 뒤, 마지막 페이지처럼 6개(3x2)를 못 채우는 경우에도 그리드 크기가
  // 줄어들지 않도록 보이지 않는 자리표시자로 남은 칸을 채운다.
  function appendBrowseCards(row, products) {
    products.forEach(product => {
      row.appendChild(createProductCard(product));
    });
    for (let i = products.length; i < BROWSE_PAGE_SIZE; i++) {
      row.appendChild(createBrowseCardPlaceholder());
    }
  }

  // 둘러보기 상품 카드 그리드(.ranking-cards-row.browse-cards-row) 엘리먼트를 새로 만들어 반환한다.
  // 페이지 전환 애니메이션 중에는 기존/다음 페이지 카드를 각각 별도 엘리먼트로 띄워 나란히 이동시켜야 하므로 분리했다.
  function createBrowseCardsRow(products) {
    const row = document.createElement('div');
    row.className = 'ranking-cards-row browse-cards-row';
    appendBrowseCards(row, products);
    return row;
  }

  // 둘러보기 상품: 현재 페이지(browsePageIndex)의 6개만 그려 넣고, 좌우 버튼/인디케이터 상태를 갱신한다.
  // direction('next'|'prev')이 주어지면 기존 카드(outgoing)와 다음 카드(incoming) 패널을 뷰포트 안에
  // 나란히 배치한 뒤 같은 방향으로 함께 이동시켜, 두 페이지가 동시에 보이며 전환되는 모션을 만든다.
  // 없으면(최초 렌더 등) 애니메이션 없이 즉시 반영한다.
  let browseAnimating = false;

  function renderBrowsePage(direction) {
    const viewport = document.getElementById('browse-cards-viewport');
    const currentRow = document.getElementById('browse-product-list');
    const browsePagination = document.getElementById('browse-pagination');
    const pageIndicator = document.getElementById('browse-page-indicator');
    const btnPrev = document.getElementById('btn-browse-prev');
    const btnNext = document.getElementById('btn-browse-next');
    if (!viewport || !currentRow) return;

    const totalPages = Math.max(1, Math.ceil(activeFilteredProducts.length / BROWSE_PAGE_SIZE));
    browsePageIndex = Math.min(Math.max(browsePageIndex, 0), totalPages - 1);
    // 페이지마다 겹침 없이 순서대로 6개씩 자른다. 마지막 페이지의 나머지(전체 개수 % 6)가
    // 6개 미만이어도 박스 크기(3x2)는 appendBrowseCards의 자리표시자로 항상 고정 유지한다.
    const start = browsePageIndex * BROWSE_PAGE_SIZE;
    const pageProducts = activeFilteredProducts.slice(start, start + BROWSE_PAGE_SIZE);

    const updateControls = () => {
      if (browsePagination) browsePagination.style.display = totalPages > 1 ? '' : 'none';

      const indicatorText = `${browsePageIndex + 1} / ${totalPages}`;
      if (pageIndicator) {
        if (direction && pageIndicator.textContent !== indicatorText) {
          // 카드 슬라이드와 함께 숫자가 뚝 바뀌지 않도록, 짧게 흐려졌다가 새 값으로 살아나게 한다.
          pageIndicator.classList.add('browse-indicator-fading');
          pageIndicator.addEventListener('transitionend', function onIndicatorFadeOut() {
            pageIndicator.removeEventListener('transitionend', onIndicatorFadeOut);
            pageIndicator.textContent = indicatorText;
            pageIndicator.classList.remove('browse-indicator-fading');
          }, { once: true });
        } else if (!direction) {
          // 최초 렌더 등 애니메이션 없이 바로 반영하는 경우는 페이드 없이 즉시 반영한다.
          pageIndicator.textContent = indicatorText;
        }
      }

      if (btnPrev) btnPrev.disabled = browseAnimating || browsePageIndex === 0;
      if (btnNext) btnNext.disabled = browseAnimating || browsePageIndex >= totalPages - 1;
    };

    if (!direction) {
      currentRow.innerHTML = '';
      appendBrowseCards(currentRow, pageProducts);
      updateControls();
      return;
    }

    // 애니메이션 도중 중복 클릭 방지
    browseAnimating = true;

    const outgoingRow = currentRow;
    const incomingRow = createBrowseCardsRow(pageProducts);
    incomingRow.id = 'browse-product-list';
    outgoingRow.removeAttribute('id');

    // 패널로 전환하기 전, 절대위치가 되어도 뷰포트 높이가 무너지지 않도록 현재 높이를 먼저 재둔다.
    const outgoingHeight = outgoingRow.offsetHeight;
    outgoingRow.classList.add('browse-panel', 'browse-no-transition');
    outgoingRow.style.transform = 'translateX(0)';

    const enterFrom = direction === 'next' ? '100%' : '-100%';
    incomingRow.classList.add('browse-panel', 'browse-no-transition');
    incomingRow.style.transform = `translateX(${enterFrom})`;
    viewport.appendChild(incomingRow);

    const incomingHeight = incomingRow.offsetHeight;
    viewport.style.height = `${Math.max(outgoingHeight, incomingHeight)}px`;

    // 강제 리플로우: 두 패널의 시작 위치(transform)를 트랜지션 없이 먼저 확정한 뒤 트랜지션을 켠다
    void incomingRow.offsetWidth;
    outgoingRow.classList.remove('browse-no-transition');
    incomingRow.classList.remove('browse-no-transition');

    // 페이지 인디케이터/버튼은 슬라이드가 시작되는 시점에 목적지 페이지 기준으로 갱신한다
    updateControls();

    requestAnimationFrame(() => {
      const exitTo = direction === 'next' ? '-100%' : '100%';
      outgoingRow.style.transform = `translateX(${exitTo})`;
      incomingRow.style.transform = 'translateX(0)';
      // 가로 슬라이드와 동시에 뷰포트 높이도 목표 높이로 이징시켜, 슬라이드가 끝나는 순간
      // 높이가 뚝 끊겨 줄어들지 않고 함께 자연스럽게 마무리되게 한다.
      viewport.style.height = `${incomingHeight}px`;

      incomingRow.addEventListener('transitionend', function onSlideEnd() {
        incomingRow.removeEventListener('transitionend', onSlideEnd);

        outgoingRow.remove();
        incomingRow.classList.remove('browse-panel');
        incomingRow.style.transform = '';
        viewport.style.height = '';

        browseAnimating = false;
        updateControls();
      }, { once: true });
    });
  }

  // Helper to render products into layout elements
  function renderProductsData(products) {
    activeFilteredProducts = products;
    browsePageIndex = 0;
    rankingVisibleCount = Math.min(RECOMMEND_INITIAL_COUNT, products.length);

    renderBrowsePage();

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

  // 둘러보기 상품 좌우 페이지 이동 Click Logic
  const btnBrowsePrev = document.getElementById('btn-browse-prev');
  const btnBrowseNext = document.getElementById('btn-browse-next');

  if (btnBrowsePrev) {
    btnBrowsePrev.addEventListener('click', () => {
      if (browseAnimating || browsePageIndex <= 0) return;
      browsePageIndex -= 1;
      renderBrowsePage('prev');
    });
  }

  if (btnBrowseNext) {
    btnBrowseNext.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(activeFilteredProducts.length / BROWSE_PAGE_SIZE));
      if (browseAnimating || browsePageIndex >= totalPages - 1) return;
      browsePageIndex += 1;
      renderBrowsePage('next');
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
