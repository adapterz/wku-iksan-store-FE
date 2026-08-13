document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('wishlist-product-list');
  if (!listEl) return;

  // 스켈레톤/빈 상태/에러 상태 렌더링, 요청 취소(레이스 컨디션 방지)는 component.js의 공통 컨트롤러를 재사용한다.
  // 위시리스트 API 응답(data가 [{product:{...}}] 형태)은 mapResults로 상품 배열로 변환해서 넘기고,
  // removeUnsavedCards: 찜 해제 시 아이콘만 동기화하는 다른 화면과 달리 이 화면은 카드 자체를 목록에서 제거한다.
  const wishlistLoader = window.createProductListLoader(listEl, {
    buildRequestPath: () => '/api/wishlists',
    mapResults: (items) => items.map(item => item.product).filter(Boolean),
    emptyMessage: '찜한 상품이 없습니다.',
    errorMessage: '찜 목록을 불러오지 못했습니다.',
    unauthorizedMessage: '로그인 후 위시리스트를 확인할 수 있습니다.',
    removeUnsavedCards: true
  });

  wishlistLoader.load();
});
