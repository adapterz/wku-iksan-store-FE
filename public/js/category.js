document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('category-result-list');
  const titleEl = document.getElementById('category-title');

  function getCategoryIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const categoryId = urlParams.get('categoryId');
    return categoryId && /^\d+$/.test(categoryId) ? categoryId : '';
  }

  // 카테고리 이름은 API가 내려주지 않으므로(카테고리 목록 API와 별개), 홈 화면에서 카테고리 그리드를
  // 렌더링할 때 sessionCache에 저장해 둔 카테고리 목록에서 찾아 타이틀에 표시한다.
  function findCategoryName(categoryId) {
    const categories = window.sessionCache
      ? window.sessionCache.get(window.CATEGORY_CACHE_KEY, window.CATEGORY_CACHE_TTL_MS)
      : null;
    if (!Array.isArray(categories)) return '';
    const found = categories.find(c => String(c.id) === categoryId);
    return found ? found.name : '';
  }

  function renderTitle(categoryId) {
    if (!titleEl) return;
    const name = findCategoryName(categoryId);
    titleEl.textContent = name ? `${name} 카테고리 상품` : '카테고리 상품';
  }

  // 상품 목록 로딩/렌더링/레이스 컨디션 방지 로직은 component.js의 공통 컨트롤러를 재사용한다.
  const productList = window.createProductListLoader(listEl, {
    buildRequestPath: (categoryId) => categoryId ? `/api/products?categoryId=${encodeURIComponent(categoryId)}` : null,
    blankMessage: '카테고리 정보를 확인할 수 없습니다.',
    emptyMessage: '카테고리에 등록된 상품이 없습니다.',
    errorMessage: '상품 정보를 불러오는 데 실패했습니다.'
  });

  function loadCategoryResults(categoryId) {
    renderTitle(categoryId);
    productList.load(categoryId);
  }

  loadCategoryResults(getCategoryIdFromUrl());

  // 뒤로가기/앞으로가기로 categoryId가 바뀌는 경우(예: 카테고리 그리드에서 다른 카테고리로 재진입) 동기화한다.
  window.addEventListener('popstate', () => {
    loadCategoryResults(getCategoryIdFromUrl());
  });
});
