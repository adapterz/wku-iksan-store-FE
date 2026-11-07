// 공통 서브 헤더가 기본 제공하는 선물함 아이콘은, 이미 선물함 페이지에 있는 상태라 자기 자신으로
// 가는 링크가 되어 의미가 없으므로 여기서는 제거한다. 같은 컨테이너(.header-right-icons)에 장바구니
// 아이콘도 함께 있으므로, 컨테이너 전체가 아니라 선물함 링크만 선택해 제거해야 장바구니 아이콘이 남는다.
document.addEventListener('header:ready', () => {
  const giftboxLink = document.querySelector('header.main-header .header-right-icons a[href="giftbox.html"]');
  if (giftboxLink) giftboxLink.remove();
});

document.addEventListener("header:ready", async () => {

  const tabUnused = document.getElementById("tab-unused");
  const tabUsed = document.getElementById("tab-used");
  const tabCancelled = document.getElementById("tab-cancelled");
  const listContainer = document.getElementById("gift-list-container");
  const tabs = { unused: tabUnused, used: tabUsed, cancelled: tabCancelled };
  const EMPTY_MESSAGES = {
    unused: '미사용 선물이 없습니다.',
    used: '사용완료 선물이 없습니다.',
    cancelled: '취소된 선물이 없습니다.'
  };

  const urlParams = new URLSearchParams(window.location.search);
  const requestedTab = urlParams.get('tab');
  const initialTab = (requestedTab === 'used' || requestedTab === 'cancelled') ? requestedTab : 'unused';
  let currentStatus = initialTab;
  let loadSequence = 0;
  let activeSettle = null;
  const guard = window.accountGuard;
  const showBody = () => {
    document.body.style.visibility = 'visible';
    document.body.style.opacity = '1';
  };

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
    const owner = guard.snapshot();
    if (!guard.isCurrent(owner) || !owner.userId) return;
    const sequence = ++loadSequence;
    if (activeSettle) activeSettle();
    const isActive = () => sequence === loadSequence && guard.isCurrent(owner);
    currentStatus = status;
    updateTabStyles();
    renderGiftSkeleton();
    const settle = createSkeletonGuard(() => {
      if (isActive()) listContainer.innerHTML = `<div class="empty-state">선물 목록을 불러오지 못했습니다.</div>`;
    }, 1500);
    activeSettle = settle;

    try {
      const result = await requestJson(`/api/gifts?status=${status}`, { silent401: true });
      settle();
      if (!isActive() || !result) return;
      renderGiftList(filterByType(result.data || []), owner);
    } catch (error) {
      settle();
      if (!isActive()) return;
      // silent401 요청이므로 현재 소유자의 로그인 만료만 직접 처리한다.
      if (error.status === 401) {
        guard.invalidate();
        window.location.replace(`login.html?redirect=${encodeURIComponent(window.location.href)}`);
        return;
      }
      if (error.status === 403) {
        guard.invalidate();
        alert("접근 권한이 없습니다.");
        navigateToLogin();
        return;
      }
      console.error("선물함 조회 실패:", error);
      listContainer.innerHTML = `<div class="empty-state">선물 목록을 불러오지 못했습니다.</div>`;
    }
  };

  const updateTabStyles = () => {
    Object.entries(tabs).forEach(([status, tab]) => {
      if (status === currentStatus) tab.classList.add('active');
      else tab.classList.remove('active');
    });
  };

  // 미사용 교환권 취소(BE #153, PATCH /api/gifts/:id/cancel). 환불은 없고 되돌릴 수 없으므로 페이지 내
  // 확인창(confirm-modal.js)으로 한 번 더 확인한다. 받은 선물이면 보낸 사람에게 알림이 가지 않는다는 점도 안내한다.
  const cancelConfirmOptions = (gift) => ({
    title: '이 교환권을 취소할까요?',
    message: [
      '취소하면 더 이상 사용할 수 없고 되돌릴 수 없습니다.',
      gift.isSelfGift ? '금액은 환불되지 않습니다.' : '금액은 환불되지 않으며, 보낸 분에게 알림이 가지 않습니다.'
    ].join('\n'),
    confirmText: '취소하기',
    cancelText: '닫기'
  });

  const CANCEL_ERROR_MESSAGES = {
    GIFT_ALREADY_USED: '이미 사용 완료된 교환권이라 취소할 수 없어요.',
    GIFT_NOT_CANCELLABLE: '취소할 수 없는 교환권이에요. 선물함을 다시 확인해주세요.',
    GIFT_NOT_FOUND: '교환권을 찾을 수 없어요. 선물함을 다시 확인해주세요.',
    FORBIDDEN_NOT_OWNER: '받은 사람만 교환권을 취소할 수 있어요.'
  };
  // 상태가 바뀌어 취소할 수 없게 된 경우 — 안내 후 최신 상태로 다시 불러온다.
  const RELOAD_AFTER_CANCEL_ERROR = new Set(['GIFT_ALREADY_USED', 'GIFT_NOT_CANCELLABLE', 'GIFT_NOT_FOUND']);

  const cancelGift = async (gift, owner, button) => {
    if (button.disabled) return;
    // 확인창이 열려 있는 동안에도 버튼을 잠가 확인창이 겹쳐 열리지 않게 한다.
    button.disabled = true;
    // 확인창이 열린 사이 계정이 바뀌면 clear()가 확인창을 닫아 false가 된다.
    if (!(await window.showConfirmModal({ ...cancelConfirmOptions(gift), returnFocusTo: button }))) {
      button.disabled = false;
      return;
    }
    let sent = false;
    try {
      await guard.ensureAction(owner);
      sent = true;
      // 이전 계정의 401이 공통 로그인 이동을 예약하지 않도록, 소유자 확인 후 직접 처리한다.
      const result = await requestJson(`/api/gifts/${gift.giftId}/cancel`, { method: 'PATCH', silent401: true });
      // 응답을 기다리는 사이 계정이 바뀌었으면 이전 계정의 결과를 새 계정 화면에 보여주지 않는다.
      // 새 계정의 선물함은 계정 전환 처리(registerAccountView)가 다시 그린다.
      if (!guard.isCurrent(owner)) return;
      if (!result) return;
      window.showToast('교환권이 취소되었습니다.');
      loadGifts(currentStatus);
    } catch (error) {
      if (sent && !guard.isCurrent(owner)) return; // 실패 응답도 같은 이유로 버린다
      if (sent && error.status === 401) {
        guard.invalidate();
        alert('로그인이 필요한 서비스입니다.');
        navigateToLogin(window.location.href);
        return;
      }
      button.disabled = false;
      // 요청 전 계정 확인(ensureAction)에서 난 오류 — 계정이 바뀌었거나 로그아웃된 경우 그 안내를 그대로 보여준다.
      const accountChanged = error.code === 'STALE_ACCOUNT' || (error.status === 401 && !error.code);
      alert(CANCEL_ERROR_MESSAGES[error.code]
        || (accountChanged && error.message)
        || '교환권을 취소하지 못했어요. 다시 시도해주세요.');
      if (RELOAD_AFTER_CANCEL_ERROR.has(error.code)) loadGifts(currentStatus);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const renderGiftList = (gifts, owner) => {
    listContainer.innerHTML = "";
    
    if (gifts.length === 0) {
      listContainer.innerHTML = `<div class="empty-state">${EMPTY_MESSAGES[currentStatus]}</div>`;
      return;
    }

    gifts.forEach(gift => {
      const card = document.createElement("div");
      card.className = "gift-card";
      
      // Click event for unused gifts
      if (currentStatus === 'unused') {
        card.addEventListener('click', async () => {
          try {
            await guard.ensureAction(owner);
            location.href = `giftuse.html?giftId=${gift.giftId}`;
          } catch (error) { alert(error.message || '로그인 상태를 확인하지 못했습니다.'); }
        });
      }

      const isUsed = (currentStatus === 'used');
      const isCancelled = (currentStatus === 'cancelled');
      const senderText = gift.isSelfGift ? "나" : (gift.senderNickname || "친구");
      const dateText = isUsed && gift.usedAt ? `사용일: ${formatDate(gift.usedAt)}`
        : isCancelled && gift.cancelledAt ? `취소일: ${formatDate(gift.cancelledAt)}`
        : `받은일: ${formatDate(gift.createdAt)}`;
      // reviewId가 있으면 수정, 없으면 BE가 계산해준 canReview(수신자 본인·결제완료·사용완료·
      // 미작성)를 그대로 따른다. canReview는 정지 여부는 반영하지 않으므로, 정지된 사용자가
      // 실제 작성을 시도했을 때의 최종 판단은 review.js가 저장 시점에 서버 응답으로 다시 확인한다.
      const showReviewButton = isUsed && (gift.reviewId || gift.canReview);
      const reviewBtnLabel = gift.reviewId ? '내 리뷰 수정' : '리뷰 작성';

      card.innerHTML = `
        <div class="gift-img-wrapper">
          <img alt="상품 썸네일" class="gift-img">
          ${isUsed ? '<div class="used-overlay">사용완료</div>' : ''}
          ${isCancelled ? '<div class="used-overlay cancelled-overlay">취소됨</div>' : ''}
        </div>
        <div class="gift-info">
          <div class="gift-brand"></div>
          <div class="gift-name"></div>
          <div class="gift-sender-info">
            <span class="sender-text"></span>
            <span class="gift-date">${dateText}</span>
          </div>
          ${showReviewButton ? `<button type="button" class="btn-gift-review">${reviewBtnLabel}</button>` : ''}
          ${currentStatus === 'unused' ? '<button type="button" class="btn-gift-cancel">취소</button>' : ''}
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

      const cancelBtn = card.querySelector('.btn-gift-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', (event) => {
          // 카드 전체에 걸린 사용 화면 이동이 함께 실행되지 않게 막는다.
          event.stopPropagation();
          cancelGift(gift, owner, cancelBtn);
        });
      }

      if (showReviewButton) {
        const reviewBtn = card.querySelector('.btn-gift-review');
        if (reviewBtn) {
          reviewBtn.addEventListener('click', async () => {
            try {
              await guard.ensureAction(owner);
              window.openReviewEditor(gift.reviewId ? { reviewId: gift.reviewId } : { giftId: gift.giftId });
            } catch (error) { alert(error.message || '로그인 상태를 확인하지 못했습니다.'); }
          });
        }
      }

      listContainer.appendChild(card);
    });
  };

  // Tab Events
  tabUnused.addEventListener('click', () => loadGifts('unused'));
  tabUsed.addEventListener('click', () => loadGifts('used'));
  tabCancelled.addEventListener('click', () => loadGifts('cancelled'));

  // 리뷰 작성·수정·삭제 모달(review.js)이 완료 후 쏘는 이벤트. 지금 보고 있는 탭을
  // 다시 불러와 canReview/reviewId, 버튼 라벨을 최신 상태로 맞춘다.
  document.addEventListener('review:changed', () => {
    loadGifts(currentStatus);
  });

  // Init
  window.registerAccountView({
    clear: () => {
      // 이전 계정 화면에서 열어 둔 취소 확인창이 새 계정 화면에 남지 않게 닫는다.
      window.closeConfirmModal();
      loadSequence++;
      if (activeSettle) activeSettle();
      listContainer.innerHTML = '<div class="empty-state">로그인 상태를 확인하고 있습니다.</div>';
      showBody();
    },
    load: () => { showBody(); return loadGifts(currentStatus); },
    error: () => {
      listContainer.innerHTML = '<div class="empty-state">로그인 상태를 확인하지 못했습니다. 다시 시도해주세요.</div>';
      window.appendAccountRetryButton(listContainer);
      showBody();
    }
  });




});


