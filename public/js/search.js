document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('search-result-list');

  function getKeywordFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return (urlParams.get('keyword') || '').trim();
  }

  // 상품 카드 마크업은 component.js가 전역에 노출한 createProductCard/createSkeletonCard를 재사용한다.
  function renderSkeletonState() {
    if (!listEl) return;
    listEl.classList.remove('is-empty');
    listEl.innerHTML = '';
    for (let i = 0; i < 6; i++) listEl.appendChild(createSkeletonCard());
  }

  // is-empty: 결과가 없거나 실패했을 때, 리스트 영역을 남은 화면 높이만큼 늘려
  // 안내 문구가 화면 세로 중앙에 오도록 하는 CSS 훅(style.css의 .page-search 규칙 참고)
  function renderFallbackState(message) {
    if (!listEl) return;
    listEl.classList.add('is-empty');
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-box-open"></i>
        <p>${message}</p>
      </div>
    `;
  }

  function renderResults(products) {
    if (!listEl) return;
    listEl.classList.remove('is-empty');
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

  // 빠르게 재검색할 때 응답이 요청 순서와 다르게 도착해 이전(오래된) 검색 결과가
  // 최신 결과를 덮어쓰는 것을 막기 위해, 새 요청을 시작할 때마다 진행 중인 이전 요청을 취소한다.
  // controller: 이전 fetch를 중단시켜 응답 자체가 화면에 반영되지 않도록 함
  // settle: 이전 요청의 5초 타임아웃 타이머를 즉시 정리해, 최신 결과가 표시된 뒤
  //         뒤늦게 실행되는 스테일 타이머가 화면을 오류 상태로 덮어쓰지 못하게 함
  let currentSearch = null;

  // showSkeleton=false: 이미 결과가 떠 있는 상태에서의 재검색은 기존 카드를 그대로 유지하다가
  // 응답이 오면 바로 새 카드로 교체한다(스켈레톤 왕복으로 인한 깜빡임 방지).
  async function loadSearchResults(keyword, { showSkeleton = true } = {}) {
    if (currentSearch) {
      currentSearch.controller.abort();
      currentSearch.settle();
      currentSearch = null;
    }

    if (!keyword) {
      renderFallbackState('검색어를 입력해주세요.');
      return;
    }

    const controller = new AbortController();

    if (showSkeleton) {
      renderSkeletonState();
    }
    const settle = createSkeletonGuard(() => {
      renderFallbackState('상품 정보를 불러오는 데 실패했습니다.');
    }, 5000);

    currentSearch = { controller, settle };

    try {
      const result = await requestJson(`/api/products?keyword=${encodeURIComponent(keyword)}`, {
        signal: controller.signal
      });
      settle();
      if (controller.signal.aborted) return;
      const products = (result && result.data && Array.isArray(result.data)) ? result.data : [];
      if (products.length === 0) {
        renderFallbackState('검색 결과가 없습니다.');
      } else {
        renderResults(products);
      }
    } catch (error) {
      settle();
      if (controller.signal.aborted || error.name === 'AbortError') return;
      console.error('상품 검색에 실패했습니다:', error);
      renderFallbackState('상품 정보를 불러오는 데 실패했습니다.');
    }
  }

  // 검색 페이지 안에서의 재검색: 페이지 새로고침 없이 URL만 갱신하고, 기존 카드는 그대로 유지하다가
  // 응답이 오면 바로 교체한다(스켈레톤 왕복 없음 → 깜빡임 없음).
  window.onSearchPageKeywordSubmit = function(keyword) {
    history.pushState(null, '', `search.html?keyword=${encodeURIComponent(keyword)}`);
    // pushState는 페이지를 새로 로드하지 않아 하단 로그인 링크가 최초 진입 시의 URL(이전 검색어)로
    // 고정된 채 남으므로, URL이 바뀔 때마다 redirect 값을 현재 위치 기준으로 다시 계산한다.
    window.refreshBottomNavLoginLink();
    loadSearchResults(keyword, { showSkeleton: false });
  };

  // 뒤로가기 + 검색 인라인 박스(keyword 표시) + 홈/영수증/선물함 아이콘으로 구성된 검색 전용 헤더 (component.js 공통 함수)
  window.renderSearchHeader(getKeywordFromUrl());

  loadSearchResults(getKeywordFromUrl());

  // 브라우저 뒤로가기/앞으로가기로 검색 히스토리를 이동하는 경우, 헤더와 결과를 URL의 keyword에 맞춰 다시 동기화한다.
  window.addEventListener('popstate', () => {
    const keyword = getKeywordFromUrl();
    window.renderSearchHeader(keyword);
    window.refreshBottomNavLoginLink();
    loadSearchResults(keyword);
  });
});
