// 상품 데이터를 화면에 렌더링하는 함수
function renderProduct(product) {
  const timeoutStateElement = document.getElementById("product-error-state");
  const imgElement = document.getElementById("product-img");
  const imgWrapper = document.getElementById("product-img-wrapper");
  const brandElement = document.getElementById("product-brand");
  const nameElement = document.getElementById("product-name");
  const priceElement = document.getElementById("product-price");
  const descElement = document.getElementById("product-description");
  const usageElement = document.getElementById("product-usage");
  const brandNavElement = document.getElementById("product-brand-nav");

  // 타임아웃으로 임시 안내가 떠 있었다면 해제하고 실제 카드를 다시 노출
  if (timeoutStateElement) timeoutStateElement.style.display = 'none';
  const cardElement = document.querySelector('.product-detail-card');
  if (cardElement) cardElement.style.display = '';

  if (imgElement) {
    imgElement.src = product.thumbnailUrl;
    imgElement.style.display = 'block';
  }
  if (imgWrapper) imgWrapper.classList.remove('skeleton');

  [brandElement, nameElement, priceElement].forEach(el => {
    if (!el) return;
    el.classList.remove('skeleton');
    el.style.minWidth = 'unset';
    el.style.minHeight = 'unset';
  });

  if (brandElement) brandElement.textContent = product.brand;
  if (nameElement) nameElement.textContent = product.name;
  if (priceElement) priceElement.textContent = `${product.price.toLocaleString()}원`;
  if (descElement) descElement.textContent = product.description;
  if (usageElement) usageElement.textContent = product.usageInfo;
  if (brandNavElement) brandNavElement.textContent = product.brand;

  // Store product price globally and trigger bottom sheet price update
  window.productPrice = product.price;
  if (window.updateBottomSheetPrice) {
    window.updateBottomSheetPrice();
  }
}

// 상품 데이터가 없거나 에러 발생 시 처리
function showErrorAndRedirect() {
  const container = document.querySelector('.product-detail-card');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; font-family: sans-serif;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 48px; color: #ff5a5f; margin-bottom: 20px;"></i>
        <h3 style="font-size: 18px; color: #191919; margin-bottom: 10px; font-weight: 600;">상품을 찾을 수 없습니다</h3>
        <p style="font-size: 14px; color: #767676; margin-bottom: 24px; line-height: 1.5;">존재하지 않는 상품이거나 판매가 종료된 상품입니다.</p>
        <button onclick="location.href='index.html'" style="background-color: #fee500; border: none; border-radius: 8px; padding: 12px 24px; font-size: 14px; font-weight: bold; cursor: pointer; color: #191919;">홈으로 이동</button>
      </div>
    `;
  }

  // 하단 주문 액션 바 비활성화/숨김 처리
  const bottomNav = document.querySelector('.product-bottom-nav');
  if (bottomNav) {
    bottomNav.style.display = 'none';
  }

  const timeoutStateElement = document.getElementById("product-error-state");
  if (timeoutStateElement) timeoutStateElement.style.display = 'none';
}

// 최대 노출 시간 초과: 아직 응답 대기 중이므로 카드를 잠시 숨기고 지연 안내로 전환
// (응답이 이후 도착하면 renderProduct가 카드를 되돌려 놓음)
function showProductLoadingDelayed() {
  const cardElement = document.querySelector('.product-detail-card');
  const timeoutStateElement = document.getElementById("product-error-state");
  if (cardElement) cardElement.style.display = 'none';
  if (timeoutStateElement) timeoutStateElement.style.display = 'flex';
}

// API로부터 상품 상세 데이터 가져오기
async function loadProductDetail(id) {
  const settle = createSkeletonGuard(showProductLoadingDelayed, 1500);
  try {
    const response = await fetch(`/api/products/${id}`, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    settle();
    if (result && result.data) {
      renderProduct(result.data);
    } else {
      showErrorAndRedirect();
    }
  } catch (error) {
    settle();
    console.error("상품 상세 데이터를 불러오는 데 실패했습니다:", error);
    showErrorAndRedirect();
  }
}

// 상품 데이터가 없거나 에러 발생 시 처리
function showErrorAndRedirect() {
  const container = document.querySelector('.product-detail-card');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; font-family: sans-serif;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 48px; color: #ff5a5f; margin-bottom: 20px;"></i>
        <h3 style="font-size: 18px; color: #191919; margin-bottom: 10px; font-weight: 600;">상품을 찾을 수 없습니다</h3>
        <p style="font-size: 14px; color: #767676; margin-bottom: 24px; line-height: 1.5;">존재하지 않는 상품이거나 판매가 종료된 상품입니다.</p>
        <button onclick="location.href='index.html'" style="background-color: #fee500; border: none; border-radius: 8px; padding: 12px 24px; font-size: 14px; font-weight: bold; cursor: pointer; color: #191919;">홈으로 이동</button>
      </div>
    `;
  }
  
  // 하단 주문 액션 바 비활성화/숨김 처리
  const bottomNav = document.querySelector('.product-bottom-nav');
  if (bottomNav) {
    bottomNav.style.display = 'none';
  }
}

async function goToOrder(productId, type) {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (response.ok) {
      let url = `order.html?productId=${productId}&type=${type}`;
      window.location.href = url;
    } else {
      const redirectTarget = encodeURIComponent(window.location.href);
      window.location.href = `login.html?redirect=${redirectTarget}`;
    }
  } catch (error) {
    console.error('로그인 상태 확인 실패:', error);
    window.location.href = 'login.html';
  }
}

// DOM이 로드된 후 데이터 로드 실행
document.addEventListener("DOMContentLoaded", () => {
  // URL 쿼리 파라미터에서 상품 ID 추출 (기본값 1)
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id') || 1;

  loadProductDetail(productId);

  // 뒤로가기 버튼 로직
  const backBtn = document.getElementById('btn-back');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // 브라우저 히스토리가 있거나 리퍼러가 있는 경우 이전 페이지로 이동
      if (window.history.length > 1 && document.referrer) {
        window.history.back();
      } else {
        // 직접 진입 등 이전 페이지가 없는 경우 홈으로 이동
        window.location.href = 'index.html';
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

  // 위시리스트 토글 로직
  const wishBtn = document.getElementById('btn-wish');
  if (wishBtn) {
    wishBtn.addEventListener('click', () => {
      const icon = wishBtn.querySelector('i');
      const countSpan = wishBtn.querySelector('.wish-count');
      wishBtn.classList.toggle('active');

      if (wishBtn.classList.contains('active')) {
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
      } else {
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
      }

      let currentCount = parseInt(countSpan.textContent || '0', 10) || 0;
      if (wishBtn.classList.contains('active')) {
        currentCount += 1;
      } else {
        currentCount = Math.max(0, currentCount - 1);
      }
      countSpan.textContent = currentCount;
    });
  }

  // 나에게 선물하기 및 선물하기 버튼 클릭 시 로그인 상태를 먼저 확인하고 주문 페이지로 이동
  const buyBtn = document.querySelector('.btn-bottom-buy');
  
  // Bottom Sheet open/close and drag/swipe logic
  const bottomSheetOverlay = document.getElementById('bottom-sheet-overlay');
  const bottomSheet = document.getElementById('bottom-sheet-content');
  const bottomSheetHeader = document.getElementById('bottom-sheet-handle-container');

  const openBottomSheet = () => {
    if (!bottomSheetOverlay || !bottomSheet) return;
    bottomSheetOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      bottomSheet.style.transform = 'translateY(0)';
    }, 10);
  };

  const closeBottomSheet = () => {
    if (!bottomSheetOverlay || !bottomSheet) return;
    bottomSheet.style.transform = 'translateY(100%)';
    document.body.style.overflow = '';
    setTimeout(() => {
      bottomSheetOverlay.classList.remove('active');
    }, 250);
  };

  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      openBottomSheet();
    });
  }

  const updateTotalPrice = () => {
    const totalPriceVal = document.querySelector('.total-price-value');
    if (!totalPriceVal) return;
    const price = window.productPrice || 0;
    totalPriceVal.textContent = `${price.toLocaleString()}원`;
  };

  // Expose function globally so renderProduct can call it when the price is loaded
  window.updateBottomSheetPrice = updateTotalPrice;

  if (bottomSheetOverlay && bottomSheet) {
    // 닫기 버튼 클릭 시 closeBottomSheet 호출
    const handleCloseBtn = document.querySelector('.bottom-sheet-handle-btn');
    if (handleCloseBtn) {
      handleCloseBtn.addEventListener('click', () => {
        closeBottomSheet();
      });
    }

    // dim area click
    bottomSheetOverlay.addEventListener('click', (e) => {
      if (e.target === bottomSheetOverlay) {
        closeBottomSheet();
      }
    });

    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let startTime = 0;

    const startDrag = (y) => {
      startY = y;
      currentY = y;
      isDragging = true;
      startTime = Date.now();
      bottomSheet.style.transition = 'none';
    };

    const drag = (y) => {
      if (!isDragging) return;
      currentY = y;
      const deltaY = currentY - startY;
      if (deltaY > 0) {
        bottomSheet.style.transform = `translateY(${deltaY}px)`;
      }
    };

    const endDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      bottomSheet.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
      
      const deltaY = currentY - startY;
      const elapsedTime = Date.now() - startTime;
      const velocity = deltaY / elapsedTime;

      // Close if dragged down more than 100px OR swiped fast (velocity > 0.4)
      if (deltaY > 100 || velocity > 0.4) {
        closeBottomSheet();
      } else {
        bottomSheet.style.transform = 'translateY(0)';
      }
    };

    // Drag events for header
    if (bottomSheetHeader) {
      bottomSheetHeader.addEventListener('mousedown', (e) => startDrag(e.clientY));
      bottomSheetHeader.addEventListener('touchstart', (e) => {
        startDrag(e.touches[0].clientY);
      }, { passive: true });
    }

    // Move and End events on window to handle release outside the header
    window.addEventListener('mousemove', (e) => {
      if (isDragging) drag(e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (isDragging) endDrag();
    });

    window.addEventListener('touchmove', (e) => {
      if (isDragging) {
        drag(e.touches[0].clientY);
      }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      if (isDragging) endDrag();
    });
  }

  const sheetBuyBtn = document.querySelector('.btn-sheet-buy');
  if (sheetBuyBtn) {
    sheetBuyBtn.addEventListener('click', () => {
      goToOrder(productId, 'self');
    });
  }

  const giftBtn = document.querySelector('.btn-bottom-gift');
  if (giftBtn) {
    giftBtn.addEventListener('click', () => {
      goToOrder(productId, 'gift');
    });
  }

  // Save (bookmark) button logic
  const saveBtns = document.querySelectorAll('button[title="선물상자 담기"], button[aria-label="저장"]');
  saveBtns.forEach(btn => {
    // Initialize state
    const icon = btn.querySelector('i');
    if (icon) {
      let savedProducts = JSON.parse(localStorage.getItem('saved_products') || '[]');
      if (savedProducts.includes(productId.toString())) {
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
        icon.style.color = '#191919';
      }
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const icon = btn.querySelector('i');
      if (icon) {
        let savedProducts = JSON.parse(localStorage.getItem('saved_products') || '[]');
        const productIdStr = productId.toString();

        if (icon.classList.contains('fa-regular')) {
          // Save
          icon.classList.remove('fa-regular');
          icon.classList.add('fa-solid');
          icon.style.color = '#191919';
          if (!savedProducts.includes(productIdStr)) {
            savedProducts.push(productIdStr);
            localStorage.setItem('saved_products', JSON.stringify(savedProducts));
            window.dispatchEvent(new Event('saved-products-updated'));
          }
        } else {
          // Unsave
          icon.classList.remove('fa-solid');
          icon.classList.add('fa-regular');
          icon.style.color = ''; // Revert to original CSS color
          const index = savedProducts.indexOf(productIdStr);
          if (index > -1) {
            savedProducts.splice(index, 1);
            localStorage.setItem('saved_products', JSON.stringify(savedProducts));
            window.dispatchEvent(new Event('saved-products-updated'));
          }
        }
      }
    });
  });

  // Sync logic for product.js
  function syncProductSaveButtons() {
    let savedProducts = JSON.parse(localStorage.getItem('saved_products') || '[]');
    const isSaved = savedProducts.includes(productId.toString());
    saveBtns.forEach(btn => {
      const icon = btn.querySelector('i');
      if (icon) {
        if (isSaved) {
          icon.classList.remove('fa-regular');
          icon.classList.add('fa-solid');
          icon.style.color = '#191919';
        } else {
          icon.classList.remove('fa-solid');
          icon.classList.add('fa-regular');
          icon.style.color = '';
        }
      }
    });
  }

  window.addEventListener('saved-products-updated', syncProductSaveButtons);
  window.addEventListener('storage', (e) => {
    if (e.key === 'saved_products') {
      syncProductSaveButtons();
    }
  });
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