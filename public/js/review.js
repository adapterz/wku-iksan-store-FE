// 리뷰 작성·수정·삭제 모달. 상품 상세(product.js)와 선물함(giftbox.js) 등 여러 화면에서
// 같은 모달을 공유해서 쓴다. 완료되면 review:changed 커스텀 이벤트를 document에 쏘고,
// 각 화면은 자기 목록에 해당하는 이벤트만 걸러서 새로고침한다(auth:updated 등 기존 이벤트 패턴과 동일).
(function () {
  const RATING_LABELS = ['', '아쉬웠어요', '조금 아쉬웠어요', '괜찮았어요', '좋았어요', '정말 좋았어요'];
  const ERROR_MESSAGES = {
    REVIEW_ALREADY_EXISTS: '이미 작성한 후기예요. 목록에서 수정해주세요.',
    GIFT_NOT_REVIEWABLE: '사용 완료한 선물만 후기를 작성할 수 있어요.',
    FORBIDDEN_NOT_REVIEW_OWNER: '본인이 작성한 후기만 수정할 수 있어요.',
    REVIEW_NOT_FOUND: '후기를 찾을 수 없어요. 목록을 다시 확인해주세요.'
  };

  function errorMessage(error) {
    return (error && ERROR_MESSAGES[error.code]) || (error && error.message) || '요청을 처리하지 못했어요.';
  }

  function getReviewModalsHTML() {
    return `
<div id="review-editor-modal" class="review-modal">
  <div class="review-modal-content">
    <div class="review-modal-header">
      <h2 id="review-editor-title">후기 작성</h2>
      <button type="button" id="review-editor-close" class="review-modal-close" aria-label="닫기">&times;</button>
    </div>
    <div class="review-modal-body">
      <div class="review-editor-product">
        <img id="review-editor-product-img" alt="">
        <div>
          <small id="review-editor-product-brand"></small>
          <p id="review-editor-product-name"></p>
        </div>
      </div>
      <div class="review-rating-input" id="review-rating-input" role="radiogroup" aria-label="별점"></div>
      <p class="review-rating-label" id="review-rating-label">별점을 선택해주세요</p>
      <textarea id="review-content" class="review-content-input" maxlength="1000" placeholder="선물 사용 후기를 남겨주세요."></textarea>
      <div class="review-content-counter"><span id="review-content-count">0</span> / 1,000</div>
      <p class="review-form-error" id="review-form-error" role="alert"></p>
      <button type="button" id="review-save" class="review-save-btn" disabled>등록하기</button>
      <button type="button" id="review-delete-trigger" class="review-delete-link" hidden>후기 삭제</button>
    </div>
  </div>
</div>
<div id="review-delete-confirm-modal" class="review-modal">
  <div class="review-modal-content review-modal-content-sm">
    <div class="review-confirm-body">
      <h2>후기를 삭제할까요?</h2>
      <p>삭제한 후기는 되돌릴 수 없습니다.</p>
      <p class="review-form-error" id="review-delete-error" role="alert"></p>
      <div class="review-confirm-actions">
        <button type="button" id="review-delete-cancel" class="review-secondary-btn">취소</button>
        <button type="button" id="review-delete-confirm" class="review-danger-btn">삭제하기</button>
      </div>
    </div>
  </div>
</div>
<div id="review-toast" class="review-toast" role="status" hidden></div>`;
  }

  if (document.body && !document.getElementById('review-editor-modal')) {
    document.body.insertAdjacentHTML('beforeend', getReviewModalsHTML());
  }

  const $ = (id) => document.getElementById(id);
  const state = { busy: false, rating: 0, target: null };
  let toastTimer;

  function toast(message) {
    const el = $('review-toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 800);
  }

  function buildRatingInput() {
    const wrap = $('review-rating-input');
    if (!wrap) return;
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'review-star-btn';
      btn.setAttribute('aria-label', i + '점');
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = '<i class="fa-solid fa-star"></i>';
      btn.addEventListener('click', () => setRating(i));
      wrap.appendChild(btn);
    }
  }

  function setRating(value) {
    state.rating = value;
    const buttons = $('review-rating-input').querySelectorAll('.review-star-btn');
    buttons.forEach((btn, idx) => {
      const active = idx < value;
      btn.classList.toggle('selected', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    $('review-rating-label').textContent = RATING_LABELS[value] || '별점을 선택해주세요';
    updateSaveState();
  }

  function updateContentCounter() {
    const length = [...$('review-content').value.trim()].length;
    $('review-content-count').textContent = length.toLocaleString();
    updateSaveState();
  }

  function updateSaveState() {
    const length = [...$('review-content').value.trim()].length;
    $('review-save').disabled = state.busy || !state.rating || length < 1 || length > 1000;
  }

  function setBusy(value) {
    state.busy = value;
    $('review-editor-close').disabled = value;
    $('review-delete-trigger').disabled = value;
    updateSaveState();
  }

  function closeEditor() {
    if (state.busy) return;
    $('review-editor-modal').classList.remove('open');
  }

  function setProductPreview(product) {
    const img = $('review-editor-product-img');
    img.src = (product && product.thumbnailUrl) || '';
    img.alt = (product && product.name) || '';
    $('review-editor-product-brand').textContent = (product && product.brand) || '';
    $('review-editor-product-name').textContent = (product && product.name) || '';
  }

  // target: { reviewId } (수정) 또는 { giftId } (신규 작성)
  async function openReviewEditor(target) {
    if (state.busy || !target) return;
    setBusy(true);
    $('review-form-error').textContent = '';
    try {
      let product;
      let prefill = null;
      let reviewId = null;
      let giftId = null;
      let productId = null;

      if (target.reviewId) {
        const result = await window.requestJson('/api/reviews/' + target.reviewId);
        if (!result) return;
        const item = result.data;
        reviewId = item.reviewId;
        giftId = item.giftId;
        product = item.product;
        productId = product && product.id;
        prefill = { rating: item.rating, content: item.content };
      } else if (target.giftId) {
        const giftResult = await window.requestJson('/api/gifts/' + target.giftId);
        if (!giftResult) return;
        const gift = giftResult.data;
        if (!gift.canReview) {
          toast('이 선물은 지금 후기를 작성할 수 없어요.');
          return;
        }
        giftId = gift.giftId;
        productId = gift.productId;
        // GET /api/gifts/:id 응답에는 brand가 없어서, 실제 브랜드 표시를 위해 상품 상세를 한 번 더 조회한다.
        // 실패해도 후기 작성 자체를 막을 이유는 아니므로 브랜드 없이 계속 진행한다.
        let brand = '';
        try {
          const productResult = await window.requestJson('/api/products/' + gift.productId, { silent401: true });
          if (productResult && productResult.data) brand = productResult.data.brand || '';
        } catch (e) {
          console.error('상품 브랜드 조회 실패:', e);
        }
        product = { name: gift.productName, brand, thumbnailUrl: gift.thumbnailUrl };
      } else {
        return;
      }

      state.target = { reviewId, giftId, productId };
      setProductPreview(product);
      $('review-content').value = prefill ? prefill.content : '';
      updateContentCounter();
      setRating(prefill ? prefill.rating : 0);
      $('review-editor-title').textContent = reviewId ? '후기 수정' : '후기 작성';
      $('review-save').textContent = reviewId ? '수정 내용 저장하기' : '후기 등록하기';
      $('review-delete-trigger').hidden = !reviewId;
      $('review-editor-modal').classList.add('open');
    } catch (error) {
      toast(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveReview() {
    if (state.busy || $('review-save').disabled || !state.target) return;
    const { reviewId, giftId, productId } = state.target;
    const body = { rating: state.rating, content: $('review-content').value.trim() };
    setBusy(true);
    $('review-form-error').textContent = '';
    try {
      const result = reviewId
        ? await window.requestJson('/api/reviews/' + reviewId, { method: 'PATCH', body })
        : await window.requestJson('/api/reviews', { method: 'POST', body: { ...body, giftId } });
      if (!result) return;
      closeEditor();
      toast(reviewId ? '후기가 수정되었어요.' : '후기가 등록되었어요.');
      document.dispatchEvent(new CustomEvent('review:changed', {
        detail: { type: reviewId ? 'updated' : 'created', reviewId: reviewId || (result.data && result.data.reviewId), giftId, productId }
      }));
    } catch (error) {
      $('review-form-error').textContent = errorMessage(error);
    } finally {
      setBusy(false);
    }
  }

  function openDeleteConfirm() {
    if (state.busy || !state.target || !state.target.reviewId) return;
    $('review-delete-error').textContent = '';
    $('review-delete-confirm-modal').classList.add('open');
  }

  function closeDeleteConfirm() {
    if (state.busy) return;
    $('review-delete-confirm-modal').classList.remove('open');
  }

  async function deleteReview() {
    if (state.busy || !state.target || !state.target.reviewId) return;
    const { reviewId, giftId, productId } = state.target;
    setBusy(true);
    $('review-delete-error').textContent = '';
    $('review-delete-cancel').disabled = true;
    $('review-delete-confirm').disabled = true;
    try {
      const result = await window.requestJson('/api/reviews/' + reviewId, { method: 'DELETE' });
      if (!result) return;
      closeDeleteConfirm();
      closeEditor();
      toast('후기가 삭제되었어요.');
      document.dispatchEvent(new CustomEvent('review:changed', {
        detail: { type: 'deleted', reviewId, giftId, productId }
      }));
    } catch (error) {
      $('review-delete-error').textContent = errorMessage(error);
    } finally {
      setBusy(false);
      $('review-delete-cancel').disabled = false;
      $('review-delete-confirm').disabled = false;
    }
  }

  buildRatingInput();
  $('review-editor-close').addEventListener('click', closeEditor);
  $('review-content').addEventListener('input', updateContentCounter);
  $('review-save').addEventListener('click', saveReview);
  $('review-delete-trigger').addEventListener('click', openDeleteConfirm);
  $('review-delete-cancel').addEventListener('click', closeDeleteConfirm);
  $('review-delete-confirm').addEventListener('click', deleteReview);

  window.openReviewEditor = openReviewEditor;
})();
