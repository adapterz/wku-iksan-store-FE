document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('search-result-list');

  const urlParams = new URLSearchParams(window.location.search);
  const keyword = (urlParams.get('keyword') || '').trim();

  // 뒤로가기 + 검색 인라인 박스(keyword 표시) + 홈/영수증/선물함 아이콘으로 구성된 검색 전용 헤더 (component.js 공통 함수)
  window.renderSearchHeader(keyword);

  // 상품 카드 마크업은 component.js가 전역에 노출한 createProductCard/createSkeletonCard를 재사용한다.
  function renderSkeletonState() {
    if (!listEl) return;
    listEl.innerHTML = '';
    for (let i = 0; i < 6; i++) listEl.appendChild(createSkeletonCard());
  }

  function renderFallbackState(message) {
    if (!listEl) return;
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-box-open"></i>
        <p>${message}</p>
      </div>
    `;
  }

  function renderResults(products) {
    if (!listEl) return;
    listEl.innerHTML = '';
    products.forEach(product => {
      listEl.appendChild(createProductCard(product));
    });
  }

  async function syncSaveButtons() {
    const btns = document.querySelectorAll('#search-result-list .btn-save-bookmark');
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

  async function loadSearchResults() {
    if (!keyword) {
      renderFallbackState('검색어를 입력해주세요.');
      return;
    }

    renderSkeletonState();
    const settle = createSkeletonGuard(() => {
      renderFallbackState('상품 정보를 불러오는 데 실패했습니다.');
    }, 5000);

    try {
      const result = await requestJson(`/api/products?keyword=${encodeURIComponent(keyword)}`);
      settle();
      const products = (result && result.data && Array.isArray(result.data)) ? result.data : [];
      if (products.length === 0) {
        renderFallbackState('검색 결과가 없습니다.');
      } else {
        renderResults(products);
      }
    } catch (error) {
      settle();
      console.error('상품 검색에 실패했습니다:', error);
      renderFallbackState('상품 정보를 불러오는 데 실패했습니다.');
    }
  }

  loadSearchResults();
});
