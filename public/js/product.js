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
  const cardElementForData = document.querySelector('.product-detail-card');
  if (cardElementForData) {
    cardElementForData.dataset.price = product.price;
  }
  
  if (typeof window.updateBottomSheetPrice === 'function') {
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
    const result = await requestJson(`/api/products/${id}`);
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


async function goToOrder(productId, type) {
  try {
    await requestJson('/api/auth/me');
    let url = `order.html?productId=${productId}&type=${type}`;
    window.location.href = url;
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      const redirectTarget = encodeURIComponent(window.location.href);
      window.location.href = `login.html?redirect=${redirectTarget}`;
      return;
    }
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
  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
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
    // Initialize state asynchronously
    const icon = btn.querySelector('i');
    if (icon) {
      (async () => {
        try {
          const isSaved = await window.isProductSaved(productId);
          window.updateWishlistIcon(icon, isSaved);
        } catch (error) {
          console.error('찜 상태 초기화 실패:', error);
        }
      })();
    }

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const icon = btn.querySelector('i');
      if (icon) {
        try {
          const isNowSaved = await window.toggleSavedProduct(productId);
          window.updateWishlistIcon(icon, isNowSaved);
        } catch (error) {
          // 실패하면 기존 아이콘 유지
          console.error('찜 토글 에러:', error);
        }
      }
    });
  });

  // Helper to sync save buttons state
  async function syncProductSaveButtons() {
    try {
      const isSaved = await window.isProductSaved(productId);
      saveBtns.forEach(btn => {
        const icon = btn.querySelector('i');
        window.updateWishlistIcon(icon, isSaved);
      });
    } catch (error) {
      console.error('상세페이지 찜 상태 동기화 실패:', error);
    }
  }

  window.addEventListener('saved-products-updated', syncProductSaveButtons);
});
