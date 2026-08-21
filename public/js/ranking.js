document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('ranking-product-list');
  if (!listEl) return;

  const updatedAtEl = document.getElementById('ranking-updated-at');

  // 스켈레톤/빈 상태/에러 상태 렌더링, 요청 취소(레이스 컨디션 방지)는 component.js의 공통 컨트롤러를 재사용한다.
  // GET /api/products/ranking은 찜 개수 기준으로 이미 정렬·rank가 매겨져서 내려오므로 별도 파라미터 없이 그대로 호출하고,
  // showRank로 카드에 순위 배지(응답의 rank 값)를 표시한다.
  const rankingLoader = window.createProductListLoader(listEl, {
    buildRequestPath: () => '/api/products/ranking',
    emptyMessage: '랭킹에 표시할 상품이 없습니다.',
    errorMessage: '랭킹 정보를 불러오지 못했습니다.',
    showRank: true
  });

  // load()는 성공/실패를 구분해 알려주지 않으므로(내부에서 에러도 안내문구로 처리하고 끝남),
  // 실제로 카드가 그려졌는지(listEl 안에 .product-card가 있는지)로 성공 여부를 판단한다.
  // 빈 목록/에러 상태에서는 "몇 시 기준"이라는 문구가 오히려 오해를 줄 수 있어 표시하지 않는다.
  rankingLoader.load().then(() => {
    if (!updatedAtEl) return;
    const hasResults = listEl.querySelector('.product-card') !== null;
    if (!hasResults) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    updatedAtEl.textContent = `${hh}:${mm} 업데이트`;
  });
});
