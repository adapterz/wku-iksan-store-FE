document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('search-result-list');

  function getKeywordFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return (urlParams.get('keyword') || '').trim();
  }

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

  // showSkeleton=false: 이미 결과가 떠 있는 상태에서의 재검색은 기존 카드를 그대로 유지하다가
  // 응답이 오면 바로 새 카드로 교체한다(스켈레톤 왕복으로 인한 깜빡임 방지).
  async function loadSearchResults(keyword, { showSkeleton = true } = {}) {
    if (!keyword) {
      renderFallbackState('검색어를 입력해주세요.');
      return;
    }

    if (showSkeleton) {
      renderSkeletonState();
    }
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

  // 검색 페이지 안에서의 재검색: 페이지 새로고침 없이 URL만 갱신하고, 기존 카드는 그대로 유지하다가
  // 응답이 오면 바로 교체한다(스켈레톤 왕복 없음 → 깜빡임 없음).
  window.onSearchPageKeywordSubmit = function(keyword) {
    history.pushState(null, '', `search.html?keyword=${encodeURIComponent(keyword)}`);
    loadSearchResults(keyword, { showSkeleton: false });
  };

  // 뒤로가기 + 검색 인라인 박스(keyword 표시) + 홈/영수증/선물함 아이콘으로 구성된 검색 전용 헤더 (component.js 공통 함수)
  window.renderSearchHeader(getKeywordFromUrl());

  loadSearchResults(getKeywordFromUrl());

  // 브라우저 뒤로가기/앞으로가기로 검색 히스토리를 이동하는 경우, 헤더와 결과를 URL의 keyword에 맞춰 다시 동기화한다.
  window.addEventListener('popstate', () => {
    const keyword = getKeywordFromUrl();
    window.renderSearchHeader(keyword);
    loadSearchResults(keyword);
  });
});
