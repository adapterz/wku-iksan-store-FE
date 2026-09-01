document.addEventListener('DOMContentLoaded', async () => {
    // 인증 확인 및 사용자 정보 로드. 성공 시 true, 실패(리다이렉트 처리됨) 시 false를 반환한다.
    // 렌더링 차단을 보장하기 위해 이 함수가 true를 반환하기 전까지 화면 표시/데이터 조회 로직은 실행되지 않아야 한다.
    async function checkAuthAndLoadUserData() {
        try {
            const resData = await requestJson('/api/auth/me');

            // requestJson은 401 발생 시 전역 인터셉터가 로그인 페이지로 이동시키고 undefined를 반환한다.
            if (!resData || !resData.data) {
                return false;
            }

            const user = resData.data;
            const nicknameEl = document.getElementById('display-nickname');
            const useridEl = document.getElementById('display-userid');

            if (nicknameEl) nicknameEl.textContent = user.nickname || 'Unknown';
            if (useridEl) useridEl.textContent = user.userId;

            // 데이터 로드 완료 후 화면 표시 (깜빡임 방지)
            document.body.style.visibility = 'visible';
            document.body.style.opacity = '1';
            return true;
        } catch (error) {
            // 401은 api.js 전역 인터셉터가 처리(redirect 파라미터 포함 로그인 이동)하므로 여기선 그 외 오류(네트워크 장애 등)만 다룬다.
            // 데이터 없는 화면이 노출되지 않도록 hidden 상태를 유지한 채 렌더링을 중단하고 사용자에게 안내한다.
            console.error('Error fetching user data:', error);
            alert('사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
            return false;
        }
    }

    const isAuthenticated = await checkAuthAndLoadUserData();
    if (!isAuthenticated) {
        return;
    }

    window.addEventListener('pageshow', async (event) => {
        if (event.persisted) {
            document.body.style.visibility = 'hidden';
            document.body.style.opacity = '0';
            await checkAuthAndLoadUserData();
        }
    });

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

            try {
                await requestJson('/api/auth/logout', { method: 'POST' });
            } catch (error) {
                console.error('로그아웃 요청 실패:', error);
            }
            localStorage.removeItem('isLoggedIn');
            window._wishlistCache = null;
            window._wishlistFetchPromise = null;
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

});
