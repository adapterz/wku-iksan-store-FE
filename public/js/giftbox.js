document.addEventListener("header:ready", () => {



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
      const result = await requestJson(`/api/gifts?status=${status}`);
      settle();
      renderGiftList(result.data || []);
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
      listContainer.appendChild(card);
    });
  };

  // Tab Events
  tabUnused.addEventListener('click', () => loadGifts('unused'));
  tabUsed.addEventListener('click', () => loadGifts('used'));

  // Init
  loadGifts(currentStatus);




});


