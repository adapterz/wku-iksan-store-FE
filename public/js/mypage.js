document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Not logged in, redirect to login page
                window.location.href = 'login.html';
            } else {
                console.error('Failed to fetch user info');
            }
            return;
        }

        const resData = await response.json();
        
        if (resData && resData.data) {
            const user = resData.data;
            const nicknameEl = document.getElementById('display-nickname');
            const useridEl = document.getElementById('display-userid');
            
            if (nicknameEl) nicknameEl.textContent = user.nickname || 'Unknown';
            if (useridEl) useridEl.textContent = user.userId;
        } else {
            console.error('No user data in response');
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
    }

    // Settings Overlay Logic
    const settingsBtn = document.querySelector('.icon-btn[aria-label="설정"]');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsCloseBtn = document.getElementById('btn-settings-close');

    if (settingsBtn && settingsOverlay && settingsCloseBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            settingsOverlay.classList.add('open');
        });

        settingsCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            settingsOverlay.classList.remove('open');
        });
    }

    // Search Overlay Logic
    const searchCloseBtn = document.getElementById('btn-search-close');
    const searchOverlayElement = document.getElementById('search-overlay');
    const searchInput = searchOverlayElement ? searchOverlayElement.querySelector('.search-overlay-input') : null;
    
    const shopBtn = Array.from(document.querySelectorAll('.bottom-nav .nav-item')).find(btn => {
        const textSpan = btn.querySelector('.nav-text');
        return textSpan && textSpan.textContent.trim() === 'SHOP';
    });

    if (shopBtn && searchOverlayElement) {
        shopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            searchOverlayElement.classList.add('show');
            searchOverlayElement.classList.add('open');
            if (searchInput) {
                setTimeout(() => searchInput.focus(), 50);
            }
        });
    }
    
    if (searchCloseBtn && searchOverlayElement) {
        searchCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            searchOverlayElement.classList.remove('show');
            searchOverlayElement.classList.remove('open');
        });
    }
    // Logout Logic
    const logoutBtn = document.querySelector('.settings-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            } catch (error) {
                console.error('로그아웃 요청 실패:', error);
            }
            window.location.href = 'login.html';
        });
    }

    // Unused Gifts Logic
    const unusedGiftsCountEl = document.getElementById('unused-gifts-count');
    const unusedGiftsListEl = document.getElementById('unused-gifts-list');

    const unusedGiftsFallbackHtml = (message) =>
        `<div style="padding: 20px; color: #999; font-size: 14px; flex: 0 0 100%; text-align: center;">${message}</div>`;

    function renderUnusedGiftsSkeleton() {
        unusedGiftsListEl.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const card = document.createElement('div');
            card.className = 'unused-gift-card skeleton-unused-gift';
            card.innerHTML = `
                <div class="skeleton skeleton-gift-img"></div>
                <div class="skeleton skeleton-line"></div>
            `;
            unusedGiftsListEl.appendChild(card);
        }
    }

    if (unusedGiftsCountEl && unusedGiftsListEl) {
        renderUnusedGiftsSkeleton();
        const settle = createSkeletonGuard(() => {
            unusedGiftsListEl.innerHTML = unusedGiftsFallbackHtml('미사용 선물을 불러오지 못했습니다.');
        }, 1500);

        try {
            const giftsResponse = await fetch('/api/gifts?status=unused', { credentials: 'include' });
            settle();
            if (giftsResponse.ok) {
                const giftsResult = await giftsResponse.json();
                const gifts = giftsResult.data || [];

                unusedGiftsCountEl.textContent = gifts.length;

                if (gifts.length === 0) {
                    unusedGiftsListEl.innerHTML = unusedGiftsFallbackHtml('미사용 선물이 없습니다.');
                } else {
                    unusedGiftsListEl.innerHTML = '';
                    gifts.forEach(gift => {
                        const senderText = gift.isSelfGift ? "나" : (gift.senderNickname || "친구");

                        const card = document.createElement('a');
                        card.className = 'unused-gift-card';
                        card.href = `giftuse.html?giftId=${gift.giftId}`;

                        card.innerHTML = `
                            <div class="unused-gift-img-wrapper">
                                <img src="${gift.thumbnailUrl || ''}" alt="상품 썸네일" class="unused-gift-img">
                            </div>
                            <div class="unused-gift-sender">${senderText}</div>
                        `;

                        unusedGiftsListEl.appendChild(card);
                    });
                }
            } else {
                console.error('Failed to load unused gifts');
                unusedGiftsListEl.innerHTML = unusedGiftsFallbackHtml('미사용 선물을 불러오지 못했습니다.');
            }
        } catch (error) {
            settle();
            console.error('Error fetching unused gifts:', error);
            unusedGiftsListEl.innerHTML = unusedGiftsFallbackHtml('미사용 선물을 불러오지 못했습니다.');
        }
    }

    // Unused gifts scroller: convert vertical wheel scroll to horizontal
    if (unusedGiftsListEl) {
        unusedGiftsListEl.addEventListener('wheel', (e) => {
            // 세로 스크롤량이 있을 때만 가로로 변환
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                unusedGiftsListEl.scrollLeft += e.deltaY;
            }
        }, { passive: false });
    }
});
