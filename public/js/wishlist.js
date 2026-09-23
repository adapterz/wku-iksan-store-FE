document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('wishlist-product-list');
  if (!listEl) return;

  // 스켈레톤/빈 상태/에러 상태 렌더링, 요청 취소(레이스 컨디션 방지)는 component.js의 공통 컨트롤러를 재사용한다.
  // 위시리스트 API 응답(data가 [{product:{...}}] 형태)은 mapResults로 상품 배열로 변환해서 넘기고,
  // removeUnsavedCards: 찜 해제 시 아이콘만 동기화하는 다른 화면과 달리 이 화면은 카드 자체를 목록에서 제거한다.
  const wishlistLoader = window.createProductListLoader(listEl, {
    buildRequestPath: () => '/api/wishlists',
    mapResults: (items) => {
      // 이 화면의 카드는 전부 이미 찜한 상품이므로, 조회 결과로 전역 찜 캐시를 미리 채워
      // 카드별 isProductSaved() 확인이 /api/wishlists를 다시 호출하지 않도록 한다.
      window._wishlistCache = items
        .filter(item => item.product)
        .map(item => item.product.id.toString());
      return items.map(item => item.product).filter(Boolean);
    },
    // 찜한 상품 자체가 없는 경우와, 찜한 상품이 있었지만 카탈로그에서 삭제되어 product가 null로
    // 내려온 경우(mapResults의 filter(Boolean)가 걸러냄)를 구분해서 안내한다.
    emptyMessage: (rawItems, products) => {
      const hasDeletedItems = rawItems.length > 0 && products.length === 0;
      return hasDeletedItems
        ? '찜한 상품 중 판매가 종료되었거나 삭제된 상품이 있습니다.'
        : '찜한 상품이 없습니다.';
    },
    errorMessage: '찜 목록을 불러오지 못했습니다.',
    // 계정 전용 로더는 401도 소유자 확인 후 처리해 이전 응답이 새 계정을 리다이렉트하지 않게 한다.
    removeUnsavedCards: true,
    accountScoped: true
  });

  // 최초 계정 확인 전에도 공백 화면 대신 로딩 상태를 표시한다.
  listEl.classList.remove('is-empty');
  listEl.innerHTML = '';
  for (let i = 0; i < 6; i++) listEl.appendChild(createSkeletonCard());

  // 최초 진입뿐 아니라 탭 복귀/계정 전환도 공통 확인을 재사용한다.
  // 비회원은 기존 정책대로 로그인 화면으로 이동하고, 계정 확인 실패는 재시도 안내로 구분한다.
  window.registerAccountView({
    clear: () => {
      wishlistLoader.cancel();
      wishlistLoader.renderMessage('로그인 상태를 확인하고 있습니다.');
    },
    load: () => wishlistLoader.load(),
    error: () => wishlistLoader.renderMessage('로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.')
  });
});
