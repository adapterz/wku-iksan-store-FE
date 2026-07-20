document.addEventListener("DOMContentLoaded", async () => {
  // 뒤로가기 버튼 로직 (확인 오버레이 띄우기)
  const backBtn = document.getElementById('btn-back');
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
      window.location.href = 'index.html';
    });

    // 배경 클릭 시 닫기
    backOverlay.addEventListener('click', (e) => {
      if (e.target === backOverlay) {
        backOverlay.classList.remove('show');
      }
    });
  }

  // 검색 오버레이 열기/닫기 로직
  const searchOpenBtn = document.getElementById('btn-search-open');
  const searchCloseBtn = document.getElementById('btn-search-close');
  const searchOverlay = document.getElementById('search-overlay');
  const searchInput = searchOverlay ? searchOverlay.querySelector('.search-overlay-input') : null;

  if (searchOpenBtn && searchCloseBtn && searchOverlay) {
    searchOpenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      searchOverlay.classList.add('open');
      if (searchInput) {
        setTimeout(() => searchInput.focus(), 50);
      }
    });

    searchCloseBtn.addEventListener('click', () => {
      searchOverlay.classList.remove('open');
    });
  }

  let currentUser = null;
  let selectedProduct = null;
  let receiverId = null;
  let celebrationMessage = "나는 내가 챙긴다!\n소중한 나에게 주는 선물";

  // 1. 로그인 여부 확인
  try {
    const authResponse = await fetch('/api/auth/me', { credentials: 'include' });
    if (!authResponse.ok) {
      alert("로그인이 필요한 서비스입니다.");
      location.href = "login.html";
      return;
    }
    const authResult = await authResponse.json();
    if (authResult && authResult.data) {
      currentUser = authResult.data;
    } else {
      alert("로그인이 필요한 서비스입니다.");
      location.href = "login.html";
      return;
    }
  } catch (error) {
    console.error("인증 확인 실패:", error);
    alert("로그인이 필요한 서비스입니다.");
    location.href = "login.html";
    return;
  }

  // 2. URL 파라미터에서 productId 및 선물 유형(type) 추출
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('productId');
  const orderType = urlParams.get('type') || 'self'; // 'self' or 'gift'

  if (!productId) {
    alert("올바르지 않은 접근입니다.");
    location.href = "index.html";
    return;
  }

  // 3. 주문서 조회 API (상품 상세 정보 조회 API 활용)를 사용하여 상품 정보 조회
  try {
    const productResponse = await fetch(`/api/products/${productId}`, { credentials: 'include' });
    if (!productResponse.ok) {
      throw new Error(`HTTP error! status: ${productResponse.status}`);
    }
    const productResult = await productResponse.json();
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
      return;
    }
  } catch (error) {
    console.error("상품 정보 조회 실패:", error);
    alert("상품 정보를 불러오는 데 실패했습니다.");
    location.href = "index.html";
    return;
  }

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
        const userSearchResponse = await fetch(`/api/users/search?nickname=${encodeURIComponent(nickname)}`, { credentials: 'include' });
        if (!userSearchResponse.ok) {
          searchResultDiv.style.color = "red";
          searchResultDiv.textContent = "사용자를 찾을 수 없습니다.";
          receiverId = null;
          return;
        }

        const userSearchResult = await userSearchResponse.json();
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
        searchResultDiv.textContent = "검색 중 오류가 발생했습니다.";
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

      const orderResponse = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        credentials: 'include'
      });

      const orderResult = await orderResponse.json();

      if (orderResponse.ok && orderResult.code === "ORDER_CREATE_SUCCESS") {
        location.href = `complete.html?orderId=${orderResult.data.orderId}`;
      } else {
        alert(orderResult.message || "주문에 실패했습니다. 다시 시도해 주세요.");
        submitOrderBtn.disabled = false;
        submitOrderBtn.textContent = "결제하기";
      }
    } catch (error) {
      console.error("주문 생성 실패:", error);
      alert("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
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

// Top Nav Tab Bar Click Logic (FOR ME, 홈, 랭킹, 썸머세일, 와인/맥주...)
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      // Prevent default navigation if href is '#' or equivalent to prevent jumpy page reloads
      if (item.getAttribute('href') === '#') {
        e.preventDefault();
      }
      navItems.forEach(el => el.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // Mouse wheel horizontal scrolling translation for .nav-bar
  const navBar = document.querySelector('.nav-bar');
  if (navBar) {
    navBar.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        navBar.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }