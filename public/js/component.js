// 확장자 없는 주소와 기존 .html 링크를 같은 페이지로 판별한다.
function getPageFile(pathname) {
    const filename = pathname.split(/[?#]/, 1)[0].split('/').pop();
    if (!filename) return 'index.html';
    return filename.endsWith('.html') ? filename : `${filename}.html`;
}

// 전체화면 검색 모달 공통 HTML 반환 함수
function getSearchOverlayHTML() {
    return `
<div id="search-overlay" class="search-overlay">
    <div class="search-overlay-header">
        <button id="btn-search-close" class="btn-search-back" aria-label="뒤로가기">
            <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div class="search-input-wrapper">
            <i class="fa-solid fa-magnifying-glass search-overlay-input-icon"></i>
            <input type="text" class="search-overlay-input" placeholder="원하는 선물을 검색해보세요" autofocus>
        </div>
    </div>
    <div class="search-overlay-body">
        <h4 class="recent-searches-title">최근 검색어</h4>
        <div class="recent-keywords-list"></div>
    </div>
</div>`;
}

// 검색 모달 동적 삽입 (가장 먼저 실행되어야 DOMContentLoaded에서 다른 스크립트들이 찾을 수 있음)
if (document.body && !document.getElementById('search-overlay')) {
    document.body.insertAdjacentHTML('beforeend', getSearchOverlayHTML());
}

// ===== 선물 도착 알림 모달 =====
// 로그인 상태로 확인될 때마다(auth:updated) 확인 안 한 선물이 있는지 체크해서 모달로 안내한다.
// BE 이슈 #101 계약 기준: GET /api/gifts/unnotified → { count, giftIds }, PATCH /api/gifts/notify.
function getGiftArrivalModalHTML() {
    return `
<div id="gift-arrival-modal" class="gift-arrival-modal">
    <div class="gift-arrival-modal-content">
        <div class="gift-arrival-modal-icon"><i class="fa-solid fa-gift"></i></div>
        <p class="gift-arrival-modal-text">새로운 선물이 <strong id="gift-arrival-count">0</strong>개 도착했어요!</p>
        <div class="gift-arrival-modal-actions">
            <button type="button" id="btn-gift-arrival-confirm" class="btn-gift-arrival-confirm">확인</button>
            <button type="button" id="btn-gift-arrival-giftbox" class="btn-gift-arrival-giftbox">선물함으로 가기</button>
        </div>
    </div>
</div>`;
}

if (document.body && !document.getElementById('gift-arrival-modal')) {
    document.body.insertAdjacentHTML('beforeend', getGiftArrivalModalHTML());
}

// 모달에 안내했던 선물 ID를 확인 처리 시점까지 들고 있는다. 조회 응답에 포함된 ID만
// 확인 처리 요청에 실어 보내므로, 모달이 열려있는 동안 새로 도착한 선물(이번 조회 대상이
// 아니었던 것)이 실수로 함께 확인 처리되지 않는다.
let pendingGiftArrivalIds = [];

window.showGiftArrivalModal = function(count, giftIds) {
    pendingGiftArrivalIds = giftIds;
    const modal = document.getElementById('gift-arrival-modal');
    const countEl = document.getElementById('gift-arrival-count');
    if (countEl) countEl.textContent = count;
    if (modal) modal.classList.add('open');
};

// 확인 안 한 선물이 있는지 조회. auth:updated에서 isLoggedIn일 때만 호출되므로 비로그인
// 사용자에게는 이 요청 자체가 나가지 않는다. 알림은 페이지의 핵심 기능이 아니므로,
// 조회 실패(BE 미구현 포함) 시에도 다른 기능을 막지 않도록 로그만 남기고 조용히 넘어간다.
async function checkGiftArrival() {
    try {
        const result = await requestJson('/api/gifts/unnotified', { silent401: true });
        const { count, giftIds } = result?.data || {};
        if (count > 0 && Array.isArray(giftIds) && giftIds.length > 0) {
            window.showGiftArrivalModal(count, giftIds);
        }
    } catch (error) {
        console.error('선물 도착 알림 확인 실패:', error);
    }
}

document.addEventListener('auth:updated', (e) => {
    const { isLoggedIn } = e.detail || {};
    if (isLoggedIn) checkGiftArrival();
});

// 확인 처리 API 호출. pendingGiftArrivalIds(모달에 실제로 안내됐던 ID)만 넘긴다.
// 반환값을 boolean이 아니라 3가지 상태로 구분한다(PR #75 리뷰 반영).
// - 'success': 실제로 서버에 반영됨
// - 'auth-required': 세션 만료(401). requestJson이 silent401 미지정 시 예외를 던지지
//   않고 로그인 페이지 이동만 예약한 뒤 undefined를 반환하므로, 이 경우를 성공으로
//   오인해 pendingGiftArrivalIds를 비우면 안 된다(서버엔 반영된 적이 없음).
// - 'failed': 그 외 실패(네트워크 오류 등). 재시도 가능하도록 상태를 그대로 유지한다.
async function notifyGiftArrivalSeen() {
    if (!pendingGiftArrivalIds.length) return 'success';
    let result;
    try {
        result = await requestJson('/api/gifts/notify', {
            method: 'PATCH',
            body: { giftIds: pendingGiftArrivalIds }
        });
    } catch (error) {
        console.error('선물 도착 확인 처리 실패:', error);
        return 'failed';
    }
    if (result === undefined) {
        return 'auth-required';
    }
    pendingGiftArrivalIds = [];
    return 'success';
}

(function bindGiftArrivalModalButtons() {
    const modal = document.getElementById('gift-arrival-modal');
    const confirmBtn = document.getElementById('btn-gift-arrival-confirm');
    const giftboxBtn = document.getElementById('btn-gift-arrival-giftbox');

    // 'auth-required'는 requestJson이 이미 로그인 페이지로 이동을 예약해둔 상태라
    // 여기서 별도로 alert를 띄우거나 모달을 건드리지 않는다(중복 안내 방지).
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            const status = await notifyGiftArrivalSeen();
            confirmBtn.disabled = false;
            if (status === 'success') {
                if (modal) modal.classList.remove('open');
            } else if (status === 'failed') {
                alert('확인 처리에 실패했습니다. 다시 시도해주세요.');
            }
        });
    }

    if (giftboxBtn) {
        giftboxBtn.addEventListener('click', async () => {
            giftboxBtn.disabled = true;
            const status = await notifyGiftArrivalSeen();
            giftboxBtn.disabled = false;
            if (status === 'success') {
                window.location.href = 'giftbox.html';
            } else if (status === 'failed') {
                alert('확인 처리에 실패했습니다. 다시 시도해주세요.');
            }
        });
    }
})();

// 검색어를 받아 검색 결과 페이지로 이동하는 공통 유틸리티 (빈 값은 무시)
function navigateToSearch(keyword) {
    const trimmed = (keyword || '').trim();
    if (!trimmed) return;
    window.location.href = `search.html?keyword=${encodeURIComponent(trimmed)}`;
}

// 하단 네비게이션의 로그인 링크(redirect 파라미터)를 현재 window.location.href 기준으로 다시 계산한다.
// history.pushState로 URL만 바뀌는 화면(search.js의 재검색 등)은 페이지가 새로 로드되지 않아
// checkGlobalAuthStatus가 다시 실행되지 않으므로, 그런 화면에서 URL이 바뀔 때마다 직접 호출해야 한다.
window.refreshBottomNavLoginLink = function() {
    const myBtn = document.getElementById('btn-bottom-my');
    if (!myBtn) return;
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (!isLoggedIn) {
        myBtn.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
    }
};

// 뒤로가기/앞으로가기로 페이지가 bfcache에서 복원될 때(pageshow, persisted) 인증·데이터를
// 재검증하는 공통 헬퍼. head의 인라인 스크립트가 bfcache 복원 시 body를 다시 숨겨두므로,
// checkFn이 재실행되어 다시 보여주지 않으면 흰 화면으로 남는다.
// checkFn은 성공 시 화면을 다시 보이게 하고 true를, 실패 시(알림/리다이렉트를 직접 처리하고) false를 반환해야 한다.
// 최초 실행이 실패하면 재검증 리스너를 등록하지 않는다.
async function registerBfcacheRevalidation(checkFn) {
    const isReady = await checkFn();
    if (!isReady) {
        return false;
    }

    window.addEventListener('pageshow', async (event) => {
        if (event.persisted) {
            await checkFn();
        }
    });

    return true;
}
window.registerBfcacheRevalidation = registerBfcacheRevalidation;

// 헤더의 #btn-back 뒤로가기 버튼 공통 이벤트 바인딩 (히스토리가 없으면 홈으로 이동)
function bindHeaderBackButton() {
    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
        btnBack.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'index.html';
            }
        });
    }
}

// 서브 헤더에 페이지 제목만 필요한 화면(category.js/brand.js/profile.js 등) 공통 헬퍼.
// header:ready 이후 우측 검색·홈 아이콘을 지우고 그 자리에 제목을 넣는다.
window.setSubHeaderTitle = function(titleText) {
    document.addEventListener('header:ready', () => {
        const headerContainer = document.querySelector('header.main-header .header-container');
        const rightIcons = document.querySelector('header.main-header .header-right-icons');
        if (rightIcons) rightIcons.remove();

        if (headerContainer) {
            const title = document.createElement('h1');
            title.className = 'header-title';
            title.textContent = titleText;
            headerContainer.appendChild(title);
        }
    });
};

// signup.js/profile.js가 각자 들고 있던 동일한 폼 에러 표시/초기화 로직의 공통 버전.
// login.js는 component.js 자체를 로드하지 않아(자체 커스텀 헤더를 직접 관리) 대상에서 제외했다 —
// component.js를 추가하면 index/mypage/search 외 모든 페이지에 자동 주입되는 공통 서브헤더 로직이
// login.html의 커스텀 헤더(#btn-home)를 덮어써 버리기 때문에, 그 쪽은 로컬 구현을 그대로 둔다.
// focusElement가 있으면 그 input이 속한 .form-group 안의 .auth-error에 인라인으로 표시하고,
// 없으면 globalErrorEl(폼 전역 에러 문구)에 표시한다.
window.showFieldError = function(globalErrorEl, message, focusElement = null) {
    if (focusElement) {
        const parentGroup = focusElement.closest('.form-group');
        const inlineErrorEl = parentGroup ? parentGroup.querySelector('.auth-error') : null;
        if (inlineErrorEl) {
            if (inlineErrorEl.textContent !== message) {
                inlineErrorEl.textContent = message;
            }
            inlineErrorEl.hidden = false;
            inlineErrorEl.setAttribute('aria-live', 'polite');
        }
        focusElement.setAttribute('aria-invalid', 'true');
        if (document.activeElement !== focusElement) {
            focusElement.focus();
        }
    } else if (globalErrorEl) {
        if (globalErrorEl.textContent !== message) {
            globalErrorEl.textContent = message;
        }
        globalErrorEl.hidden = false;
        globalErrorEl.setAttribute('aria-live', 'polite');
    }
};

// form 안 모든 input의 에러 상태(aria-invalid, 인라인 .auth-error)와 전역 에러 요소를 초기화한다.
window.clearFieldErrors = function(form, globalErrorEl) {
    if (globalErrorEl) {
        globalErrorEl.hidden = true;
        globalErrorEl.textContent = '';
    }
    if (!form) return;
    Array.from(form.querySelectorAll('input')).forEach((input) => {
        input.removeAttribute('aria-invalid');
        const parentGroup = input.closest('.form-group');
        const inlineErrorEl = parentGroup ? parentGroup.querySelector('.auth-error') : null;
        if (inlineErrorEl) {
            inlineErrorEl.hidden = true;
            inlineErrorEl.textContent = '';
        }
    });
};

// signup.js/profile.js가 거의 동일하게 들고 있던 인증 관련 에러 코드 메시지의 공통 버전.
// (login.js는 위와 같은 이유로 대상에서 제외)
window.ERROR_MESSAGES = Object.freeze({
    // 닉네임 오류
    REQUIRED_NICKNAME: '닉네임을 입력해 주세요.',
    INVALID_NICKNAME_TYPE: '닉네임 입력값을 확인해주세요',
    INVALID_NICKNAME_FORMAT: '한글·영문·숫자만 사용할 수 있습니다.',
    NICKNAME_TOO_SHORT: '닉네임은 2자 이상 입력해 주세요.',
    NICKNAME_TOO_LONG: '닉네임은 8자 이하로 입력해 주세요',
    NICKNAME_ALREADY_EXISTS: '이미 사용 중인 닉네임입니다.',
    // 이메일 오류
    REQUIRED_EMAIL: '이메일을 입력해 주세요.',
    INVALID_EMAIL_TYPE: '이메일 입력값을 확인해 주세요.',
    INVALID_EMAIL_FORMAT: '이메일 형식을 확인해 주세요',
    EMAIL_TOO_LONG: '이메일이 너무 깁니다.',
    EMAIL_ALREADY_EXISTS: '이미 가입된 이메일 입니다.',
    // 비밀번호 오류
    REQUIRED_PASSWORD: '비밀번호를 입력해 주세요.',
    INVALID_PASSWORD_TYPE: '비밀번호 입력값을 확인해주세요.',
    INVALID_PASSWORD_FORMAT: '비밀번호에는 공백을 사용할 수 없습니다.',
    PASSWORD_TOO_SHORT: '비밀번호는 8자 이상 입력해 주세요',
    PASSWORD_TOO_LONG: '비밀번호는 15자 이하로 입력해주세요',
    COMMON_PASSWORD: '다른 비밀번호를 사용해 주세요.',
    INVALID_PASSWORD: '비밀번호가 일치하지 않습니다.',
    // 계정 삭제 오류
    ACCOUNT_HAS_UNUSED_GIFTS: '미사용 선물이 남아있어 계정을 삭제할 수 없습니다.',
    // BE PR #103(adapterz/wku-iksan-store-BE): 활성 정지 중인 회원이 탈퇴로 제재를 회피하지 못하도록
    // 계정 삭제 자체를 막는다(403). 재시도로 해결되는 문제가 아니므로 이유를 명시해서 안내한다.
    ACCOUNT_HAS_ACTIVE_SANCTION: '이용 정지 중에는 계정을 삭제할 수 없습니다.',
    // 공통 오류
    UNAUTHORIZED: '로그인이 필요합니다.',
    NETWORK_ERROR: '네트워크 연결을 확인해 주세요.',
    INVALID_JSON_RESPONSE: '서버 응답을 처리할 수 없습니다.',
    INTERNAL_SERVER_ERROR: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
});

// signup.js/profile.js가 각각 들고 있던 닉네임/이메일/(새) 비밀번호 유효성 검사 규칙의 공통 버전.
// 모두 { isValid, message?, element? } 형태로 반환한다.
window.validateNicknameValue = function(nickname, nicknameInput) {
    if (!nickname) {
        return { isValid: false, message: window.ERROR_MESSAGES.REQUIRED_NICKNAME, element: nicknameInput };
    }
    if (/\s/.test(nickname)) {
        return { isValid: false, message: window.ERROR_MESSAGES.INVALID_NICKNAME_FORMAT, element: nicknameInput };
    }
    if (nickname.length < 2) {
        return { isValid: false, message: window.ERROR_MESSAGES.NICKNAME_TOO_SHORT, element: nicknameInput };
    }
    if (nickname.length > 8) {
        return { isValid: false, message: window.ERROR_MESSAGES.NICKNAME_TOO_LONG, element: nicknameInput };
    }
    if (!/^[가-힣a-zA-Z0-9]+$/.test(nickname)) {
        return { isValid: false, message: window.ERROR_MESSAGES.INVALID_NICKNAME_FORMAT, element: nicknameInput };
    }
    return { isValid: true };
};

window.validateEmailValue = function(email, emailInput) {
    if (!email) {
        return { isValid: false, message: window.ERROR_MESSAGES.REQUIRED_EMAIL, element: emailInput };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { isValid: false, message: window.ERROR_MESSAGES.INVALID_EMAIL_FORMAT, element: emailInput };
    }
    if (email.length > 255) {
        return { isValid: false, message: window.ERROR_MESSAGES.EMAIL_TOO_LONG, element: emailInput };
    }
    return { isValid: true };
};

window.validateNewPasswordValue = function(password, passwordInput) {
    if (!password) {
        return { isValid: false, message: window.ERROR_MESSAGES.REQUIRED_PASSWORD, element: passwordInput };
    }
    if (/\s/.test(password)) {
        return { isValid: false, message: window.ERROR_MESSAGES.INVALID_PASSWORD_FORMAT, element: passwordInput };
    }
    if (password.length < 8) {
        return { isValid: false, message: window.ERROR_MESSAGES.PASSWORD_TOO_SHORT, element: passwordInput };
    }
    if (password.length > 15) {
        return { isValid: false, message: window.ERROR_MESSAGES.PASSWORD_TOO_LONG, element: passwordInput };
    }
    return { isValid: true };
};

// 비밀번호 강도 판정만 담당하는 순수 함수(DOM 미접촉). signup.js는 빈 값일 때 즉시 "필수" 인라인
// 에러를 띄우고, profile.js는 조용히 지우기만 하는 등 화면별로 실제 표시 방식이 달라서, 그 부분은
// 호출부가 반환값(level/reason)을 보고 각자 처리하고 여기서는 판정 로직만 공유한다.
window.getPasswordStrength = function(value, { minLength = 8, maxLength = 15 } = {}) {
    if (!value) {
        return { level: 'empty' };
    }
    if (/\s/.test(value)) {
        return { level: 'invalid', reason: 'whitespace' };
    }
    if (value.length < minLength) {
        return { level: 'invalid', reason: 'tooShort' };
    }
    if (value.length > maxLength) {
        return { level: 'invalid', reason: 'tooLong' };
    }

    const hasLetter = /[a-zA-Z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSpecial = /[^a-zA-Z0-9\s]/.test(value);
    const typesCount = [hasLetter, hasNumber, hasSpecial].filter(Boolean).length;

    if (typesCount <= 1) return { level: 'weak' };
    if (typesCount === 2) return { level: 'medium' };
    return { level: 'strong' };
};

// 로그아웃(mypage.js)과 계정 삭제(profile.js)가 공통으로 수행하던 클라이언트 측 로그인 흔적 정리.
// 서버 세션 종료(로그아웃 API 호출 등)는 호출부 책임이고, 이 함수는 클라이언트에 남는 상태만 지운다.
window.clearClientSession = function() {
    localStorage.removeItem('isLoggedIn');
    window._wishlistCache = null;
    window._wishlistFetchPromise = null;
};

// 검색 결과 페이지(search.html) 전용 헤더 HTML 반환 함수
// index.html의 회색 검색 인라인 박스(.header-search-box)를 재사용하되, 오버레이 대신
// 이 자리에서 바로 입력·재검색할 수 있도록 실제 <input>으로 구성한다.
function getSearchHeaderHTML(keyword) {
    const escapedKeyword = (keyword || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `
    <div class="header-container">
        <a href="#" id="btn-back" class="header-icon" title="뒤로가기">
            <i class="fa-solid fa-arrow-left"></i>
        </a>
        <div class="header-search-box search-header-box">
            <input type="text" id="search-page-input" class="header-search-text has-keyword" value="${escapedKeyword}" placeholder="브랜드, 상품, 프로필, 태그 등">
            <div class="header-search-icon" id="search-page-submit" style="cursor: pointer;">
                <i class="fa-solid fa-magnifying-glass"></i>
            </div>
        </div>
        <div class="header-right-icons">
            <a href="giftbox.html" class="header-icon" title="선물함">
                <i class="fa-solid fa-gift"></i>
            </a>
        </div>
    </div>`;
}

// search.html에서 header:ready 이후 호출하여 검색 전용 헤더를 그려주는 공통 함수
// 오버레이를 열지 않고, 헤더의 검색창에서 바로 입력해 재검색할 수 있도록 바인딩한다.
window.renderSearchHeader = function(keyword) {
    const headerElement = document.querySelector('header.main-header');
    if (!headerElement) return;
    headerElement.innerHTML = getSearchHeaderHTML(keyword);
    bindHeaderBackButton();

    const searchPageInput = document.getElementById('search-page-input');
    const searchPageSubmit = document.getElementById('search-page-submit');

    // search.html 안에서의 재검색은 페이지 새로고침 없이 처리하기 위해
    // search.js가 등록한 콜백(window.onSearchPageKeywordSubmit)에 위임한다.
    // 콜백이 없는 경우(비정상 진입 등)에는 기존처럼 페이지 이동으로 대체한다.
    function submitPageSearch() {
        if (!searchPageInput) return;
        const trimmed = searchPageInput.value.trim();
        if (!trimmed) return;
        // 여기는 pushState만 쓰고 페이지를 새로 로드하지 않아서(위 주석 참고), blur()를 명시적으로
        // 호출하지 않으면 모바일 가상 키보드가 계속 떠 있는다.
        searchPageInput.blur();
        if (typeof window.onSearchPageKeywordSubmit === 'function') {
            window.onSearchPageKeywordSubmit(trimmed);
        } else {
            navigateToSearch(trimmed);
        }
    }

    if (searchPageInput) {
        searchPageInput.addEventListener('keydown', (e) => {
            // isComposing 체크 없이 Enter를 바로 가로채면, 한글 등 조합형 입력 중 키보드의
            // "이동" 키를 눌렀을 때(조합 커밋용 keydown) IME의 자체 제출 처리와 충돌해
            // 가상 키보드가 안 내려가는 기기가 있다(삼성 키보드에서 확인됨).
            if (e.key === 'Enter' && !e.isComposing) {
                e.preventDefault();
                submitPageSearch();
            }
        });
    }

    if (searchPageSubmit) {
        searchPageSubmit.addEventListener('click', submitPageSearch);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // 서브 페이지 공통 헤더 HTML 반환 함수
    function getSubHeaderHTML() {
        return `
        <div class="header-container" style="justify-content: space-between;">
            <a href="#" id="btn-back" class="header-icon" title="뒤로가기">
                <i class="fa-solid fa-arrow-left"></i>
            </a>
            <div class="header-right-icons" style="gap: 16px;">
                <a href="#" id="btn-search-open" class="header-icon" title="검색">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </a>
                <a href="index.html" class="header-icon" title="홈">
                    <i class="fa-solid fa-house"></i>
                </a>
            </div>
        </div>`;
    }

    // 메인(index.html) 및 마이페이지(mypage.html) 제외 서브 페이지 헤더 동적 삽입
    const currentFile = getPageFile(window.location.pathname);

    // search.html은 검색 인라인 박스가 포함된 전용 헤더(window.renderSearchHeader)를 사용하므로 공통 헤더 자동 삽입에서 제외
    if (currentFile !== 'index.html' && currentFile !== 'mypage.html' && currentFile !== 'search.html') {
        const headerElement = document.querySelector('header.main-header');
        if (headerElement) {
            headerElement.innerHTML = getSubHeaderHTML();
            document.dispatchEvent(new Event('header:ready'));
            bindHeaderBackButton();
        }
    }

    // 하단 네비게이션 바 공통 HTML 반환 함수
    function getBottomNavHTML() {
        const isPresumedLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        const userIconClass = isPresumedLoggedIn ? "fa-solid fa-user logged-in" : "fa-regular fa-user";
        const dotHidden = isPresumedLoggedIn ? "" : "hidden";
        const textStr = isPresumedLoggedIn ? "마이" : "로그인";
        const myHref = isPresumedLoggedIn ? "mypage.html" : "login.html";

        return `
        <a href="index.html" class="nav-item">
            <i class="fa-solid fa-house"></i>
            <span class="nav-text">홈</span>
        </a>
        <a href="#" class="nav-item">
            <i class="fa-solid fa-magnifying-glass"></i>
            <span class="nav-text">검색</span>
        </a>
        <a href="wishlist.html" class="nav-item" data-icon-active="fa-solid fa-bookmark" data-icon-inactive="fa-regular fa-bookmark">
            <i class="fa-regular fa-bookmark"></i>
            <span class="nav-text">찜</span>
        </a>
        <a href="${myHref}" id="btn-bottom-my" class="nav-item">
            <div class="login-status-icon-wrapper">
                <i id="bottom-login-status-icon" class="${userIconClass}"></i>
                <span id="bottom-login-status-dot" class="login-status-dot" ${dotHidden}></span>
            </div>
            <span id="bottom-login-status-text" class="nav-text">${textStr}</span>
        </a>`;
    }

    // 하단 네비게이션 바 동적 삽입 (예외 페이지 제외)
    const bottomNavElements = document.querySelectorAll('nav.bottom-nav:not(.product-bottom-nav)');
    bottomNavElements.forEach(nav => {
        nav.innerHTML = getBottomNavHTML();
    });

    // 전역 인증 상태 체크 및 하단 네비게이션 업데이트
    async function checkGlobalAuthStatus() {
        let isLoggedIn = false;
        let nickname = '';
        try {
            // requestJson이 전역(api.js)에 선언되어 있다고 가정
            // silent401: 로그인 여부만 조용히 확인하는 배경 호출이므로 전역 401 리다이렉트를 건너뛴다.
            if (typeof requestJson === 'function') {
                const result = await requestJson('/api/auth/me', { silent401: true });
                isLoggedIn = true;
                nickname = result.data?.nickname || '';
            }
        } catch (error) {
            isLoggedIn = false;
        }

        const myBtn = document.getElementById('btn-bottom-my');
        const myIcon = document.getElementById('bottom-login-status-icon');
        const myDot = document.getElementById('bottom-login-status-dot');
        const myText = document.getElementById('bottom-login-status-text');

        if (myBtn) {
            if (isLoggedIn) {
                localStorage.setItem('isLoggedIn', 'true');
                myBtn.href = 'mypage.html';
                if (myIcon) {
                    myIcon.className = 'fa-solid fa-user logged-in';
                }
                if (myDot) myDot.hidden = false;
                if (myText) myText.textContent = '마이';
            } else {
                localStorage.removeItem('isLoggedIn');
                window._wishlistCache = null;
                window._wishlistFetchPromise = null;
                window.refreshBottomNavLoginLink();
                if (myIcon) {
                    myIcon.className = 'fa-regular fa-user';
                }
                if (myDot) myDot.hidden = true;
                if (myText) myText.textContent = '로그인';
            }
            updateActiveStates();
        }

        // 인증 정보를 필요한 곳(home.js 등)에서 사용할 수 있도록 커스텀 이벤트 디스패치
        document.dispatchEvent(new CustomEvent('auth:updated', { detail: { isLoggedIn, nickname } }));
    }

    checkGlobalAuthStatus();

    function updateActiveStates() {
        const navItems = document.querySelectorAll('.bottom-nav .nav-item, .nav-bar .nav-item');
        if (navItems.length === 0) return;

        const currentFile = getPageFile(window.location.pathname);

        navItems.forEach(item => {
            let href = item.getAttribute('href');
            if (!href || href === '#') {
                item.classList.remove('active');
                return;
            }

            const hrefFile = getPageFile(href);

            const isActive = currentFile === hrefFile;
            item.classList.toggle('active', isActive);

            // data-icon-active/data-icon-inactive가 지정된 nav 아이템은 현재 페이지 여부에 따라
            // 아이콘 클래스(fa-regular ↔ fa-solid 등)를 전환한다 (예: 위시리스트의 빈/채워진 북마크).
            const activeIconClass = item.dataset.iconActive;
            const inactiveIconClass = item.dataset.iconInactive;
            if (activeIconClass && inactiveIconClass) {
                const icon = item.querySelector('i');
                if (icon) {
                    icon.className = isActive ? activeIconClass : inactiveIconClass;
                }
            }
        });
    }

    function initNavGroup(selector) {
        const navItems = document.querySelectorAll(selector);
        if (navItems.length === 0) return;

        navItems.forEach(item => {
            // Handle click for placeholder links so they feel responsive
            item.addEventListener('click', (e) => {
                let href = item.getAttribute('href');
                if (!href || href === '#') {
                    e.preventDefault();
                    navItems.forEach(nav => nav.classList.remove('active'));
                    item.classList.add('active');
                }
            });
        });
    }

    initNavGroup('.bottom-nav .nav-item');
    initNavGroup('.nav-bar .nav-item');
    updateActiveStates();

    // 검색 오버레이 공통 로직 (전역 위임 또는 DOMContentLoaded 이후 바인딩)
    const searchOverlay = document.getElementById('search-overlay');
    if (searchOverlay) {
        const searchInput = searchOverlay.querySelector('.search-overlay-input');
        const searchIcon = searchOverlay.querySelector('.search-overlay-input-icon');

        // btn-search-open은 메인(index.html)에서는 정적, 서브페이지에서는 동적 삽입됨
        // 동적 삽입 이후에 바인딩하기 위해 문서 전체에 위임(이벤트 버블링) 사용
        document.addEventListener('click', (e) => {
            const openBtn = e.target.closest('#btn-search-open');
            if (openBtn) {
                e.preventDefault();
                searchOverlay.classList.add('open');
                if (searchInput) {
                    setTimeout(() => searchInput.focus(), 50);
                }
            }
        });

        // btn-search-close는 정적 삽입(component.js 최상단)되어 있으므로 바로 바인딩 가능
        const searchCloseBtn = document.getElementById('btn-search-close');
        if (searchCloseBtn) {
            searchCloseBtn.addEventListener('click', () => {
                searchOverlay.classList.remove('open');
                updateActiveStates(); // 검색 오버레이 닫기 시 active 상태 복구
            });
        }

        // 검색어 제출(Enter 입력 또는 검색 아이콘 클릭) 시 검색 결과 페이지로 이동
        function submitSearch() {
            if (!searchInput) return;
            // navigateToSearch()가 실제 페이지 이동(location.href)을 하긴 하지만, 새 페이지가
            // 그려지기 전까지 이전 포커스/가상 키보드 상태를 그대로 유지하는 기기가 있어서
            // 제출 시점에 명시적으로 닫아준다.
            searchInput.blur();
            navigateToSearch(searchInput.value);
        }

        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                // isComposing 체크 없이 Enter를 바로 가로채면, 한글 등 조합형 입력 중 키보드의
                // "이동" 키를 눌렀을 때(조합 커밋용 keydown) IME의 자체 제출 처리와 충돌해
                // 가상 키보드가 안 내려가는 기기가 있다(삼성 키보드에서 확인됨).
                if (e.key === 'Enter' && !e.isComposing) {
                    e.preventDefault();
                    submitSearch();
                }
            });
        }

        if (searchIcon) {
            searchIcon.addEventListener('click', submitSearch);
        }
    }

    // SHOP 버튼 검색 오버레이 연결
    const shopBtns = Array.from(document.querySelectorAll('.bottom-nav .nav-item')).filter(btn => {
        const textSpan = btn.querySelector('.nav-text');
        return textSpan && textSpan.textContent.trim() === '검색';
    });
    
    shopBtns.forEach(shopBtn => {
        shopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (searchOverlay) {
                searchOverlay.classList.add('open');
                const searchInput = searchOverlay.querySelector('.search-overlay-input');
                if (searchInput) {
                    setTimeout(() => searchInput.focus(), 50);
                }
            }
        });
    });

    window.addEventListener('popstate', () => {
        updateActiveStates();
    });

    const navBar = document.querySelector('.nav-bar');
    if (navBar) {
        navBar.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                navBar.scrollLeft += e.deltaY;
            }
        }, { passive: false });
    }
});

// Ad Banner Slider Logic
document.addEventListener('DOMContentLoaded', () => {
    const sliderSlides = document.querySelector('.ad-banner-slides');
    if (!sliderSlides) return;
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    
    const originalSlides = sliderSlides.querySelectorAll('img');
    const totalOriginalSlides = originalSlides.length;
    if (totalOriginalSlides === 0) return;

    // 무한 루프를 위한 첫 번째, 마지막 요소 복제
    const firstClone = originalSlides[0].cloneNode(true);
    const lastClone = originalSlides[totalOriginalSlides - 1].cloneNode(true);

    sliderSlides.appendChild(firstClone);
    sliderSlides.insertBefore(lastClone, originalSlides[0]);

    // 복제된 인덱스 포함 모든 이미지에 스타일과 클릭 이벤트 추가
    const allSlides = sliderSlides.querySelectorAll('img');
    allSlides.forEach(img => {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => {
            const productId = img.getAttribute('data-product-id');
            if (productId) {
                window.location.href = `product.html?id=${productId}`;
            }
        });
    });

    // 복제된 마지막 요소(0번 인덱스) 다음인 실제 첫 번째 요소(1번 인덱스)부터 시작
    let currentIndex = 1;
    let isTransitioning = false; // 연속 클릭 방지용 플래그

    // 초기 위치 설정 (트랜지션 없이 이동)
    sliderSlides.style.transition = 'none';
    sliderSlides.style.transform = `translateX(-${currentIndex * 100}%)`;

    function updateSlider(animate = true) {
        if (animate) {
            sliderSlides.style.transition = 'transform 0.4s ease-in-out';
        } else {
            sliderSlides.style.transition = 'none';
        }
        sliderSlides.style.transform = `translateX(-${currentIndex * 100}%)`;
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isTransitioning) return;
            isTransitioning = true;
            currentIndex++;
            updateSlider(true);
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isTransitioning) return;
            isTransitioning = true;
            currentIndex--;
            updateSlider(true);
        });
    }

    // 트랜지션이 끝났을 때 인덱스를 점프하여 무한 순환처럼 보이게 함
    sliderSlides.addEventListener('transitionend', () => {
        isTransitioning = false;
        if (currentIndex === totalOriginalSlides + 1) { // 마지막 복제본에 도달
            currentIndex = 1;
            updateSlider(false);
        } else if (currentIndex === 0) { // 첫 번째 복제본에 도달
            currentIndex = totalOriginalSlides;
            updateSlider(false);
        }
    });
});

// 전역 찜 목록 캐시 및 단일 요청 프라미스
window._wishlistCache = null;
window._wishlistFetchPromise = null;

// 찜 목록 캐시가 없다면 서버에서 최초 1회 전체 조회하여 캐시를 채우는 공통 헬퍼 (Singleflight 패턴 적용)
async function ensureWishlistLoaded() {
    if (!window._wishlistCache) {
        if (!window._wishlistFetchPromise) {
            window._wishlistFetchPromise = (async () => {
                try {
                    // silent401: 비로그인 상태에서도 홈 화면 등에서 조용히 빈 찜 목록으로 처리해야 하므로
                    // 전역 401 리다이렉트를 건너뛴다.
                    const result = await requestJson('/api/wishlists', { silent401: true });
                    if (result && result.data) {
                        // 찜한 상품이 카탈로그에서 삭제되면 서버가 product: null을 내려줄 수 있어 걸러낸다.
                        return result.data.filter(item => item.product).map(item => item.product.id.toString());
                    }
                    return [];
                } catch (error) {
                    if (error.status === 401) {
                        // 비로그인 상태는 정상 상태이므로 빈 배열로 캐시
                        return [];
                    }
                    // 네트워크 오류, 500 등은 캐시를 오염시키지 않고 다음 요청에서 재조회하도록 함
                    window._wishlistCache = null;
                    throw error;
                } finally {
                    window._wishlistFetchPromise = null;
                }
            })();
        }
        window._wishlistCache = await window._wishlistFetchPromise;
    }
    return window._wishlistCache;
}

// 같은 상품에 대한 토글 요청이 겹치는 것을 막는 진행 중 요청 맵.
// 응답 전에 같은 카드(또는 같은 상품의 다른 카드)를 연속 클릭하면, 각 호출이 요청 전
// 캐시 스냅샷으로 찜 여부를 판단하므로 똑같이 DELETE(또는 POST)를 중복 전송하게 된다.
// BE가 이미 해제된 찜의 DELETE도 성공으로 응답하기 때문에 요청 자체는 실패하지 않지만,
// 성공 이벤트가 두 번 발생해 관심 수가 실제보다 더 감소/증가해 보이는 문제로 이어진다.
const pendingWishlistToggles = new Map();

// 공통 관심상품(북마크) 토글 유틸리티
window.toggleSavedProduct = function(productId) {
    const key = productId.toString();
    if (pendingWishlistToggles.has(key)) {
        return pendingWishlistToggles.get(key);
    }

    const request = performWishlistToggle(productId).finally(() => {
        pendingWishlistToggles.delete(key);
    });
    pendingWishlistToggles.set(key, request);
    return request;
};

async function performWishlistToggle(productId) {
    // 초기 목록 조회가 진행 중이라면 완료를 기다려, 늦게 도착한 조회 결과가
    // 이후의 토글 결과를 덮어쓰는 레이스 컨디션을 방지
    const wishlist = await ensureWishlistLoaded();
    const productIdStr = productId.toString();
    const isWished = wishlist.includes(productIdStr);
    let isSaved = isWished;

    try {
        if (isWished) {
            // 이미 찜한 상품이면 해제 요청
            await requestJson(`/api/wishlists/${productId}`, { method: 'DELETE' });
            window._wishlistCache = window._wishlistCache.filter(id => id !== productIdStr);
            isSaved = false;
        } else {
            // 찜하지 않은 상품이면 등록 요청
            await requestJson('/api/wishlists', {
                method: 'POST',
                body: { productId: Number(productId) }
            });
            // 등록 성공 후 재조회 대신 캐시에 바로 추가하여, 재조회 실패로 인한 상태 불일치를 방지
            window._wishlistCache = [...wishlist, productIdStr];
            isSaved = true;
        }
    } catch (error) {
        if (error.status === 401 || error.code === 'UNAUTHORIZED') {
            // 인증 안됨 에러 처리
            alert('로그인이 필요합니다.');
            window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
            throw error;
        }
        console.error('찜 토글 에러:', error.status, error.code, error);
        alert(error.message || '찜 처리에 실패했습니다.');
        throw error; // 실패 시 기존 상태 유지를 위해 에러 전달
    }

    // UI 업데이트 이벤트를 발생시키고 결과를 반환
    window.dispatchEvent(new CustomEvent('saved-products-updated', { detail: { productId, isSaved } }));
    return isSaved;
}

// 홈/카테고리/브랜드 화면은 각자 sessionStorage에 상품 목록을 캐싱해두고, 캐시가 유효한 동안은
// 재조회 없이 그 배열로 카드를 다시 그린다(예: 다른 화면에 갔다가 캐시 만료 전에 돌아오는 경우).
// 화면의 카드 DOM만 갱신하고 이 원본 배열을 그대로 두면, 카드가 다시 그려질 때 토글 이전 숫자로
// 되돌아간다. 화면마다 캐시 키가 달라 전부 알 수 없으므로, sessionStorage 전체를 훑어 상품 배열이
// 들어있는 항목을 찾아 wishlistCount를 함께 보정한다. 캐시 형태는 두 가지가 섞여 있다:
// - home.js(fetchListWithCache): 캐시 값이 상품 배열 그 자체
// - category.js/brand.js(자체 캐시): 캐시 값이 API 응답 전체({ data: [...] })
function patchCachedInterestCounts(productId, delta) {
    const targetId = Number(productId);
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key || !key.startsWith('iksanstore:')) continue;

        try {
            const parsed = JSON.parse(sessionStorage.getItem(key));
            if (!parsed || typeof parsed !== 'object') continue;

            const list = Array.isArray(parsed.data) ? parsed.data
                : (parsed.data && Array.isArray(parsed.data.data)) ? parsed.data.data
                : null;
            if (!list) continue;

            let changed = false;
            list.forEach(item => {
                if (item && item.id === targetId && item.wishlistCount !== undefined) {
                    item.wishlistCount = Math.max(0, item.wishlistCount + delta);
                    changed = true;
                }
            });
            if (changed) sessionStorage.setItem(key, JSON.stringify(parsed));
        } catch (error) {
            // 손상된 JSON 등은 건너뛰고 다음 캐시 항목을 계속 처리한다.
        }
    }
}

// 같은 상품이 홈 화면 등에서 여러 카드로 동시에 노출되는 경우까지 전부 반영하기 위해,
// 클릭된 카드 하나만 갱신하는 대신 전역 이벤트를 통해 같은 productId를 가진 모든 카드를 갱신한다.
// 실제 카운트를 받은 카드(data-has-count)만 대상으로 하여, 값이 없어 "관심 0"으로만 표시되는
// 검색/카테고리 카드가 잘못된 숫자로 바뀌지 않도록 한다.
// component.js는 tests/page-urls.test.cjs에서 addEventListener가 없는 최소 mock window로도
// 로드되므로, 실제 브라우저가 아닌 환경에서 모듈 로드 자체가 깨지지 않도록 방어한다.
if (typeof window.addEventListener === 'function') {
    window.addEventListener('saved-products-updated', (e) => {
        const { productId, isSaved } = e.detail;
        const delta = isSaved ? 1 : -1;

        document.querySelectorAll(`.btn-save-bookmark[data-product-id="${productId}"]`).forEach(btn => {
            const card = btn.closest('.product-card');
            const countEl = card && card.querySelector('.interest-count');
            if (!countEl || countEl.dataset.hasCount !== 'true') return;

            const current = Number(countEl.dataset.count || 0);
            const next = Math.max(0, current + delta);
            countEl.dataset.count = next;
            countEl.textContent = `관심 ${next}`;
        });

        patchCachedInterestCounts(productId, delta);
    });
}

// 공통 관심상품 여부 확인 유틸리티 (비동기 및 캐싱 처리)
window.isProductSaved = async function(productOrId) {
    const productId = typeof productOrId === 'object' ? productOrId.id : productOrId;

    // 캐시가 없다면 서버에서 최초 1회 전체 조회하여 N+1 방지
    const wishlist = await ensureWishlistLoaded();

    return wishlist.includes(productId.toString());
};

// 찜 아이콘 UI 상태 공통 변경 유틸리티
window.updateWishlistIcon = function(icon, isSaved) {
    if (!icon || !document.body.contains(icon)) return;
    if (isSaved) {
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
        icon.classList.add('wished-icon');
    } else {
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
        icon.classList.remove('wished-icon');
    }
};

// 정보 아이콘 옆 안내 툴팁을 여닫는 공용 유틸리티.
// 호버 가능한 기기(데스크톱)에서는 마우스 오버 시 열리고, 클릭은 무시해 깜빡임 없이 유지된다.
// 호버가 불가능한 터치 기기에서는 mouseenter가 발생하지 않으므로 버튼 클릭으로 토글하고,
// 바깥을 클릭하면 닫는다. .info-tooltip-wrap/.info-tooltip-btn/.info-tooltip 마크업 조합을
// 페이지마다 그대로 재사용하면 되고, 여닫힘 로직은 이 함수 하나로 통일된다.
window.initInfoTooltip = function(triggerEl, tooltipEl) {
    if (!triggerEl || !tooltipEl) return;
    const wrap = triggerEl.closest('.info-tooltip-wrap');
    if (!wrap) return;

    // 호버가 안 되는 터치 기기(iOS Safari 등)는 탭 시 mouseenter를 합성 이벤트로 쏘지만
    // mouseleave는 없어서, mouseenter/mouseleave 리스너를 붙이면 openedByHover가 계속 true로
    // 남아 두 번째 탭부터 열리지 않는 버그가 생긴다. 그래서 호버 가능한 기기에서만 호버 로직을 붙인다.
    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (supportsHover) {
        let openedByHover = false;
        let closeTimer = null;

        const open = () => {
            clearTimeout(closeTimer);
            openedByHover = true;
            tooltipEl.hidden = false;
        };
        // 버튼(wrap)과 툴팁 사이의 여백을 가로지르는 동안 바로 닫히지 않도록 약간의 지연을 두고,
        // 그 사이 툴팁에 마우스가 들어오면(아래 tooltipEl 리스너) 닫힘을 취소한다.
        const scheduleClose = () => {
            clearTimeout(closeTimer);
            closeTimer = setTimeout(() => {
                openedByHover = false;
                tooltipEl.hidden = true;
            }, 150);
        };

        wrap.addEventListener('mouseenter', open);
        wrap.addEventListener('mouseleave', scheduleClose);
        tooltipEl.addEventListener('mouseenter', open);
        tooltipEl.addEventListener('mouseleave', scheduleClose);

        triggerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            // 호버로 이미 열려 있는 상태(데스크톱)에서는 클릭을 무시해, 열자마자 다시 닫히는 것을 방지한다.
            if (openedByHover) return;
            tooltipEl.hidden = !tooltipEl.hidden;
        });
    } else {
        triggerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            tooltipEl.hidden = !tooltipEl.hidden;
        });
    }

    document.addEventListener('click', (e) => {
        if (!tooltipEl.hidden && !tooltipEl.contains(e.target)) {
            tooltipEl.hidden = true;
        }
    });
};

// 카테고리 이름별 아이콘 이미지. API 응답(id, name)에는 아이콘이 없으므로 FE에서 이름으로 매핑한다.
// 매핑에 없는 이름(백엔드에 새 카테고리가 추가된 경우 등)은 CATEGORY_DEFAULT_ICON_URL을 사용한다.
const CATEGORY_ICON_MAP = {
    '음료': 'https://em-content.zobj.net/source/apple/453/hot-beverage_2615.png',
    '베이커리·간식': 'https://em-content.zobj.net/source/apple/453/ice-cream_1f368.png',
    '축산·농산물': 'https://em-content.zobj.net/source/apple/453/cooked-rice_1f35a.png',
    '외식·상품권': 'https://em-content.zobj.net/source/apple/453/fork-and-knife-with-plate_1f37d-fe0f.png',
    '체험·관광이용권': 'https://em-content.zobj.net/source/apple/453/bow-and-arrow_1f3f9.png',
    '지역특산 선물세트': 'https://em-content.zobj.net/source/apple/453/carp-streamer_1f38f.png'
};
const CATEGORY_DEFAULT_ICON_URL = 'https://em-content.zobj.net/source/apple/453/shopping-bags_1f6cd-fe0f.png';

// 공통 카테고리 카드 마크업 생성 유틸리티 (home.js 등 여러 화면에서 재사용)
// 클릭 시 category.html?categoryId=ID(category.js)로 이동해 해당 카테고리의 상품 목록을 보여준다.
window.createCategoryCard = function(category) {
    const card = document.createElement('a');
    card.className = 'category-card';
    card.href = `category.html?categoryId=${category.id}`;
    card.dataset.categoryId = category.id;

    const name = category.name || '';
    const iconUrl = CATEGORY_ICON_MAP[name] || CATEGORY_DEFAULT_ICON_URL;

    card.innerHTML = `
      <div class="category-icon-wrapper">
        <img class="category-img" src="${iconUrl}" alt="">
      </div>
      <span class="category-name"></span>
    `;

    const imgEl = card.querySelector('.category-img');
    if (imgEl) imgEl.alt = name;
    const nameEl = card.querySelector('.category-name');
    if (nameEl) nameEl.textContent = name;

    return card;
};

// 공통 상품 카드 마크업 생성 유틸리티 (home.js, search.js 등 여러 화면에서 재사용)
window.createProductCard = function(product, options = {}) {
    const card = document.createElement('article');
    card.className = 'product-card';

    const price = Number(product.price || 0);
    const discountRate = product.discountRate || 0;
    const thumbnailUrl = product.thumbnailUrl || '';
    const name = product.name || '';
    const brand = product.brand || '';

    const formattedPrice = price.toLocaleString() + '원';
    const discountHtml = discountRate ? `<span class="discount-rate">${discountRate}%</span>` : '';
    const rankHtml = options.showRank && options.rankIndex ? `<span class="rank-badge">${options.rankIndex}</span>` : '';

    card.innerHTML = `
      <div class="card-img-wrapper skeleton">
        ${rankHtml}
        <img class="product-img" alt="" onload="this.parentElement.classList.remove('skeleton'); this.classList.add('loaded');" onerror="this.parentElement.classList.remove('skeleton'); this.style.opacity=1;">
      </div>
      <div class="card-body">
        <span class="brand-name"></span>
        <h4 class="product-title"></h4>
        <div class="price-info" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            ${discountHtml}
            <span class="price">${formattedPrice}</span>
          </div>
          <button class="btn-save-bookmark" data-product-id="${product.id}" title="저장" style="background:none; border:none; padding:4px; cursor:pointer;">
            <i class="fa-regular fa-bookmark" style="font-size: 20px; color: #999;"></i>
          </button>
        </div>
        <div class="stats-row">
          <span class="interest-count">관심 0</span>
        </div>
      </div>
    `;

    // 랭킹 화면(GET /api/products/ranking)처럼 응답에 wishlistCount가 포함된 경우에만 실제 찜 개수로 대체.
    // 검색/카테고리 등 이 필드가 없는 화면은 기존과 동일하게 "관심 0"으로 표시된다.
    // data-count/data-has-count는 찜 토글 시 실제 값을 가진 카드만 낙관적으로 +/-1 하기 위한 표시다.
    if (product.wishlistCount !== undefined) {
        const interestCountEl = card.querySelector('.interest-count');
        if (interestCountEl) {
            interestCountEl.textContent = `관심 ${product.wishlistCount}`;
            interestCountEl.dataset.count = product.wishlistCount;
            interestCountEl.dataset.hasCount = 'true';
        }
    }

    const imgEl = card.querySelector('.product-img');
    if (imgEl) {
        imgEl.src = thumbnailUrl;
        imgEl.alt = name;
    }
    const brandEl = card.querySelector('.brand-name');
    if (brandEl) brandEl.textContent = brand;
    const titleEl = card.querySelector('.product-title');
    if (titleEl) titleEl.textContent = name;

    // Initialize save button state asynchronously
    const saveBtn = card.querySelector('.btn-save-bookmark');
    if (saveBtn) {
        const icon = saveBtn.querySelector('i');
        (async () => {
            try {
                const isSaved = await window.isProductSaved(product);
                window.updateWishlistIcon(icon, isSaved);
            } catch (error) {
                console.error('찜 상태 초기화 실패:', error);
            }
        })();

        saveBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // prevent card click
            try {
                const isNowSaved = await window.toggleSavedProduct(product.id);
                const icon = saveBtn.querySelector('i');
                window.updateWishlistIcon(icon, isNowSaved);
            } catch (error) {
                // 실패하면 기존 아이콘 유지
                console.error('찜 토글 에러:', error);
            }
        });
    }

    // Card click handler to navigate to product.html?id=ID
    card.addEventListener('click', () => {
        window.location.href = `product.html?id=${product.id}`;
    });

    return card;
};

// 공통 스켈레톤 상품 카드 마크업 생성 유틸리티 (.product-card 레이아웃과 동일한 자리표시자)
window.createSkeletonCard = function() {
    const card = document.createElement('div');
    card.className = 'product-card skeleton-card';
    card.innerHTML = `
      <div class="card-img-wrapper"><div class="skeleton skeleton-card-img"></div></div>
      <div class="card-body">
        <div class="skeleton skeleton-line" style="width:35%;height:11px;"></div>
        <div class="skeleton skeleton-line" style="width:90%;height:13px;"></div>
        <div class="skeleton skeleton-line" style="width:45%;height:15px;"></div>
      </div>
    `;
    return card;
};

// GET /api/products 기반 상품 목록 화면(검색 결과, 카테고리 상품 목록, 위시리스트 등)이 공통으로 쓰는 컨트롤러.
// listEl에 스켈레톤/결과/빈 상태/에러 상태를 그려주고, 빠른 재요청 시 오래된 응답이 최신 결과를
// 덮어쓰지 않도록 이전 요청을 취소하는 레이스 컨디션 방지 로직까지 포함한다. (search.js의 기존 로직을 일반화)
// buildRequestPath(query): query(검색어·categoryId 등)를 받아 '/api/products?...' 경로 문자열을 반환.
// emptyMessage / errorMessage: 결과 0건 / 요청 실패 시 노출할 안내 문구.
//   emptyMessage는 문자열 대신 (rawItems, products) => 문자열 함수로도 줄 수 있다.
//   (예: 위시리스트에서 mapResults가 걸러낸 항목이 있으면 "찜한 상품 없음"과 다른 문구로 안내)
// mapResults(data): 응답의 data 배열을 상품 배열로 변환하는 훅. 생략 시 data를 그대로 상품 배열로 사용한다.
//   (예: 위시리스트 API의 data는 [{product: {...}}] 형태라 item => item.product로 매핑해야 함)
// unauthorizedMessage: 지정하면 401 응답 시 errorMessage 대신 이 메시지로 안내(로그인 필요 등). 미지정 시 기존처럼 일반 에러로 처리.
// removeUnsavedCards: true면 saved-products-updated에서 찜 해제된 카드를 아이콘 동기화 대신 목록에서 완전히 제거한다.
//   (위시리스트처럼 "찜한 상품만 보여주는" 화면 전용. 미지정 시 기존처럼 아이콘만 동기화)
// showRank: true면 각 카드에 순위 배지를 표시한다. GET /api/products/ranking처럼 응답 항목에 이미
//   rank가 매겨져 있는 화면(ranking.html) 전용. 미지정 시 기존처럼 배지 없이 렌더링.
// request: 기본 requestJson 대신 캐시 등을 적용한 요청 함수를 화면별로 주입할 때 사용한다.
window.createProductListLoader = function(listEl, { buildRequestPath, emptyMessage, errorMessage, blankMessage, mapResults, unauthorizedMessage, removeUnsavedCards, showRank, request = window.requestJson }) {
    function renderSkeletonState() {
        if (!listEl) return;
        listEl.classList.remove('is-empty');
        listEl.innerHTML = '';
        for (let i = 0; i < 6; i++) listEl.appendChild(createSkeletonCard());
    }

    // is-empty: 결과가 없거나 실패했을 때, 리스트 영역을 남은 화면 높이만큼 늘려
    // 안내 문구가 화면 세로 중앙에 오도록 하는 CSS 훅(style.css의 .page-search 규칙 참고)
    function renderFallbackState(message) {
        if (!listEl) return;
        listEl.classList.add('is-empty');
        listEl.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-box-open"></i>
            <p>${message}</p>
          </div>
        `;
    }

    function renderResults(products) {
        if (!listEl) return;
        listEl.classList.remove('is-empty');
        listEl.innerHTML = '';
        products.forEach(product => {
            const cardOptions = showRank ? { showRank: true, rankIndex: product.rank } : undefined;
            listEl.appendChild(createProductCard(product, cardOptions));
        });
    }

    // removeUnsavedCards가 켜진 화면(위시리스트)에서 찜 해제된 상품의 카드를 목록에서 제거하고,
    // 마지막 카드가 사라지면 빈 목록 안내로 전환한다.
    function removeUnsavedCard(productId) {
        const btn = listEl.querySelector(`.btn-save-bookmark[data-product-id="${productId}"]`);
        const card = btn ? btn.closest('.product-card') : null;
        if (!card) return;
        card.remove();
        if (!listEl.querySelector('.product-card')) {
            // 남은 카드가 없는 것은 실제로 목록이 빈 상태이지, mapResults가 걸러낸 상황이 아니므로
            // 함수형 emptyMessage에는 빈 배열을 넘겨 "진짜 빈 목록" 문구가 나오도록 한다.
            const message = typeof emptyMessage === 'function' ? emptyMessage([], []) : emptyMessage;
            renderFallbackState(message);
        }
    }

    async function syncSaveButtons(e) {
        if (!listEl) return;

        // removeUnsavedCards 화면(위시리스트)의 카드는 전부 이미 찜한 상품이고, saved-products-updated는
        // window.dispatchEvent로 같은 페이지 내에서만 전달되므로 이 화면에서 isSaved: true 이벤트가
        // 발생할 일은 없다. 찜 해제 시 이벤트로 전달된 productId만 제거하면 된다.
        if (removeUnsavedCards) {
            const { productId, isSaved } = (e && e.detail) || {};
            if (productId === undefined) return;
            if (!isSaved) {
                removeUnsavedCard(productId);
            }
            return;
        }

        const btns = listEl.querySelectorAll('.btn-save-bookmark');
        for (const btn of btns) {
            const pid = btn.getAttribute('data-product-id');
            if (!pid) continue;
            const icon = btn.querySelector('i');
            try {
                const isSaved = await window.isProductSaved(pid);
                window.updateWishlistIcon(icon, isSaved);
            } catch (error) {
                console.error('찜 상태 동기화 실패:', error);
            }
        }
    }

    window.addEventListener('saved-products-updated', syncSaveButtons);

    // 빠르게 재요청할 때 응답이 요청 순서와 다르게 도착해 이전(오래된) 결과가
    // 최신 결과를 덮어쓰는 것을 막기 위해, 새 요청을 시작할 때마다 진행 중인 이전 요청을 취소한다.
    let current = null;

    // showSkeleton=false: 이미 결과가 떠 있는 상태에서의 재요청은 기존 카드를 그대로 유지하다가
    // 응답이 오면 바로 새 카드로 교체한다(스켈레톤 왕복으로 인한 깜빡임 방지).
    async function load(query, { showSkeleton = true } = {}) {
        if (current) {
            current.controller.abort();
            current.settle();
            current = null;
        }

        const path = buildRequestPath(query);
        if (!path) {
            const message = blankMessage || (typeof emptyMessage === 'function' ? emptyMessage([], []) : emptyMessage);
            renderFallbackState(message);
            return;
        }

        const controller = new AbortController();

        if (showSkeleton) {
            renderSkeletonState();
        }
        const settle = createSkeletonGuard(() => {
            renderFallbackState(errorMessage);
        }, 5000);

        current = { controller, settle };

        try {
            // silent401: unauthorizedMessage가 지정된 화면(예: 위시리스트)은 전역 401 리다이렉트 대신
            // 이 컨트롤러의 catch 블록에서 안내 문구로 직접 처리한다.
            const result = await request(path, { signal: controller.signal, silent401: !!unauthorizedMessage });
            settle();
            if (controller.signal.aborted) return;
            const rawItems = (result && result.data && Array.isArray(result.data)) ? result.data : [];
            const products = mapResults ? mapResults(rawItems) : rawItems;
            if (products.length === 0) {
                const message = typeof emptyMessage === 'function' ? emptyMessage(rawItems, products) : emptyMessage;
                renderFallbackState(message);
            } else {
                renderResults(products);
            }
            return result;
        } catch (error) {
            settle();
            if (controller.signal.aborted || error.name === 'AbortError') return;
            if (error.status === 401 && unauthorizedMessage) {
                renderFallbackState(unauthorizedMessage);
                return;
            }
            console.error('상품 목록 조회에 실패했습니다:', error);
            renderFallbackState(errorMessage);
        }
    }

    return { load, renderMessage: renderFallbackState };
};
