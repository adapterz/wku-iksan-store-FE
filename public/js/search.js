document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('search-result-list');

  function getKeywordFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return (urlParams.get('keyword') || '').trim();
  }

  // 상품 목록 로딩/렌더링/레이스 컨디션 방지 로직은 component.js의 공통 컨트롤러를 재사용한다.
  const productList = window.createProductListLoader(listEl, {
    buildRequestPath: (keyword) => keyword ? `/api/products?keyword=${encodeURIComponent(keyword)}` : null,
    blankMessage: '검색어를 입력해주세요.',
    emptyMessage: '검색 결과가 없습니다.',
    errorMessage: '상품 정보를 불러오는 데 실패했습니다.'
  });

  function loadSearchResults(keyword, options) {
    productList.load(keyword, options);
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
