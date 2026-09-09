document.addEventListener("DOMContentLoaded", async () => {
  // 2. URL 파라미터에서 productId 및 선물 유형(type) 추출
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('productId');
  const orderType = urlParams.get('type') || 'self'; // 'self' or 'gift'

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

    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openBackOverlay();
    });

    backCancelBtn.addEventListener('click', () => {
      backOverlay.classList.remove('show');
    });

    backConfirmBtn.addEventListener('click', () => {
      const fallbackUrl = `product.html?id=${encodeURIComponent(productId)}`;

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
      const cameFromProductPage = sessionStorage.getItem('orderEntryProductId') === productId;
      if (cameFromProductPage) {
        sessionStorage.removeItem('orderEntryProductId');
        history.go(-2);
      } else {
        window.location.href = fallbackUrl;
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
      history.pushState({ orderBackGuard: true }, '', location.href);
      openBackOverlay();
    });
  }



  let currentUser = null;
  let selectedProduct = null;
  let receiverId = null;
  let celebrationMessage = "나는 내가 챙긴다!\n소중한 나에게 주는 선물";

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
        currentUser = authResult.data;
        // 나에게 선물하기는 받는 사람이 나 자신이므로, bfcache 재검증으로 currentUser가
        // 다른 계정으로 바뀌어도 receiverId가 그 계정을 계속 따라가도록 매번 갱신한다.
        if (orderType === 'self') {
          receiverId = currentUser.userId;
        }
      } else {
        return false;
      }
    } catch (error) {
      console.error("인증 확인 실패:", error);
      alert("사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

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

        const totalPrice = selectedProduct.price;
        const priceStr = `${totalPrice.toLocaleString()}원`;

        document.getElementById("order-unit-price").textContent = priceStr;

        const elTotalPrice = document.getElementById("order-total-price");
        const elFinalPrice = document.getElementById("order-final-price");
        const elSubmitPrice = document.getElementById("btn-submit-price");

        if (elTotalPrice) elTotalPrice.textContent = priceStr;
        if (elFinalPrice) elFinalPrice.textContent = priceStr;
        if (elSubmitPrice) elSubmitPrice.textContent = priceStr;
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
  const submitOrderBtn = document.getElementById("btn-submit-order");

  submitOrderBtn.addEventListener("click", async () => {
    if (!receiverId) {
      alert("받는 사람을 지정해 주세요.");
      return;
    }

    const requestBody = {
      productId: Number(productId),
      message: celebrationMessage ? celebrationMessage.trim() : null,
      isSelfGift: isSelfGift,
      receiverId: Number(receiverId)
    };

    try {
      submitOrderBtn.disabled = true;
      submitOrderBtn.textContent = "결제 진행 중...";

      const orderResult = await requestJson('/api/orders', {
        method: 'POST',
        body: requestBody
      });

      if (orderResult.code === "ORDER_CREATE_SUCCESS") {
        location.href = `complete.html?orderId=${orderResult.data.orderId}`;
      } else {
        alert(orderResult.message || "주문에 실패했습니다. 다시 시도해 주세요.");
        submitOrderBtn.disabled = false;
        submitOrderBtn.textContent = "결제하기";
      }
    } catch (error) {
      console.error("주문 생성 실패:", error);
      alert(error.code === 'NETWORK_ERROR'
        ? "네트워크 오류가 발생했습니다. 다시 시도해 주세요."
        : "주문에 실패했습니다. 다시 시도해 주세요.");
      submitOrderBtn.disabled = false;
      submitOrderBtn.textContent = "결제하기";
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


