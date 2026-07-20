document.addEventListener("DOMContentLoaded", () => {
  // 뒤로가기 버튼 로직
  const backBtn = document.getElementById('btn-back');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.history.length > 1 && document.referrer) {
        window.history.back();
      } else {
        window.location.href = 'index.html';
      }
    });
  }

  // 검색 오버레이 열기/닫기 로직
  const searchOpenBtn = document.getElementById('btn-search-open');
  const searchCloseBtn = document.getElementById('btn-search-close');
  const searchOverlay = document.getElementById('search-overlay');
  
  if (searchOpenBtn && searchOverlay) {
    searchOpenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      searchOverlay.classList.add('show');
    });
  }
  
  if (searchCloseBtn && searchOverlay) {
    searchCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      searchOverlay.classList.remove('show');
    });
  }

  const tabUnused = document.getElementById("tab-unused");
  const tabUsed = document.getElementById("tab-used");
  const listContainer = document.getElementById("gift-list-container");

  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') === 'used' ? 'used' : 'unused';
  let currentStatus = initialTab;

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
      const response = await fetch(`/api/gifts?status=${status}`, { credentials: 'include' });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          settle();
          alert("로그인이 필요합니다.");
          location.href = "login.html";
          return;
        }
        throw new Error("Failed to load gifts");
      }

      const result = await response.json();
      settle();
      renderGiftList(result.data || []);
    } catch (error) {
      settle();
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

      card.innerHTML = `
        <div class="gift-img-wrapper">
          <img src="${gift.thumbnailUrl || ''}" alt="상품 썸네일" class="gift-img">
          ${isUsed ? '<div class="used-overlay">사용완료</div>' : ''}
        </div>
        <div class="gift-info">
          <div class="gift-brand">${gift.brand || ''}</div>
          <div class="gift-name">${gift.productName || ''}</div>
          <div class="gift-sender-info">
            <span>보낸사람: ${senderText}</span>
            <span class="gift-date">${dateText}</span>
          </div>
        </div>
      `;
      listContainer.appendChild(card);
    });
  };

  // Tab Events
  tabUnused.addEventListener('click', () => loadGifts('unused'));
  tabUsed.addEventListener('click', () => loadGifts('used'));

  // Init
  loadGifts(currentStatus);
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