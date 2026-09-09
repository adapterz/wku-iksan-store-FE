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
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      backOverlay.classList.add('show');
    });

    backCancelBtn.addEventListener('click', () => {
      backOverlay.classList.remove('show');
    });

    backConfirmBtn.addEventListener('click', () => {
      // 로그인을 경유해 들어온 경우 등 히스토리 스택이 뒤틀려 있어도
      // 항상 원래 보던 상품 페이지로 돌아가도록 productId 기반으로 명시적 이동한다.
      window.location.href = productId
        ? `product.html?id=${encodeURIComponent(productId)}`
        : 'index.html';
    });

    // 배경 클릭 시 닫기
    backOverlay.addEventListener('click', (e) => {
      if (e.target === backOverlay) {
        backOverlay.classList.remove('show');
      }
    });
  }



  let currentUser = null;
  let selectedProduct = null;
  let receiverId = null;
  let celebrationMessage = "나는 내가 챙긴다!\n소중한 나에게 주는 선물";

  if (!productId) {
    alert("올바르지 않은 접근입니다.");
    location.href = "index.html";
    return;
  }

  // 1. 로그인 여부 확인 (화면을 그리기 전에 먼저 검증 - Route Guard)
  // 3. 주문서 조회 API (상품 상세 정보 조회 API 활용)를 사용하여 상품 정보 조회
  // bfcache로 페이지가 복원될 때(pageshow, persisted) 재검증할 수 있도록 함수로 분리한다.
  async function checkOrderAuthAndLoadData() {
    // 401은 api.js 전역 인터셉터가 처리(redirect 파라미터 포함 로그인 이동)하므로 여기선 그 외 오류만 다룬다.
    try {
      const authResult = await requestJson('/api/auth/me');
      if (authResult && authResult.data) {
        currentUser = authResult.data;
      } else {
        return false;
      }
    } catch (error) {
      console.error("인증 확인 실패:", error);
      alert("사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
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

  const isReady = await checkOrderAuthAndLoadData();
  if (!isReady) {
    return;
  }

  // 뒤로가기 등으로 bfcache에서 페이지가 복원되면 head의 인라인 스크립트가 body를 다시 숨기므로,
  // 여기서 재검증 후 다시 보여주지 않으면 흰 화면으로 남는다.
  window.addEventListener('pageshow', async (event) => {
    if (event.persisted) {
      await checkOrderAuthAndLoadData();
    }
  });

  // 4. 선물 유형에 따른 받는 사람 UI 제어
  const receiverSection = document.getElementById("receiver-section");
  const selfReceiverSection = document.getElementById("self-receiver-section");
  const isSelfGift = (orderType === 'self');

  if (isSelfGift) {
    selfReceiverSection.style.display = "block";
    receiverId = currentUser.userId; // 나에게 선물하기는 받는 사람이 나 자신
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
  const messageInput = document.getElementById("message-input");

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


