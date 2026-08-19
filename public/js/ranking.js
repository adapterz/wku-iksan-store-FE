document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('ranking-product-list');
  if (!listEl) return;

  // 스켈레톤/빈 상태/에러 상태 렌더링, 요청 취소(레이스 컨디션 방지)는 component.js의 공통 컨트롤러를 재사용한다.
  // GET /api/products/ranking은 찜 개수 기준으로 이미 정렬·rank가 매겨져서 내려오므로 별도 파라미터 없이 그대로 호출하고,
  // showRank로 카드에 순위 배지(응답의 rank 값)를 표시한다.
  const rankingLoader = window.createProductListLoader(listEl, {
    buildRequestPath: () => '/api/products/ranking',
    emptyMessage: '랭킹에 표시할 상품이 없습니다.',
    errorMessage: '랭킹 정보를 불러오지 못했습니다.',
    showRank: true
  });

  rankingLoader.load();
});
