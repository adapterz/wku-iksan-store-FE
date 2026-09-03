// 공통 서브 헤더가 기본 제공하는 검색·홈 아이콘을 랭킹 페이지에서는 제거한다.
document.addEventListener('header:ready', () => {
  const rightIcons = document.querySelector('header.main-header .header-right-icons');
  if (rightIcons) rightIcons.remove();
});

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

  // load()가 반환한 API 응답의 계산 시각을 사용하되,
  // 실제로 카드가 그려진 경우에만 업데이트 시각을 표시한다.
  // 빈 목록/에러 상태에서는 "몇 시 기준"이라는 문구가 오히려 오해를 줄 수 있어 표시하지 않는다.
  rankingLoader.load().then((result) => {
    if (!updatedAtEl) return;
    const hasResults = listEl.querySelector('.product-card') !== null;
    if (!hasResults) return;

    // 브라우저가 응답을 받은 시간이 아니라 BE가 랭킹을 실제 계산한 시각을 표시한다.
    const computedAt = result && result.meta && result.meta.computedAt;
    const calculatedAt = computedAt ? new Date(computedAt) : null;
    if (!calculatedAt || Number.isNaN(calculatedAt.getTime())) return;

    const hh = String(calculatedAt.getHours()).padStart(2, '0');
    const mm = String(calculatedAt.getMinutes()).padStart(2, '0');
    updatedAtEl.textContent = `${hh}:${mm} 업데이트`;
  });
});
