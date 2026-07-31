document.addEventListener('DOMContentLoaded', async () => {
    let cachedUserData = null;
    try {
        const resData = await requestJson('/api/auth/me');
        
        if (resData && resData.data) {
            const user = resData.data;
            cachedUserData = user;
            const nicknameEl = document.getElementById('display-nickname');
            const useridEl = document.getElementById('display-userid');
            
            if (nicknameEl) nicknameEl.textContent = user.nickname || 'Unknown';
            if (useridEl) useridEl.textContent = user.userId;
            
            // 데이터 로드 완료 후 화면 표시 (깜빡임 방지)
            document.body.style.visibility = 'visible';
            document.body.style.opacity = '1';
        } else {
            console.error('No user data in response');
            document.body.style.visibility = 'visible';
            document.body.style.opacity = '1';
        }
    } catch (error) {
        if (error.status === 401) {
            localStorage.removeItem('isLoggedIn');
            window.location.href = 'login.html';
            return;
        }
        console.error('Error fetching user data:', error);
        document.body.style.visibility = 'visible';
        document.body.style.opacity = '1';
    }

    // Settings Overlay Logic
    const settingsBtn = document.getElementById('btn-settings-open');
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


    // Logout Logic
    const logoutBtn = document.getElementById('btn-settings-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // 캐시 데이터 초기화 (보안 및 상태 일관성)
            cachedUserData = null;
            
            try {
                await requestJson('/api/auth/logout', { method: 'POST' });
            } catch (error) {
                console.error('로그아웃 요청 실패:', error);
            }
            localStorage.removeItem('isLoggedIn');
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

    // 1. DOM 요소 선택
    const historyCountAll = document.getElementById('history-count-all');
    const historyCountSelf = document.getElementById('history-count-self');
    const historyCountReceived = document.getElementById('history-count-received');
    const historyCountUsed = document.getElementById('history-count-used');

    if (unusedGiftsCountEl && unusedGiftsListEl) {
        renderUnusedGiftsSkeleton();
        const settle = createSkeletonGuard(() => {
            unusedGiftsListEl.innerHTML = unusedGiftsFallbackHtml('선물 데이터를 불러오지 못했습니다.');
        }, 1500);

        try {
            // 2. 전체 선물 목록 API 호출
            const allGiftsResult = await requestJson('/api/gifts');
            settle();
            const allGifts = allGiftsResult.data || [];

            // 3. 탭별 카운트 계산 및 갱신
            if (historyCountAll) historyCountAll.textContent = allGifts.length;
            if (historyCountSelf) historyCountSelf.textContent = allGifts.filter(g => g.isSelfGift).length;
            if (historyCountReceived) historyCountReceived.textContent = allGifts.filter(g => !g.isSelfGift).length;
            if (historyCountUsed) historyCountUsed.textContent = allGifts.filter(g => g.status === 'used').length;

            // 4. 미사용 선물 필터링 및 리스트 렌더링
            const unusedGifts = allGifts.filter(g => g.status === 'unused');
            unusedGiftsCountEl.textContent = unusedGifts.length;

            if (unusedGifts.length === 0) {
                unusedGiftsListEl.innerHTML = unusedGiftsFallbackHtml('미사용 선물이 없습니다.');
            } else {
                unusedGiftsListEl.innerHTML = '';
                unusedGifts.forEach(gift => {
                    const senderText = gift.isSelfGift ? "나" : (gift.senderNickname || "친구");

                    const card = document.createElement('a');
                    card.className = 'unused-gift-card';
                    card.href = `giftuse.html?giftId=${gift.giftId}`;

                    card.innerHTML = `
                        <div class="unused-gift-img-wrapper">
                            <img alt="상품 썸네일" class="unused-gift-img">
                        </div>
                        <div class="unused-gift-sender"></div>
                    `;
                    
                    const imgEl = card.querySelector('.unused-gift-img');
                    if (imgEl) imgEl.src = gift.thumbnailUrl || '';
                    const senderEl = card.querySelector('.unused-gift-sender');
                    if (senderEl) senderEl.textContent = senderText;

                    unusedGiftsListEl.appendChild(card);
                });
            }
        } catch (error) {
            settle();
            console.error('Error fetching gifts:', error);
            unusedGiftsListEl.innerHTML = unusedGiftsFallbackHtml('선물 데이터를 불러오지 못했습니다.');
            
            // 에러 발생 시 카운트를 0으로 기본값 처리
            if (historyCountAll) historyCountAll.textContent = '0';
            if (historyCountSelf) historyCountSelf.textContent = '0';
            if (historyCountReceived) historyCountReceived.textContent = '0';
            if (historyCountUsed) historyCountUsed.textContent = '0';
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

    // Policy Overlays Logic
    const policyConfig = [
        { btns: ['btn-policy-terms', 'btn-settings-policy-terms'], overlay: 'policy-terms-overlay', close: 'btn-close-terms' },
        { btns: ['btn-policy-penalty', 'btn-settings-policy-penalty'], overlay: 'policy-penalty-overlay', close: 'btn-close-penalty' },
        { btns: ['btn-policy-privacy', 'btn-settings-policy-privacy'], overlay: 'policy-privacy-overlay', close: 'btn-close-privacy' }
    ];

    policyConfig.forEach(({ btns, overlay, close }) => {
        const overlayEl = document.getElementById(overlay);
        const closeEl = document.getElementById(close);

        if (overlayEl && closeEl) {
            // 여러 개의 여는 버튼에 각각 이벤트 리스너 등록
            btns.forEach(btnId => {
                const btnEl = document.getElementById(btnId);
                if (btnEl) {
                    btnEl.addEventListener('click', (e) => {
                        e.preventDefault();
                        overlayEl.classList.add('open');
                    });
                }
            });

            // 닫는 버튼 이벤트 리스너 등록
            closeEl.addEventListener('click', (e) => {
                e.preventDefault();
                overlayEl.classList.remove('open');
            });
        }
    });

    // User Data Caching and Overlay Logic (Login Info & Profile Manage)

    async function ensureUserData() {
        if (!cachedUserData) {
            try {
                const result = await window.requestJson('/api/auth/me');
                cachedUserData = result.data;
            } catch (error) {
                if (error.status === 401 || error.code === 'UNAUTHORIZED') {
                    console.warn('마이페이지 오버레이: 비로그인 상태입니다.');
                    return null;
                }
                throw error;
            }
        }
        return cachedUserData;
    }

    function setupUserOverlay(btnId, overlayId, closeBtnId, onOpenCallback, redirectOnFail = false) {
        const btn = document.getElementById(btnId);
        const overlay = document.getElementById(overlayId);
        const closeBtn = document.getElementById(closeBtnId);
        
        if (btn && overlay && closeBtn) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                let userData = null;
                try {
                    userData = await ensureUserData();
                } catch (err) {
                    console.error('Failed to fetch user data:', err);
                }
                
                if (!userData) {
                    if (redirectOnFail) {
                        alert('로그인이 필요한 서비스입니다.');
                        location.href = 'login.html';
                    }
                    return; // 비로그인 시 오버레이 열지 않거나 조용히 리턴
                }
                
                if (onOpenCallback) onOpenCallback(userData);
                overlay.classList.add('open');
            });

            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                overlay.classList.remove('open');
            });
        }
    }

    // Bind Login Info Overlay (redirect on fail)
    setupUserOverlay('btn-settings-login-info', 'login-info-overlay', 'btn-close-login-info', (userData) => {
        const emailEl = document.getElementById('login-info-email');
        const nicknameEl = document.getElementById('login-info-nickname');
        if (emailEl) emailEl.textContent = userData.email || '';
        if (nicknameEl) nicknameEl.textContent = userData.nickname || '';
        // 패스워드는 HTML 상에 하드코딩된 ******** 그대로 사용
    }, true);

    // Bind Profile Manage Overlay (silent return on fail)
    setupUserOverlay('btn-profile-manage', 'profile-manage-overlay', 'btn-close-profile-manage', (userData) => {
        const manageNicknameEl = document.getElementById('manage-profile-nickname');
        if (manageNicknameEl) manageNicknameEl.textContent = userData.nickname || '이름 없음';
    }, false);

    // Profile Share Button Logic
    const btnProfileShare = document.getElementById('btn-profile-share');
    let toastTimer = null;

    if (btnProfileShare) {
        btnProfileShare.addEventListener('click', async (e) => {
            e.preventDefault();
            const urlToCopy = window.location.href;

            // 1. URL Copy Logic (with fallback)
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(urlToCopy);
                } else {
                    // Fallback for older browsers or non-secure contexts
                    const textArea = document.createElement('textarea');
                    textArea.value = urlToCopy;
                    // Move textarea out of viewport
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    
                    const successful = document.execCommand('copy');
                    document.body.removeChild(textArea);
                    
                    if (!successful) {
                        throw new Error('Fallback copy failed');
                    }
                }
            } catch (err) {
                console.error('Failed to copy URL:', err);
                alert('URL 복사에 실패했습니다.');
                return;
            }

            // 2. Toast Notification Logic
            let toastEl = document.getElementById('share-toast-notification');
            if (!toastEl) {
                toastEl = document.createElement('div');
                toastEl.id = 'share-toast-notification';
                toastEl.className = 'toast-notification';
                toastEl.textContent = '클립보드에 복사되었습니다!';
                document.body.appendChild(toastEl);
            }

            // Reset animation state
            toastEl.classList.remove('show');
            // Force reflow to restart transition
            void toastEl.offsetWidth;
            
            toastEl.classList.add('show');

            if (toastTimer) {
                clearTimeout(toastTimer);
            }

            toastTimer = setTimeout(() => {
                toastEl.classList.remove('show');
            }, 2000);
        });
    }
});
