document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('wishlist-product-list');
  if (!listEl) return;

  function renderSkeletonState() {
    listEl.classList.remove('is-empty');
    listEl.innerHTML = '';
    for (let i = 0; i < 6; i++) listEl.appendChild(createSkeletonCard());
  }

  // is-empty: page-search와 동일한 CSS 훅으로 안내 문구를 화면 세로 중앙에 배치
  function renderFallbackState(message) {
    listEl.classList.add('is-empty');
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-box-open"></i>
        <p>${message}</p>
      </div>
    `;
  }

  function renderResults(products) {
    listEl.classList.remove('is-empty');
    listEl.innerHTML = '';
    products.forEach(product => {
      listEl.appendChild(createProductCard(product));
    });
  }

  // 찜 해제 시 캐시에서는 바로 빠지지만 이 페이지의 카드 자체를 없애려면 목록을 다시 그려야 하므로,
  // 토글 이벤트에서 해제된 상품이면 이 페이지에서 즉시 제거한다.
  function handleSavedProductsUpdated(e) {
    const { productId, isSaved } = e.detail || {};
    if (isSaved || productId === undefined) return;
    const btn = listEl.querySelector(`.btn-save-bookmark[data-product-id="${productId}"]`);
    const card = btn ? btn.closest('.product-card') : null;
    if (!card) return;
    card.remove();
    if (!listEl.querySelector('.product-card')) {
      renderFallbackState('찜한 상품이 없습니다.');
    }
  }
  window.addEventListener('saved-products-updated', handleSavedProductsUpdated);

  async function loadWishlist() {
    renderSkeletonState();
    const settle = createSkeletonGuard(() => {
      renderFallbackState('찜 목록을 불러오지 못했습니다.');
    }, 5000);

    try {
      // silent401: 비로그인 상태는 전역 리다이렉트 대신 이 페이지에서 안내 문구로 처리
      const result = await requestJson('/api/wishlists', { silent401: true });
      settle();
      const products = (result && Array.isArray(result.data))
        ? result.data.map(item => item.product).filter(Boolean)
        : [];
      if (products.length === 0) {
        renderFallbackState('찜한 상품이 없습니다.');
      } else {
        renderResults(products);
      }
    } catch (error) {
      settle();
      if (error.status === 401) {
        renderFallbackState('로그인 후 위시리스트를 확인할 수 있습니다.');
        return;
      }
      console.error('위시리스트 조회에 실패했습니다:', error);
      renderFallbackState('찜 목록을 불러오지 못했습니다.');
    }
  }

  loadWishlist();
});
