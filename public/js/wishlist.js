document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('wishlist-product-list');
  if (!listEl) return;

  // 스켈레톤/빈 상태/에러 상태 렌더링, 요청 취소(레이스 컨디션 방지), 북마크 아이콘 동기화(syncSaveButtons)는
  // component.js의 공통 컨트롤러를 재사용한다. 위시리스트 API 응답(data가 [{product:{...}}] 형태)만
  // mapResults로 상품 배열로 변환해서 넘긴다.
  const wishlistLoader = window.createProductListLoader(listEl, {
    buildRequestPath: () => '/api/wishlists',
    mapResults: (items) => items.map(item => item.product).filter(Boolean),
    emptyMessage: '찜한 상품이 없습니다.',
    errorMessage: '찜 목록을 불러오지 못했습니다.',
    unauthorizedMessage: '로그인 후 위시리스트를 확인할 수 있습니다.'
  });

  // 로더의 syncSaveButtons는 같은 이벤트로 아이콘 상태만 동기화하고 카드는 지우지 않으므로,
  // 찜 해제 시 이 페이지에서만 카드 자체를 목록에서 제거하는 역할을 별도로 담당한다.
  function handleSavedProductsUpdated(e) {
    const { productId, isSaved } = e.detail || {};
    if (isSaved || productId === undefined) return;
    const btn = listEl.querySelector(`.btn-save-bookmark[data-product-id="${productId}"]`);
    const card = btn ? btn.closest('.product-card') : null;
    if (!card) return;
    card.remove();
    if (!listEl.querySelector('.product-card')) {
      listEl.classList.add('is-empty');
      listEl.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-box-open"></i>
          <p>찜한 상품이 없습니다.</p>
        </div>
      `;
    }
  }
  window.addEventListener('saved-products-updated', handleSavedProductsUpdated);

  wishlistLoader.load();
});
