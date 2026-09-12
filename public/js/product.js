// 상세정보 탭 값이 없을 때(주로 아직 콘텐츠가 채워지지 않은 상품) 빈 칸 대신 "-"로 표시
function formatDetailValue(value) {
  return value ? value : '-';
}

// 상품 데이터를 화면에 렌더링하는 함수
function renderProduct(product) {
  const timeoutStateElement = document.getElementById("product-error-state");
  const imgElement = document.getElementById("product-img");
  const imgWrapper = document.getElementById("product-img-wrapper");
  const brandElement = document.getElementById("product-brand");
  const nameElement = document.getElementById("product-name");
  const priceElement = document.getElementById("product-price");
  const descImgWrapperElement = document.getElementById("product-description-img-wrapper");
  const descImgElement = document.getElementById("product-description-img");
  const descElement = document.getElementById("product-description");
  const validPeriodElement = document.getElementById("product-valid-period");
  const usageMethodElement = document.getElementById("product-usage-method");
  const exchangeLocationElement = document.getElementById("product-exchange-location");
  const cautionElement = document.getElementById("product-caution");

  // 타임아웃으로 임시 안내가 떠 있었다면 해제하고 실제 카드를 다시 노출
  if (timeoutStateElement) timeoutStateElement.style.display = 'none';
  const cardElement = document.querySelector('.product-detail-card');
  if (cardElement) cardElement.style.display = '';

  if (imgElement) {
    imgElement.src = product.thumbnailUrl;
    imgElement.style.display = 'block';
  }
  if (imgWrapper) imgWrapper.classList.remove('skeleton');

  [brandElement, nameElement, priceElement].forEach(el => {
    if (!el) return;
    el.classList.remove('skeleton');
    el.style.minWidth = 'unset';
    el.style.minHeight = 'unset';
  });

  if (brandElement) {
    brandElement.textContent = product.brand;
    brandElement.addEventListener('click', () => {
      window.location.href = `brand.html?brand=${encodeURIComponent(product.brand)}`;
    });
  }
  if (nameElement) nameElement.textContent = product.name;
  if (priceElement) priceElement.textContent = `${product.price.toLocaleString()}원`;
  // descriptionImageUrl이 있는 상품만 이미지를 보여주고, 없으면 영역 자체를 숨긴다
  // (아직 대부분 상품이 이 값을 안 채운 상태라 빈 이미지 아이콘이 뜨는 걸 방지).
  // wrapper를 다시 보일 때는 skeleton 클래스를 매번 새로 걸어줘야 한다 — 이전에 로드된
  // 이미지가 남아있던 상태(loaded)로 다음 상품(캐시 히트 등)을 그리기 시작할 수 있어서다.
  if (descImgWrapperElement && descImgElement) {
    if (product.descriptionImageUrl) {
      descImgWrapperElement.hidden = false;
      descImgWrapperElement.classList.add('skeleton');
      descImgElement.classList.remove('loaded');
      descImgElement.src = product.descriptionImageUrl;
      descImgElement.alt = `${product.name} 상품 이미지`;
    } else {
      descImgWrapperElement.hidden = true;
    }
  }
  if (descElement) descElement.textContent = product.description || '등록된 상품설명이 없습니다.';
  if (validPeriodElement) validPeriodElement.textContent = formatDetailValue(product.validPeriod);
  if (usageMethodElement) usageMethodElement.textContent = formatDetailValue(product.usageMethod);
  if (exchangeLocationElement) exchangeLocationElement.textContent = formatDetailValue(product.exchangeLocation);
  if (cautionElement) cautionElement.textContent = formatDetailValue(product.caution);

  // Store product price globally and trigger bottom sheet price update
  const cardElementForData = document.querySelector('.product-detail-card');
  if (cardElementForData) {
    cardElementForData.dataset.price = product.price;
  }
  
  if (typeof window.updateBottomSheetPrice === 'function') {
    window.updateBottomSheetPrice();
  }
}

// 상품 데이터가 없거나 에러 발생 시 처리
function showErrorAndRedirect() {
  const container = document.querySelector('.product-detail-card');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; font-family: sans-serif;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 48px; color: #ff5a5f; margin-bottom: 20px;"></i>
        <h3 style="font-size: 18px; color: #191919; margin-bottom: 10px; font-weight: 600;">상품을 찾을 수 없습니다</h3>
        <p style="font-size: 14px; color: #767676; margin-bottom: 24px; line-height: 1.5;">존재하지 않는 상품이거나 판매가 종료된 상품입니다.</p>
        <button onclick="location.href='index.html'" style="background-color: #fee500; border: none; border-radius: 8px; padding: 12px 24px; font-size: 14px; font-weight: bold; cursor: pointer; color: #191919;">홈으로 이동</button>
      </div>
    `;
  }

  // 하단 주문 액션 바 비활성화/숨김 처리
  const bottomNav = document.querySelector('.product-bottom-nav');
  if (bottomNav) {
    bottomNav.style.display = 'none';
  }

  const timeoutStateElement = document.getElementById("product-error-state");
  if (timeoutStateElement) timeoutStateElement.style.display = 'none';
}

// 최대 노출 시간 초과: 아직 응답 대기 중이므로 카드를 잠시 숨기고 지연 안내로 전환
// (응답이 이후 도착하면 renderProduct가 카드를 되돌려 놓음)
function showProductLoadingDelayed() {
  const cardElement = document.querySelector('.product-detail-card');
  const timeoutStateElement = document.getElementById("product-error-state");
  if (cardElement) cardElement.style.display = 'none';
  if (timeoutStateElement) timeoutStateElement.style.display = 'flex';
}

// 브랜드 페이지(brand.js)와 동일하게 sessionCache를 직접 감싸 상품 상세를 상품 id별로 캐싱한다.
const PRODUCT_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const PRODUCT_DETAIL_CACHE_KEY_PREFIX = 'iksanstore:product-detail:v1:';

async function fetchProductDetailWithCache(id) {
  const cacheKey = `${PRODUCT_DETAIL_CACHE_KEY_PREFIX}${encodeURIComponent(id)}`;
  const cached = window.sessionCache
    ? window.sessionCache.get(cacheKey, PRODUCT_DETAIL_CACHE_TTL_MS)
    : null;
  if (cached) return cached;

  const result = await requestJson(`/api/products/${id}`);
  if (window.sessionCache && result) {
    window.sessionCache.set(cacheKey, result);
  }
  return result;
}

// API로부터 상품 상세 데이터 가져오기
async function loadProductDetail(id) {
  const settle = createSkeletonGuard(showProductLoadingDelayed, 1500);
  try {
    const result = await fetchProductDetailWithCache(id);
    settle();
    if (result && result.data) {
      renderProduct(result.data);
    } else {
      showErrorAndRedirect();
    }
  } catch (error) {
    settle();
    console.error("상품 상세 데이터를 불러오는 데 실패했습니다:", error);
    showErrorAndRedirect();
  }
}

// 추천 상품: 전용 추천 API가 없어, 전체 상품 목록(home.js와 동일한 GET /api/products,
// sessionCache 공유)에서 현재 상품을 제외한 뒤 무작위로 섞어 보여준다. 현재 상품 id는 URL
// 쿼리에서 바로 알 수 있으므로, 상품 상세 응답을 기다리지 않고 병렬로 조회를 시작한다.
// 화면 구조(3열x2행 + 좌우 페이지네이션)는 홈 화면 둘러보기 상품과 동일하게, component.js의
// 공용 캐러셀(createBrowseCarousel)을 그대로 재사용한다.
const PRODUCT_RECOMMEND_PAGE_SIZE = 6;
const PRODUCT_RECOMMEND_MAX_PAGES = 3;
const PRODUCT_RECOMMEND_MAX_COUNT = PRODUCT_RECOMMEND_PAGE_SIZE * PRODUCT_RECOMMEND_MAX_PAGES;

// Fisher-Yates를 필요한 개수(count)만큼만 진행하는 부분 셔플. 상품 수가 많아져도
// 실제로 보여줄 개수만큼만 뒤섞으면 되므로, 후보 전체를 섞는 것보다 저렴하다.
function pickRandomProducts(products, count) {
  const pool = products.slice();
  const limit = Math.min(count, pool.length);
  for (let i = 0; i < limit; i += 1) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}

async function loadRecommendedProducts(currentProductId) {
  const sectionEl = document.getElementById('product-recommend-section');
  if (!sectionEl) return;

  try {
    const result = await window.fetchListWithCache(
      '/api/products',
      window.PRODUCT_CACHE_KEY,
      window.PRODUCT_CACHE_TTL_MS
    );
    const candidates = (result && Array.isArray(result.data) ? result.data : [])
      .filter(product => String(product.id) !== String(currentProductId));

    if (candidates.length === 0) {
      sectionEl.hidden = true;
      return;
    }

    sectionEl.hidden = false;
    const picked = pickRandomProducts(candidates, PRODUCT_RECOMMEND_MAX_COUNT);
    window.createBrowseCarousel(sectionEl, picked, { pageSize: PRODUCT_RECOMMEND_PAGE_SIZE, loop: true });
  } catch (error) {
    console.error('추천 상품을 불러오지 못했습니다:', error);
    sectionEl.hidden = true;
  }
}


async function goToOrder(productId, type) {
  try {
    const authResult = await requestJson('/api/auth/me');

    // authResult가 없으면(=undefined) api.js 전역 인터셉터가 401을 처리(로그인 페이지 이동)한 것이므로
    // 그 이동을 order.html로 덮어쓰지 않도록 그대로 반환한다.
    if (!authResult) {
      return;
    }

    // order.html이 뒤로가기 시 history.go()로 이 상품 페이지 항목을 재사용해도 되는지
    // 판단할 수 있도록, 정상적으로 상품 페이지를 거쳐 진입했다는 표시를 남긴다.
    sessionStorage.setItem('orderEntryProductId', String(productId));
    let url = `order.html?productId=${productId}&type=${type}`;
    window.location.href = url;
  } catch (error) {
    if (error.status === 403) {
      const redirectTarget = encodeURIComponent(window.location.href);
      window.location.href = `login.html?redirect=${redirectTarget}`;
      return;
    }
    console.error('로그인 상태 확인 실패:', error);
    window.location.href = 'login.html';
  }
}

// 상품설명/선물후기/상세정보 탭 전환. 탭·패널을 data-tab/data-panel 값으로 매칭해서
// 클릭한 탭만 active 처리하고, 같은 값의 패널만 보이도록 나머지는 hidden 처리한다.
function initProductTabs() {
  const tabs = document.querySelectorAll('.product-tab');
  const panels = document.querySelectorAll('.product-tab-panel');
  if (!tabs.length || !panels.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      panels.forEach(panel => {
        panel.hidden = panel.dataset.panel !== target;
      });
    });
  });
}

// 선물후기 목록: 정렬·더보기 상태를 들고 있다가 GET /api/products/:id/reviews를 호출한다.
// 상단 요약(평균 별점·리뷰수)과 탭 라벨도 이 응답 하나로 같이 갱신한다.
const REVIEW_PAGE_SIZE = 10;
const reviewState = { page: 1, sort: 'latest', totalPages: 1, loading: false, pendingRefresh: false };

function updateReviewSummary(summary) {
  const avgEl = document.getElementById('review-average');
  const countEl = document.getElementById('review-count-text');
  const tabCountEl = document.getElementById('review-tab-count');
  if (avgEl) avgEl.textContent = summary.averageRating.toFixed(1);
  if (countEl) countEl.textContent = `리뷰 ${summary.reviewCount}`;
  if (tabCountEl) tabCountEl.textContent = summary.reviewCount;
}

// 리뷰 내용은 사용자가 작성한 텍스트이므로 XSS 방지를 위해 textContent로만 채운다.
function createReviewCard(review) {
  const card = document.createElement('article');
  card.className = 'review-card';

  const head = document.createElement('div');
  head.className = 'review-card-head';
  const nickname = document.createElement('span');
  nickname.className = 'review-card-nickname';
  nickname.textContent = review.nickname;
  const date = document.createElement('time');
  date.className = 'review-card-date';
  date.dateTime = review.createdAt;
  date.textContent = new Date(review.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  head.append(nickname, date);
  card.appendChild(head);

  const stars = document.createElement('div');
  stars.className = 'review-card-stars';
  stars.setAttribute('aria-label', `5점 만점에 ${review.rating}점`);
  stars.textContent = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  card.appendChild(stars);

  const content = document.createElement('p');
  content.className = 'review-card-content';
  content.textContent = review.content;
  card.appendChild(content);

  if (review.isMine) {
    const actions = document.createElement('div');
    actions.className = 'review-card-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'review-card-edit-btn';
    editBtn.textContent = '수정 · 삭제';
    editBtn.addEventListener('click', () => window.openReviewEditor({ reviewId: review.reviewId }));
    actions.appendChild(editBtn);
    card.appendChild(actions);
  }

  return card;
}

async function loadProductReviews(productId, { append = false } = {}) {
  if (reviewState.loading) {
    // 더보기(append) 요청은 그대로 버려도 되지만, review:changed로 인한 새로고침
    // 요청까지 버리면 저장·삭제 직후에도 목록에 이전 상태가 남는다. 진행 중인
    // 조회가 끝난 뒤 최신 목록을 다시 받아오도록 예약해둔다.
    if (!append) reviewState.pendingRefresh = true;
    return;
  }
  reviewState.loading = true;
  if (!append) reviewState.page = 1;

  const listEl = document.getElementById('review-list');
  const emptyEl = document.getElementById('review-empty');
  const moreBtn = document.getElementById('review-more');
  const sortRow = document.getElementById('review-sort-row');
  const sortSelect = document.getElementById('review-sort');
  const errorEl = document.getElementById('review-error');

  if (moreBtn) moreBtn.disabled = true;
  // 로딩 중 정렬을 바꾸면 reviewState.loading 가드에 걸려 그 요청이 조용히 버려지고
  // 드롭다운 표시값만 앞서가는 문제가 있어서, 더보기 버튼과 동일하게 select 자체를 잠근다.
  if (sortSelect) sortSelect.disabled = true;
  if (errorEl) errorEl.hidden = true;

  try {
    const result = await requestJson(
      `/api/products/${productId}/reviews?page=${reviewState.page}&limit=${REVIEW_PAGE_SIZE}&sort=${reviewState.sort}`
    );
    if (!result) return;

    const { summary, reviews } = result.data;
    updateReviewSummary(summary);

    if (!append && listEl) listEl.replaceChildren();
    if (listEl) reviews.forEach(review => listEl.appendChild(createReviewCard(review)));

    reviewState.totalPages = result.meta.totalPages;
    if (emptyEl) emptyEl.hidden = summary.reviewCount > 0;
    if (sortRow) sortRow.hidden = summary.reviewCount === 0;
    if (moreBtn) moreBtn.hidden = reviewState.page >= reviewState.totalPages;
  } catch (error) {
    console.error('선물후기 목록을 불러오지 못했습니다:', error);
    if (append) reviewState.page -= 1;
    if (errorEl) {
      errorEl.textContent = '후기를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
      errorEl.hidden = false;
    }
  } finally {
    reviewState.loading = false;
    if (moreBtn) moreBtn.disabled = false;
    if (sortSelect) sortSelect.disabled = false;
    if (reviewState.pendingRefresh) {
      reviewState.pendingRefresh = false;
      loadProductReviews(productId);
    }
  }
}

// DOM이 로드된 후 데이터 로드 실행
document.addEventListener("DOMContentLoaded", () => {
  initProductTabs();

  // URL 쿼리 파라미터에서 상품 ID 추출 (기본값 1)
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id') || 1;

  loadProductDetail(productId);
  loadProductReviews(productId);
  loadRecommendedProducts(productId);

  const reviewSortSelect = document.getElementById('review-sort');
  if (reviewSortSelect) {
    reviewSortSelect.addEventListener('change', () => {
      reviewState.sort = reviewSortSelect.value;
      loadProductReviews(productId);
    });
  }

  const reviewMoreBtn = document.getElementById('review-more');
  if (reviewMoreBtn) {
    reviewMoreBtn.addEventListener('click', () => {
      reviewState.page += 1;
      loadProductReviews(productId, { append: true });
    });
  }

  // 리뷰 작성·수정·삭제 모달(review.js)이 완료 후 쏘는 이벤트. 이 상품 페이지와
  // 관련된 변경일 때만 목록을 새로고침한다.
  document.addEventListener('review:changed', (e) => {
    if (String(e.detail.productId) === String(productId)) {
      loadProductReviews(productId);
    }
  });

  // 뒤로가기 버튼은 component.js의 bindHeaderBackButton()이 공통으로 처리한다.
  // (여기서 별도로 또 바인딩하면 클릭 한 번에 history.back()이 두 번 호출되어
  //  히스토리가 2칸 뒤로 이동하면서 홈을 건너뛰는 문제가 있었다.)

  // 위시리스트 토글 로직
  const wishBtn = document.getElementById('btn-wish');
  if (wishBtn) {
    wishBtn.addEventListener('click', () => {
      const icon = wishBtn.querySelector('i');
      const countSpan = wishBtn.querySelector('.wish-count');
      wishBtn.classList.toggle('active');

      if (wishBtn.classList.contains('active')) {
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
      } else {
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
      }

      let currentCount = parseInt(countSpan.textContent || '0', 10) || 0;
      if (wishBtn.classList.contains('active')) {
        currentCount += 1;
      } else {
        currentCount = Math.max(0, currentCount - 1);
      }
      countSpan.textContent = currentCount;
    });
  }

  // 나에게 선물하기 및 선물하기 버튼 클릭 시 로그인 상태를 먼저 확인하고 주문 페이지로 이동
  const buyBtn = document.querySelector('.btn-bottom-buy');
  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      goToOrder(productId, 'self');
    });
  }

  const giftBtn = document.querySelector('.btn-bottom-gift');
  if (giftBtn) {
    giftBtn.addEventListener('click', () => {
      goToOrder(productId, 'gift');
    });
  }

  // Save (bookmark) button logic
  const saveBtns = document.querySelectorAll('button[title="선물상자 담기"], button[aria-label="저장"]');
  saveBtns.forEach(btn => {
    // Initialize state asynchronously
    const icon = btn.querySelector('i');
    if (icon) {
      (async () => {
        try {
          const isSaved = await window.isProductSaved(productId);
          window.updateWishlistIcon(icon, isSaved);
        } catch (error) {
          console.error('찜 상태 초기화 실패:', error);
        }
      })();
    }

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const icon = btn.querySelector('i');
      if (icon) {
        try {
          const isNowSaved = await window.toggleSavedProduct(productId);
          window.updateWishlistIcon(icon, isNowSaved);
        } catch (error) {
          // 실패하면 기존 아이콘 유지
          console.error('찜 토글 에러:', error);
        }
      }
    });
  });

  // Helper to sync save buttons state
  async function syncProductSaveButtons() {
    try {
      const isSaved = await window.isProductSaved(productId);
      saveBtns.forEach(btn => {
        const icon = btn.querySelector('i');
        window.updateWishlistIcon(icon, isSaved);
      });
    } catch (error) {
      console.error('상세페이지 찜 상태 동기화 실패:', error);
    }
  }

  window.addEventListener('saved-products-updated', syncProductSaveButtons);
});
