// 공통 서브 헤더가 기본 제공하는 검색·홈 아이콘을 찜 페이지에서는 제거한다.
document.addEventListener('header:ready', () => {
  const rightIcons = document.querySelector('header.main-header .header-right-icons');
  if (rightIcons) rightIcons.remove();
});

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
    // unauthorizedMessage를 지정하지 않으면 load() 내부에서 401 시 공통 리다이렉트(api.js)를 그대로 탄다.
    // 이 화면은 아래 auth:updated에서 비로그인 시 load() 자체를 호출하지 않지만, 로그인 상태 확인과
    // 실제 조회 사이의 레이스 컨디션으로 세션이 만료된 경우에도 동일하게 로그인 화면으로 보내기 위함이다.
    removeUnsavedCards: true
  });

  // 로그인 상태 확인(auth:updated) 전에도 공백 화면 없이 로딩 중임을 보여주기 위해
  // 로더의 스켈레톤과 동일한 마크업을 이 시점에 직접 그린다. 실제 데이터 요청은 로그인 여부가
  // 확정된 뒤(아래 auth:updated)에만 시작하므로 /api/wishlists로의 불필요한 401 요청은 없다.
  listEl.classList.remove('is-empty');
  listEl.innerHTML = '';
  for (let i = 0; i < 6; i++) listEl.appendChild(createSkeletonCard());

  // component.js가 페이지 로드마다 한 번 확인하는 로그인 상태(/api/auth/me → auth:updated)를 재사용해,
  // 비로그인 사용자는 /api/wishlists 요청 자체를 생략한다(중복 인증 확인 및 불필요한 401 왕복 방지).
  // 이슈 #55 회의 결정: 비로그인 접근 시 안내 문구 없이 로그인 화면으로 즉시 이동한다.
  document.addEventListener('auth:updated', (e) => {
    const { isLoggedIn } = e.detail || {};
    if (isLoggedIn) {
      wishlistLoader.load();
    } else {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
    }
  }, { once: true });
});
