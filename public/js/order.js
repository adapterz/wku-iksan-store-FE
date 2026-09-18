document.addEventListener("DOMContentLoaded", async () => {
  // 2. URL 파라미터에서 productId 및 선물 유형(type) 추출
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('productId');
  const orderType = urlParams.get('type') || 'self'; // 'self' or 'gift'
  // cartItemIds가 있으면 장바구니에서 여러 상품을 묶어 한 번에 결제하는 묶음 주문이다.
  const bundleCartItemIds = (urlParams.get('cartItemIds') || '')
    .split(',')
    .map(id => Number(id.trim()))
    .filter(id => Number.isInteger(id) && id > 0);
  const isBundle = bundleCartItemIds.length > 0;
  // 즉시 구매(단건) 주문 수량 — 상품 상세 bottom-sheet에서 선택한 값을 그대로 받는다.
  // 1~10 범위를 벗어나거나 없으면 1로 취급한다 (수량 없이 들어오는 기존 링크와의 하위호환).
  const rawQuantity = Number(urlParams.get('quantity'));
  const directQuantity = (Number.isInteger(rawQuantity) && rawQuantity >= 1 && rawQuantity <= 10) ? rawQuantity : 1;

  // 뒤로가기 버튼 로직 (확인 오버레이 띄우기)
  // component.js가 헤더에 기본으로 바인딩해둔 history.back() 리스너가 이 버튼에도 걸려 있어서,
  // 그대로 두면 클릭 한 번에 오버레이 확인 없이 history.back()이 먼저 실행되어 버린다
  // (로그인 경유로 들어온 경우 로그인 페이지로 되돌아가는 문제도 여기서 발생한다).
  // 노드를 복제해 기존 리스너를 제거하고 이 페이지 전용 리스너만 남긴다.
  const backBtnOriginal = document.getElementById('btn-back');
  const backBtn = backBtnOriginal ? backBtnOriginal.cloneNode(true) : null;
  if (backBtnOriginal && backBtn) {
    backBtnOriginal.parentNode.replaceChild(backBtn, backBtnOriginal);
  }
  const backOverlay = document.getElementById('order-back-overlay');
  const backCancelBtn = document.getElementById('btn-order-back-cancel');
  const backConfirmBtn = document.getElementById('btn-order-back-confirm');

  if (backBtn && backOverlay) {
    const openBackOverlay = () => {
      backOverlay.classList.add('show');
    };
    // 나가기 확정 시 프로그램적으로 history.go()를 호출하는 동안, 아래 popstate 가드 핸들러가
    // 끼어들어 방지용 기록을 되살리거나 오버레이를 다시 띄우지 않도록 막는 플래그.
    let suppressBackGuard = false;

    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openBackOverlay();
    });

    backCancelBtn.addEventListener('click', () => {
      backOverlay.classList.remove('show');
    });

    backConfirmBtn.addEventListener('click', () => {
      const fallbackUrl = isBundle ? 'cart.html' : `product.html?id=${encodeURIComponent(productId)}`;

      // product.js의 goToOrder가 정상적으로 이 상품 페이지를 거쳐 진입시켰다면
      // sessionStorage에 그 표시를 남겨둔다. 이 표시가 있을 때만 history.go(-2)를 쓴다:
      // 실제 order.html 진입 항목(-1)과 위의 pushState 가드가 쌓아둔 중복 항목(-1)을 건너뛰어
      // order.html 진입 전에 있던 그 상품 페이지 항목을 그대로 재사용하는 것이다.
      // (product.html?id=...로 새 항목을 push하면, 이 상품 페이지 바로 뒤에 order.html이 그대로
      //  남아있게 되어 "상품 페이지에서 또 뒤로가기"를 누르면 order.html로 돌아가버리기 때문이다.)
      //
      // 표시가 없다면(order.html에 직접 URL로 진입한 경우 등) 히스토리에 그 상품 페이지 항목이
      // 아예 없을 수 있어 history.go(-2)가 엉뚱한 곳(about:blank 등)으로 가버릴 수 있으므로,
      // 이 경우엔 곧바로 명시적 이동으로 처리한다.
      const cameFromProductPage = !isBundle && !!productId && sessionStorage.getItem('orderEntryProductId') === productId;
      if (cameFromProductPage) {
        sessionStorage.removeItem('orderEntryProductId');
        history.go(-2);
      } else {
        // 그냥 location.href(또는 replace)로 이동하면 지금 서 있는 방지용 기록 자리만 바뀌거나
        // 새로 쌓일 뿐, 그 아래 깔린 order.html 직접 진입 기록은 그대로 남는다. 그 상태에서
        // 상품 페이지로 이동한 뒤 뒤로가기를 누르면 바로 그 order.html 기록으로 돌아가버린다.
        // 방지용 기록을 한 칸 물러나(go(-1)) order.html 진입 기록 자리로 옮긴 뒤, 그 자리를
        // location.replace로 상품 페이지로 교체해야 order.html 기록이 뒤에 남지 않는다.
        suppressBackGuard = true;
        window.addEventListener('popstate', () => {
          location.replace(fallbackUrl);
        }, { once: true });
        history.go(-1);
      }
    });

    // 배경 클릭 시 닫기
    backOverlay.addEventListener('click', (e) => {
      if (e.target === backOverlay) {
        backOverlay.classList.remove('show');
      }
    });

    // 헤더의 뒤로가기 아이콘뿐 아니라, 브라우저/기기의 실제 뒤로가기(제스처·버튼)를 눌러도
    // 동일하게 확인 오버레이가 뜨도록 처리한다. 진입 시 히스토리를 한 칸 더 쌓아두고,
    // popstate(실제 뒤로가기)가 발생하면 같은 자리로 다시 밀어넣은 뒤 오버레이를 띄운다.
    // 이렇게 하지 않으면 실제 뒤로가기는 이 확인 절차를 거치지 않고 브라우저 히스토리를 그대로 따라가버려서,
    // 로그인을 경유해 들어온 경우 로그인 페이지 등 엉뚱한 곳으로 이동하는 문제가 있었다.
    // 새로고침 시에는 브라우저가 기존 history.state를 그대로 유지한 채 페이지만 다시 로드하므로,
    // 이미 방지용 기록이 쌓여있는 상태(orderBackGuard: true)라면 여기서 또 pushState하지 않는다.
    // 그렇지 않으면 새로고침할 때마다 방지용 기록이 누적되어, 항상 두 칸만 이동하는
    // "나가기"(history.go(-2))가 주문서 페이지를 벗어나지 못하게 된다.
    if (!(history.state && history.state.orderBackGuard)) {
      history.pushState({ orderBackGuard: true }, '', location.href);
    }
    window.addEventListener('popstate', () => {
      if (suppressBackGuard) return;
      history.pushState({ orderBackGuard: true }, '', location.href);
      openBackOverlay();
    });
  }



  let currentUser = null;
  let selectedProduct = null;
  let bundleItems = []; // 묶음 주문일 때 결제 대상 장바구니 항목들 (cartItemId, quantity, version, unitPrice 등)
  let receiverId = null;
  let celebrationMessage = "나는 내가 챙긴다!\n소중한 나에게 주는 선물";
  let lastAuthedUserId = null; // 다른 탭에서 계정을 전환한 뒤 이 탭으로 돌아왔을 때(bfcache 복원) 감지용

  // 주문 재시도 안전성(Idempotency-Key + 요청 내용 보관)은 묶음/즉시 구매 모두에 동일하게 적용한다.
  // 계정별로 보관하고, checkOrderAuthAndLoadData가 다시 실행될 때마다(bfcache 복원 포함) 현재
  // 로그인 계정 기준으로 다시 동기화한다 — 이렇게 안 하면 A 계정으로 보낸 뒤 응답을 못 받은 상태에서
  // B 계정으로 전환하고 "다시 확인"을 누르면, A의 보관 요청이 B 세션으로 전송돼 A의 결과를 복원하는
  // 게 아니라 B의 새 주문이 되어버린다.
  const pendingNotice = document.getElementById('pending-order-notice');
  const btnRetryPending = document.getElementById('btn-retry-pending-order');
  const submitOrderBtn = document.getElementById("btn-submit-order");
  // 버튼 안의 가격(#btn-submit-price)은 그대로 두고 라벨 텍스트만 바꾸기 위해 별도 span을 쓴다.
  // submitOrderBtn.textContent로 통째로 바꾸면 그 span 자체가 사라져, 오류 후 재시도 시
  // 버튼에서 가격 표시가 영구히 없어진다.
  const submitOrderBtnLabel = document.getElementById("btn-submit-label");
  let pendingOrder = null;
  let pendingOwnerUserId = null;

  function pendingOrderKey() {
    return (isBundle ? 'bundle-order-pending:' : 'direct-order-pending:') + currentUser.userId;
  }

  function setPendingUI(isPending) {
    if (pendingNotice) pendingNotice.style.display = isPending ? 'block' : 'none';
    if (submitOrderBtn) submitOrderBtn.disabled = isPending;
    // 대기 상태가 풀릴 때(계정 전환으로 인한 초기화 포함) 버튼 라벨도 "결제하기"로 되돌린다.
    // 그렇지 않으면 이전 계정에서 "결제 진행 중..."으로 바뀐 라벨이 그대로 남아, 실제로는
    // 클릭 가능한데도 아직 처리 중인 것처럼 보인다.
    if (!isPending && submitOrderBtnLabel) submitOrderBtnLabel.textContent = '결제하기';
  }

  // 로그인 계정이 바뀌었거나(다른 탭에서 로그인) 최초 로드일 때, 이전 계정의 대기 주문 상태를
  // 메모리에서 지우고 현재 계정의 보관함을 기준으로 다시 확인한다.
  function syncPendingOrderForCurrentUser() {
    if (currentUser.userId === pendingOwnerUserId) return;
    pendingOrder = null;
    setPendingUI(false);
    try {
      const saved = sessionStorage.getItem(pendingOrderKey());
      if (saved) { pendingOrder = JSON.parse(saved); setPendingUI(true); }
    } catch (e) { /* 저장소를 못 읽으면 그냥 새 주문으로 진행한다 */ }
    pendingOwnerUserId = currentUser.userId;
  }

  async function submitPendingOrder(pending) {
    const path = isBundle ? '/api/order-groups' : '/api/order-groups/direct';
    const orderResult = await requestJson(path, {
      method: 'POST',
      body: pending.body,
      headers: { 'Idempotency-Key': pending.key }
    });
    // orderResult가 없으면(=undefined) 401이라 api.js 전역 인터셉터가 이미 토스트를 띄우고
    // 로그인 페이지로 리다이렉트를 예약해둔 상태다 — 여기서 추가로 처리하지 않는다.
    if (!orderResult) return;
    if (orderResult.data && orderResult.data.orderGroupId) {
      try { sessionStorage.removeItem(pendingOrderKey()); } catch (e) { /* 정리 실패해도 같은 키 재사용은 서버가 막아준다 */ }
      location.href = `complete.html?orderGroupId=${orderResult.data.orderGroupId}`;
      return;
    }
    throw new Error(orderResult.message || "주문에 실패했습니다.");
  }

  function clearPendingOrder() {
    try { sessionStorage.removeItem(pendingOrderKey()); } catch (e) { /* noop */ }
    pendingOrder = null;
    setPendingUI(false);
  }

  async function refreshPriceAfterChange() {
    try {
      if (isBundle) {
        const cartResult = await requestJson('/api/cart-items');
        const idSet = new Set(bundleCartItemIds);
        bundleItems = (cartResult && cartResult.data ? cartResult.data : [])
          .filter(item => idSet.has(item.cartItemId) && item.canOrder);
        renderBundleList(bundleItems);
        const totalPrice = bundleItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        const totalQuantity = bundleItems.reduce((sum, item) => sum + item.quantity, 0);
        renderPriceDisplays(totalPrice, totalQuantity);
      } else {
        const productResult = await requestJson(`/api/products/${productId}`);
        if (productResult && productResult.data) {
          selectedProduct = productResult.data;
          updateUnitPriceDisplay();
          renderPriceDisplays(selectedProduct.price * directQuantity, directQuantity);
        }
      }
    } catch (e) {
      console.error('가격/구성 갱신 실패:', e);
    }
    alert('상품 가격이나 구성이 변경됐어요. 최신 내용을 확인한 뒤 다시 결제해주세요.');
  }

  // 재시도해도 결과가 달라지지 않는 "명확한" 실패 코드 목록 (BE DIRECT_ORDER_GROUPS.md /
  // CART_ORDER_GROUPS.md 오류 표 기준). 상태 코드(400/404/409)만으로는 구분이 안 된다 — 409에는
  // 명확한 실패(PRODUCT_UNAVAILABLE 등)와 재시도해볼 만한 불명확한 실패(CART_BUSY)가 섞여 있으므로
  // 코드 단위로 판단해야 한다.
  const ORDER_DEFINITE_FAILURE_CODES = new Set([
    'INVALID_IDEMPOTENCY_KEY', 'INVALID_DIRECT_ORDER_BODY', 'INVALID_QUANTITY',
    'ORDER_QUANTITY_EXCEEDED', 'CANNOT_GIFT_TO_SELF', 'PRODUCT_NOT_FOUND',
    'RECEIVER_NOT_FOUND', 'USER_NOT_FOUND', 'PRODUCT_UNAVAILABLE', 'INVALID_PRODUCT_PRICE',
    'IDEMPOTENCY_KEY_REUSED', 'CART_ITEM_NOT_FOUND', 'CART_CHANGED'
  ]);

  // 주문 제출(최초 클릭)과 재확인(재시도 버튼) 양쪽에서 같은 규칙으로 오류를 처리한다:
  // 결과가 명확한 실패(값 오류·가격/구성 변경 등)만 보관된 키를 지우고, 그 외(네트워크·CART_BUSY 등
  // 불명확한 경우)는 키를 그대로 남겨 "주문 결과 다시 확인" 버튼으로 재확인할 수 있게 한다.
  async function handleOrderSubmitError(error) {
    console.error('주문 생성/재확인 실패:', error);
    if (error.code === 'PRODUCT_PRICE_CHANGED') {
      clearPendingOrder();
      await refreshPriceAfterChange();
      return;
    }
    if (ORDER_DEFINITE_FAILURE_CODES.has(error.code)) {
      clearPendingOrder();
      alert(error.message || '주문에 실패했습니다. 다시 시도해 주세요.');
      return;
    }
    // 결과 불명확(네트워크 단절, CART_BUSY, 5xx 등) — 보관된 키를 유지하고 재확인 UI를 노출한다.
    setPendingUI(true);
    alert(error.code === 'NETWORK_ERROR'
      ? '네트워크 오류가 발생했습니다. 아래 "주문 결과 다시 확인" 버튼으로 다시 확인해주세요.'
      : '주문 처리 결과를 확인하지 못했어요. 아래 "주문 결과 다시 확인" 버튼으로 다시 확인해주세요.');
  }

  if (btnRetryPending) {
    btnRetryPending.addEventListener('click', async () => {
      if (!pendingOrder) return;
      btnRetryPending.disabled = true;
      btnRetryPending.textContent = '확인 중...';
      try {
        await submitPendingOrder(pendingOrder);
      } catch (error) {
        await handleOrderSubmitError(error);
        btnRetryPending.disabled = false;
        btnRetryPending.textContent = '주문 결과 다시 확인';
      }
    });
  }

  function renderPriceDisplays(totalPrice, itemCount) {
    const priceStr = `${totalPrice.toLocaleString()}원`;
    const countLabel = document.getElementById("order-item-count-label");
    const elTotalPrice = document.getElementById("order-total-price");
    const elFinalPrice = document.getElementById("order-final-price");
    const elSubmitPrice = document.getElementById("btn-submit-price");

    if (countLabel) countLabel.textContent = `총 상품금액 (${itemCount}개)`;
    if (elTotalPrice) elTotalPrice.textContent = priceStr;
    if (elFinalPrice) elFinalPrice.textContent = priceStr;
    if (elSubmitPrice) elSubmitPrice.textContent = priceStr;
  }

  function updateUnitPriceDisplay() {
    const el = document.getElementById("order-unit-price");
    if (!el || !selectedProduct) return;
    el.textContent = directQuantity > 1
      ? `${selectedProduct.price.toLocaleString()}원 × ${directQuantity}개 = ${(selectedProduct.price * directQuantity).toLocaleString()}원`
      : `${selectedProduct.price.toLocaleString()}원`;
  }

  function renderBundleList(items) {
    const list = document.getElementById("order-bundle-list");
    list.replaceChildren();
    for (const item of items) {
      const card = document.createElement("div");
      card.className = "order-product-card";
      card.innerHTML = `
        <img src="${item.thumbnailUrl || ''}" alt="상품 이미지" class="order-product-img">
        <div class="order-product-info">
          <span class="order-brand-name">${item.brand || ''}</span>
          <h3 class="order-product-title">${item.name || ''}</h3>
          <div class="order-product-qty-price" style="font-size: 13px; color: var(--text-sub); margin-top: 4px;">
            ${item.unitPrice.toLocaleString()}원 × ${item.quantity}개 = ${item.subtotal.toLocaleString()}원
          </div>
        </div>`;
      list.appendChild(card);
    }
  }

  // 1. 로그인 여부 확인 (화면을 그리기 전에 먼저 검증 - Route Guard)
  // 3. 주문서 조회 API (상품 상세 정보 조회 API 활용)를 사용하여 상품 정보 조회
  // bfcache로 페이지가 복원될 때(pageshow, persisted) 재검증할 수 있도록 함수로 분리한다.
  async function checkOrderAuthAndLoadData() {
    // 401은 api.js 전역 인터셉터가 처리(redirect 파라미터 포함 로그인 이동)하므로 여기선 그 외 오류만 다룬다.
    // productId 검사보다 먼저 실행해야, productId 없이 접근한 미인증 사용자도
    // (index.html이 아니라) 원래대로 로그인 흐름을 타게 된다.
    try {
      const authResult = await requestJson('/api/auth/me');
      if (authResult && authResult.data) {
        // 다른 탭에서 계정을 전환한 뒤 이 탭으로 돌아오면(bfcache 복원), 화면에 이미 그려진
        // 상품/받는 사람/선택한 장바구니 항목 등이 이전 계정 기준이라 그대로 쓰면 안 된다.
        // cart.js의 ensureIdentity와 동일하게, 계정이 바뀐 걸 감지하면 새로고침을 안내한다.
        if (lastAuthedUserId !== null && authResult.data.userId !== lastAuthedUserId) {
          alert('로그인 계정이 변경됐어요. 새로고침 후 현재 계정으로 다시 이용해주세요.');
          location.reload();
          return false;
        }
        currentUser = authResult.data;
        lastAuthedUserId = currentUser.userId;
        // 나에게 선물하기는 받는 사람이 나 자신이므로, bfcache 재검증으로 currentUser가
        // 다른 계정으로 바뀌어도 receiverId가 그 계정을 계속 따라가도록 매번 갱신한다.
        if (orderType === 'self') {
          receiverId = currentUser.userId;
        }
        // 계정이 바뀌었을 수 있으니(다른 탭 로그인 후 bfcache 복원 등) 대기 주문 상태를 매번 다시 확인한다.
        syncPendingOrderForCurrentUser();
      } else {
        return false;
      }
    } catch (error) {
      console.error("인증 확인 실패:", error);
      alert("사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    if (isBundle) {
      try {
        const cartResult = await requestJson('/api/cart-items');
        const idSet = new Set(bundleCartItemIds);
        bundleItems = (cartResult && cartResult.data ? cartResult.data : [])
          .filter(item => idSet.has(item.cartItemId) && item.canOrder);
        if (!bundleItems.length) {
          alert("담아둔 상품을 찾을 수 없습니다. 장바구니를 다시 확인해주세요.");
          location.href = "cart.html";
          return false;
        }

        document.getElementById("order-product-card").style.display = "none";
        document.getElementById("order-bundle-list").style.display = "flex";
        renderBundleList(bundleItems);

        const totalPrice = bundleItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        const totalQuantity = bundleItems.reduce((sum, item) => sum + item.quantity, 0);
        renderPriceDisplays(totalPrice, totalQuantity);
      } catch (error) {
        console.error("장바구니 정보 조회 실패:", error);
        alert("장바구니 정보를 불러오는 데 실패했습니다.");
        location.href = "cart.html";
        return false;
      }
    } else {
      if (!productId) {
        alert("올바르지 않은 접근입니다.");
        location.href = "index.html";
        return false;
      }

      try {
        const productResult = await requestJson(`/api/products/${productId}`);
        if (productResult && productResult.data) {
          selectedProduct = productResult.data;

          // 상품 정보 화면 바인딩
          document.getElementById("order-product-img").src = selectedProduct.thumbnailUrl;
          document.getElementById("order-brand").textContent = selectedProduct.brand;
          document.getElementById("order-name").textContent = selectedProduct.name;
          updateUnitPriceDisplay();

          renderPriceDisplays(selectedProduct.price * directQuantity, directQuantity);
        } else {
          alert("상품 정보를 찾을 수 없습니다.");
          location.href = "index.html";
          return false;
        }
      } catch (error) {
        console.error("상품 정보 조회 실패:", error);
        alert("상품 정보를 불러오는 데 실패했습니다.");
        location.href = "index.html";
        return false;
      }
    }

    // 인증 및 데이터 로드 완료 후 화면 표시 (깜빡임 방지)
    document.body.style.visibility = "visible";
    document.body.style.opacity = "1";
    return true;
  }

  // component.js의 공통 헬퍼: 최초 실행 후 bfcache 복원 시 재검증까지 등록해준다.
  const isReady = await window.registerBfcacheRevalidation(checkOrderAuthAndLoadData);
  if (!isReady) {
    return;
  }

  // 4. 선물 유형에 따른 받는 사람 UI 제어
  const receiverSection = document.getElementById("receiver-section");
  const selfReceiverSection = document.getElementById("self-receiver-section");
  const isSelfGift = (orderType === 'self');

  if (isSelfGift) {
    selfReceiverSection.style.display = "block";
    // receiverId는 checkOrderAuthAndLoadData에서 currentUser 갱신과 함께 이미 설정된다.
  } else {
    receiverSection.style.display = "block";
    
    // 기본 메시지 변경 (선물하기의 경우)
    celebrationMessage = "생일 축하해!\nhappy birthday";
    const mainPrimary = document.querySelector('.celebration-card .card-text-primary');
    const mainSecondary = document.querySelector('.celebration-card .card-text-secondary');
    if (mainPrimary) mainPrimary.textContent = "생일 축하해!";
    if (mainSecondary) mainSecondary.textContent = "happy birthday";
    
    // 받는 사람 검색 로직
    const searchUserBtn = document.getElementById("btn-search-user");
    const nicknameInput = document.getElementById("receiver-nickname-input");
    const searchResultDiv = document.getElementById("receiver-search-result");

    searchUserBtn.addEventListener("click", async () => {
      const nickname = nicknameInput.value.trim();
      if (!nickname) {
        alert("검색할 닉네임을 입력해 주세요.");
        return;
      }

      try {
        const userSearchResult = await requestJson(`/api/users/search?nickname=${encodeURIComponent(nickname)}`);
        if (userSearchResult && userSearchResult.data) {
          const foundUser = userSearchResult.data;

          if (foundUser.userId === currentUser.userId) {
            alert("자기 자신에게는 선물할 수 없습니다. '나에게 선물하기'를 이용해주세요.");
            searchResultDiv.style.color = "red";
            searchResultDiv.textContent = "자기 자신에게는 선물할 수 없습니다.";
            receiverId = null;
            return;
          }

          searchResultDiv.style.color = "green";
          searchResultDiv.textContent = `선택된 대상: ${foundUser.nickname}`;
          receiverId = foundUser.userId;
        } else {
          searchResultDiv.style.color = "red";
          searchResultDiv.textContent = "사용자를 찾을 수 없습니다.";
          receiverId = null;
        }
      } catch (error) {
        console.error("사용자 검색 실패:", error);
        searchResultDiv.style.color = "red";
        searchResultDiv.textContent = error.status === 404
          ? "사용자를 찾을 수 없습니다."
          : "검색 중 오류가 발생했습니다.";
        receiverId = null;
      }
    });
  }

  // 5. 결제 및 주문 생성 로직
  submitOrderBtn.addEventListener("click", async () => {
    if (!receiverId) {
      alert("받는 사람을 지정해 주세요.");
      return;
    }

    const requestBody = isBundle
      ? {
          items: bundleItems.map(item => ({
            cartItemId: item.cartItemId,
            quantity: item.quantity,
            version: item.version,
            expectedUnitPrice: item.unitPrice
          })),
          message: celebrationMessage ? celebrationMessage.trim() : null,
          isSelfGift: isSelfGift,
          receiverId: Number(receiverId)
        }
      : {
          // 수량 1개도 포함해 즉시 구매는 항상 그룹 주문 API를 사용한다 (기존 단건 API는 레거시 호환용).
          productId: Number(productId),
          quantity: directQuantity,
          expectedUnitPrice: selectedProduct.price,
          message: celebrationMessage ? celebrationMessage.trim() : null,
          isSelfGift: isSelfGift,
          receiverId: Number(receiverId)
        };
    const pending = { key: crypto.randomUUID(), body: requestBody };

    // 재시도 안전성의 핵심은 "요청을 보내기 전에 먼저 보관"하는 순서다. 보관 자체가 실패하면
    // (저장소 접근 불가 등) 새로고침 후 같은 키로 복원할 방법이 없어지므로, 이 경우엔 요청을
    // 아예 보내지 않고 중단한다 — 그렇지 않으면 성공한 주문의 결과를 잃어버리고 새 키로 재시도해
    // 중복 주문이 생길 위험이 있다.
    try {
      sessionStorage.setItem(pendingOrderKey(), JSON.stringify(pending));
    } catch (e) {
      alert('브라우저 저장 공간에 접근할 수 없어 주문을 보낼 수 없어요. 시크릿 모드나 저장소 차단 설정을 확인해주세요.');
      return;
    }
    pendingOrder = pending;

    submitOrderBtn.disabled = true;
    submitOrderBtnLabel.textContent = "결제 진행 중...";
    try {
      await submitPendingOrder(pending);
    } catch (error) {
      await handleOrderSubmitError(error);
      // 결과가 불명확해 재확인 대기 상태로 남았다면(setPendingUI(true)) 제출 버튼은 계속
      // 비활성 상태를 유지하고, "주문 결과 다시 확인" 버튼이 다음 시도를 담당한다.
      if (!pendingOrder) {
        submitOrderBtn.disabled = false;
        submitOrderBtnLabel.textContent = "결제하기";
      }
    }
  });

  // 6. 메시지 편집 오버레이 제어 로직
  const btnEditMessage = document.querySelector('.btn-edit-message');
  const messageEditOverlay = document.getElementById('message-edit-overlay');
  const btnEditCancel = document.getElementById('btn-edit-cancel');
  const btnEditSave = document.getElementById('btn-edit-save');
  const editMessageInput = document.getElementById('edit-message-input');
  const previewTextPrimary = document.getElementById('preview-text-primary');
  const previewTextSecondary = document.getElementById('preview-text-secondary');

  const currentCharCount = document.getElementById('current-char-count');

  const updatePreview = (text) => {
    if (!previewTextPrimary || !previewTextSecondary) return;
    const lines = text.split('\n');
    previewTextPrimary.textContent = lines[0] || '';
    previewTextSecondary.textContent = lines.slice(1).join('\n') || '';

    if (currentCharCount) {
      currentCharCount.textContent = text.length;
    }
  };

  if (btnEditMessage && messageEditOverlay && editMessageInput) {
    btnEditMessage.addEventListener('click', () => {
      // Prefill with current celebration card text
      const mainPrimary = document.querySelector('.celebration-card .card-text-primary');
      const mainSecondary = document.querySelector('.celebration-card .card-text-secondary');
      
      const currentText = (mainPrimary ? mainPrimary.textContent : '') + 
                          (mainSecondary && mainSecondary.textContent ? '\n' + mainSecondary.textContent : '');
      
      editMessageInput.value = currentText;
      updatePreview(currentText);

      messageEditOverlay.classList.add('open');

      // Autofocus and place cursor at the end
      setTimeout(() => {
        editMessageInput.focus();
        const length = editMessageInput.value.length;
        editMessageInput.setSelectionRange(length, length);
      }, 50);
    });
  }

  if (editMessageInput) {
    editMessageInput.addEventListener('input', (e) => {
      let val = e.target.value;
      if (val.length > 100) {
        val = val.slice(0, 100);
        e.target.value = val;
      }
      updatePreview(val);
    });
  }

  if (btnEditCancel && messageEditOverlay) {
    btnEditCancel.addEventListener('click', () => {
      messageEditOverlay.classList.remove('open');
    });
  }

  const btnClearMessage = document.getElementById('btn-clear-message');
  if (btnClearMessage && editMessageInput) {
    btnClearMessage.addEventListener('click', () => {
      editMessageInput.value = '';
      updatePreview('');
      editMessageInput.focus();
    });
  }

  if (btnEditSave && messageEditOverlay) {
    btnEditSave.addEventListener('click', () => {
      const mainPrimary = document.querySelector('.celebration-card .card-text-primary');
      const mainSecondary = document.querySelector('.celebration-card .card-text-secondary');
      
      celebrationMessage = editMessageInput.value;
      const lines = celebrationMessage.split('\n');
      if (mainPrimary) mainPrimary.textContent = lines[0] || '';
      if (mainSecondary) mainSecondary.textContent = lines.slice(1).join('\n') || '';

      messageEditOverlay.classList.remove('open');
    });
  }
});


