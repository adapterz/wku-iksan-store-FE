// 로그인 여부 확인 (화면을 그리기 전에 먼저 검증 - Route Guard)
// 401은 api.js 전역 인터셉터가 처리(redirect 파라미터 포함 로그인 이동)하므로 여기선 그 외 오류만 다룬다.
async function checkGiftuseAuth() {
    try {
        const authResult = await requestJson('/api/auth/me');
        if (!authResult || !authResult.data) {
            return false;
        }
    } catch (error) {
        console.error("인증 확인 실패:", error);
        alert("사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        return false;
    }

    document.body.style.visibility = "visible";
    document.body.style.opacity = "1";
    return true;
}

document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkGiftuseAuth();
    if (!isAuthenticated) {
        return;
    }

    window.addEventListener('pageshow', async (event) => {
        if (event.persisted) {
            await checkGiftuseAuth();
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const giftId = urlParams.get('giftId');

    if (!giftId) {
        alert("잘못된 접근입니다.");
        location.href = 'giftbox.html';
        return;
    }

    const btnUse = document.getElementById('btn-use');
    const barcodeCard = document.getElementById('barcode-card');

    const settle = createSkeletonGuard(showLoadingDelayed, 1500);

    try {
        // 상세 조회 API 호출
        const result = await requestJson(`/api/gifts/${giftId}`);
        settle();
        renderGift(result.data);
    } catch (err) {
        // 상세 조회 실패 시 기존 목록 조회 fallback을 유지합니다.
        try {
            const result = await requestJson('/api/gifts?status=unused');
            settle();
            const gift = (result.data || []).find(g => String(g.giftId) === String(giftId));
            if (gift) {
                renderGift(gift);
            } else {
                showError('선물 정보를 찾을 수 없거나 이미 사용된 선물입니다.');
            }
        } catch (fallbackError) {
            settle();
            console.error(fallbackError);
            showError('선물 정보를 불러오는데 실패했습니다.');
        }
    }

    btnUse.addEventListener('click', async () => {
        if (!confirm("선물을 사용하시겠습니까? 사용 후에는 취소할 수 없습니다.")) return;

        try {
            btnUse.disabled = true;
            btnUse.textContent = "처리중...";

            await requestJson(`/api/gifts/${giftId}/use`, { method: 'PATCH' });

            alert("사용 처리가 완료되었습니다.");
            location.href = 'giftbox.html?tab=used';
            
        } catch (err) {
            console.error(err);
            alert("사용 처리에 실패했습니다. 서버 API 구현 여부를 확인해주세요.");
            btnUse.disabled = false;
            btnUse.textContent = "선물 사용하기";
        }
    });
});

function renderGift(gift) {
    if (gift.status === 'used') {
        alert("이미 사용 완료된 선물입니다.");
        location.href = 'giftbox.html?tab=used';
        return;
    }

    // 타임아웃으로 지연 안내가 떠 있었다면 해제하고 카드를 다시 노출
    const delayState = document.getElementById('giftuse-delay-state');
    const barcodeCard = document.getElementById('barcode-card');
    if (delayState) delayState.style.display = 'none';
    if (barcodeCard) barcodeCard.style.display = '';

    // 닉네임 / 나 배지 처리
    document.getElementById('receiver-nickname').textContent = gift.isSelfGift ? "나" : (gift.sender?.nickname || "친구");
    if (gift.isSelfGift) {
        document.getElementById('self-badge').style.display = 'block';
    } else {
        document.getElementById('self-badge').style.display = 'none';
    }

    // DOM 요소
    const productImgWrapper = document.getElementById('product-img-wrapper');
    const productImg = document.getElementById('product-img');
    const productBrand = document.getElementById('product-brand');
    const productName = document.getElementById('product-name');
    const barcodeSection = document.getElementById('barcode-section');
    const barcodeSkeleton = document.getElementById('barcode-skeleton');
    const btnUse = document.getElementById('btn-use');

    // 이미지 세팅
    productImg.src = gift.thumbnailUrl || '';

    // 브랜드명 / 상품명 바인딩 및 스켈레톤 해제
    productBrand.textContent = gift.brand || '';
    productBrand.classList.remove('skeleton');
    productBrand.style.minWidth = 'unset';
    productBrand.style.minHeight = 'unset';

    productName.textContent = gift.productName || '';
    productName.classList.remove('skeleton');
    productName.style.minWidth = 'unset';
    productName.style.minHeight = 'unset';

    // 바코드 노출 및 스켈레톤 해제
    const barcodeVal = gift.barcode || "2350978230953538";
    const formatted = barcodeVal.replace(/(\d{4})(?=\d)/g, '$1 ');
    document.getElementById('barcode-text').textContent = formatted;

    barcodeSkeleton.style.display = 'none';
    barcodeSection.style.display = 'flex';

    // 버튼 활성화
    btnUse.disabled = false;
}

// 최대 노출 시간 초과: 아직 응답 대기 중이므로 카드를 잠시 숨기고 지연 안내로 전환
// (응답이 이후 도착하면 renderGift/showError가 카드를 되돌려 놓음)
function showLoadingDelayed() {
    const barcodeCard = document.getElementById('barcode-card');
    const delayState = document.getElementById('giftuse-delay-state');
    if (barcodeCard) barcodeCard.style.display = 'none';
    if (delayState) delayState.style.display = 'flex';
}

function showError(message) {
    const barcodeCard = document.getElementById('barcode-card');
    const delayState = document.getElementById('giftuse-delay-state');
    if (delayState) delayState.style.display = 'none';
    if (barcodeCard) barcodeCard.style.display = '';

    // 카드 내부를 에러 전용 레이아웃으로 교체
    barcodeCard.innerHTML = `
        <div style="font-size: 40px; color: #ff4d4f; margin-bottom: 16px;">
            <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div class="error-message">${message}</div>
        <button onclick="location.href='giftbox.html'" class="btn-use" style="margin-top: 10px;">선물함으로 돌아가기</button>
    `;

    document.getElementById('receiver-nickname').textContent = '오류';
}


