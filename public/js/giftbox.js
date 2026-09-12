// 공통 서브 헤더가 기본 제공하는 검색·홈 아이콘을 선물함 페이지에서는 제거한다.
document.addEventListener('header:ready', () => {
  const rightIcons = document.querySelector('header.main-header .header-right-icons');
  if (rightIcons) rightIcons.remove();
});

// 로그인 여부 확인 (화면을 그리기 전에 먼저 검증 - Route Guard)
// 401은 api.js 전역 인터셉터가 처리(redirect 파라미터 포함 로그인 이동)하므로 여기선 그 외 오류만 다룬다.
async function checkGiftboxAuth() {
  try {
    const authResult = await requestJson('/api/auth/me');
    if (!authResult || !authResult.data) {
      return false;
    }
  } catch (error) {
    console.error("인증 확인 실패:", error);
    alert("사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    return false;
  }

  document.body.style.visibility = "visible";
  document.body.style.opacity = "1";
  return true;
}

document.addEventListener("header:ready", async () => {

  // component.js의 공통 헬퍼: 최초 실행 후 bfcache 복원 시 재검증까지 등록해준다.
  const isAuthenticated = await window.registerBfcacheRevalidation(checkGiftboxAuth);
  if (!isAuthenticated) {
    return;
  }

  const tabUnused = document.getElementById("tab-unused");
  const tabUsed = document.getElementById("tab-used");
  const listContainer = document.getElementById("gift-list-container");

  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') === 'used' ? 'used' : 'unused';
  let currentStatus = initialTab;

  // 마이페이지 "나에게 선물"/"받은 선물" 카드에서 넘어올 때만 쓰는 구분 필터.
  // /api/gifts 응답에 이미 항목마다 isSelfGift가 들어있어서 서버에 새 쿼리를 추가할 필요 없이
  // 받은 목록을 여기서 한 번 더 걸러내면 된다. 화면에 이걸 바꾸는 탭 UI가 없어서 최초 진입
  // 시의 값을 탭(미사용/사용완료) 전환과 무관하게 그대로 유지한다.
  const requestedType = urlParams.get('type');
  const currentType = (requestedType === 'self' || requestedType === 'received') ? requestedType : null;

  const filterByType = (gifts) => {
    if (currentType === 'self') return gifts.filter(g => g.isSelfGift);
    if (currentType === 'received') return gifts.filter(g => !g.isSelfGift);
    return gifts;
  };

  // Render skeleton placeholders that mirror .gift-card layout
  const renderGiftSkeleton = () => {
    listContainer.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const card = document.createElement('div');
      card.className = 'skeleton-gift-card';
      card.innerHTML = `
        <div class="skeleton skeleton-gift-img"></div>
        <div class="skeleton-gift-lines">
          <div class="skeleton skeleton-line" style="width:30%;"></div>
          <div class="skeleton skeleton-line" style="width:80%;"></div>
          <div class="skeleton skeleton-line" style="width:50%;"></div>
        </div>
      `;
      listContainer.appendChild(card);
    }
  };

  // Load gifts
  const loadGifts = async (status) => {
    currentStatus = status;
    updateTabStyles();
    renderGiftSkeleton();
    const settle = createSkeletonGuard(() => {
      listContainer.innerHTML = `<div class="empty-state">선물 목록을 불러오지 못했습니다.</div>`;
    }, 1500);

    try {
      const result = await requestJson(`/api/gifts?status=${status}`);
      settle();
      renderGiftList(filterByType(result.data || []));
    } catch (error) {
      settle();
      // 401은 api.js 전역 인터셉터가 처리하므로 여기선 403 등 나머지 오류만 다룬다.
      if (error.status === 403) {
        alert("접근 권한이 없습니다.");
        location.href = "login.html";
        return;
      }
      console.error("선물함 조회 실패:", error);
      listContainer.innerHTML = `<div class="empty-state">선물 목록을 불러오지 못했습니다.</div>`;
    }
  };

  const updateTabStyles = () => {
    if (currentStatus === 'unused') {
      tabUnused.classList.add('active');
      tabUsed.classList.remove('active');
    } else {
      tabUsed.classList.add('active');
      tabUnused.classList.remove('active');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const renderGiftList = (gifts) => {
    listContainer.innerHTML = "";
    
    if (gifts.length === 0) {
      listContainer.innerHTML = `<div class="empty-state">${currentStatus === 'unused' ? '미사용 선물이 없습니다.' : '사용완료 선물이 없습니다.'}</div>`;
      return;
    }

    gifts.forEach(gift => {
      const card = document.createElement("div");
      card.className = "gift-card";
      
      // Click event for unused gifts
      if (currentStatus === 'unused') {
        card.addEventListener('click', () => {
          location.href = `giftuse.html?giftId=${gift.giftId}`;
        });
      }

      const isUsed = (currentStatus === 'used');
      const senderText = gift.isSelfGift ? "나" : (gift.senderNickname || "친구");
      const dateText = isUsed && gift.usedAt ? `사용일: ${formatDate(gift.usedAt)}` : `받은일: ${formatDate(gift.createdAt)}`;
      // reviewId가 있으면 수정, 없으면 BE가 계산해준 canReview(수신자 본인·결제완료·사용완료·
      // 미작성)를 그대로 따른다. canReview는 정지 여부는 반영하지 않으므로, 정지된 사용자가
      // 실제 작성을 시도했을 때의 최종 판단은 review.js가 저장 시점에 서버 응답으로 다시 확인한다.
      const showReviewButton = isUsed && (gift.reviewId || gift.canReview);
      const reviewBtnLabel = gift.reviewId ? '내 리뷰 수정' : '리뷰 작성';

      card.innerHTML = `
        <div class="gift-img-wrapper">
          <img alt="상품 썸네일" class="gift-img">
          ${isUsed ? '<div class="used-overlay">사용완료</div>' : ''}
        </div>
        <div class="gift-info">
          <div class="gift-brand"></div>
          <div class="gift-name"></div>
          <div class="gift-sender-info">
            <span class="sender-text"></span>
            <span class="gift-date">${dateText}</span>
          </div>
          ${showReviewButton ? `<button type="button" class="btn-gift-review">${reviewBtnLabel}</button>` : ''}
        </div>
      `;

      const imgEl = card.querySelector('.gift-img');
      if (imgEl) imgEl.src = gift.thumbnailUrl || '';
      const brandEl = card.querySelector('.gift-brand');
      if (brandEl) brandEl.textContent = gift.brand || '';
      const nameEl = card.querySelector('.gift-name');
      if (nameEl) nameEl.textContent = gift.productName || '';
      const senderEl = card.querySelector('.sender-text');
      if (senderEl) senderEl.textContent = `보낸사람: ${senderText}`;

      if (showReviewButton) {
        const reviewBtn = card.querySelector('.btn-gift-review');
        if (reviewBtn) {
          reviewBtn.addEventListener('click', () => {
            window.openReviewEditor(gift.reviewId ? { reviewId: gift.reviewId } : { giftId: gift.giftId });
          });
        }
      }

      listContainer.appendChild(card);
    });
  };

  // Tab Events
  tabUnused.addEventListener('click', () => loadGifts('unused'));
  tabUsed.addEventListener('click', () => loadGifts('used'));

  // 리뷰 작성·수정·삭제 모달(review.js)이 완료 후 쏘는 이벤트. 지금 보고 있는 탭을
  // 다시 불러와 canReview/reviewId, 버튼 라벨을 최신 상태로 맞춘다.
  document.addEventListener('review:changed', () => {
    loadGifts(currentStatus);
  });

  // Init
  loadGifts(currentStatus);




});


