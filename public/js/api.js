// HTTP 상태와 API 오류 정보를 화면 코드에 전달하기 위한 공통 오류 객체다.
class ApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED', data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

// 401 발생 시 로그인 화면으로 이동한다는 안내를 화면 하단에 잠깐 띄운다.
// alert()과 달리 확인 클릭을 요구하지 않으므로, 리다이렉트 전에 사용자가 메시지를
// 읽을 시간(UNAUTHORIZED_REDIRECT_DELAY_MS)을 직접 확보해줘야 한다.
const UNAUTHORIZED_REDIRECT_DELAY_MS = 800;

// 화면 하단에 짧게 떴다 사라지는 공용 토스트. duration(ms) 후 자동으로 사라지며,
// 0을 넘기면(예: 401 리다이렉트 직전) 자동으로 숨기지 않고 페이지 전환에 맡긴다.
let toastHideTimer = null;
function showToast(message, duration = 800) {
  let toastEl = document.getElementById('global-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'global-toast';
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:32px', 'transform:translateX(-50%)',
      'max-width:calc(100vw - 32px)', 'padding:12px 20px', 'border-radius:8px',
      'background:rgba(0,0,0,0.85)', 'color:#fff', 'font-size:14px', 'line-height:1.5',
      'text-align:center', 'word-break:keep-all', 'z-index:9999',
      'opacity:0', 'transition:opacity 0.2s ease', 'pointer-events:none'
    ].join(';');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  // 이미 열려있는 토스트의 텍스트만 바뀐 경우에도 opacity 전환이 다시 재생되도록 리플로우를 강제한다.
  void toastEl.offsetWidth;
  toastEl.style.opacity = '1';

  if (toastHideTimer) clearTimeout(toastHideTimer);
  if (duration > 0) {
    toastHideTimer = setTimeout(() => {
      toastEl.style.opacity = '0';
    }, duration);
  }
}

function showUnauthorizedToast(message) {
  // 곧바로 로그인 페이지로 리다이렉트되므로 자동으로 숨기지 않는다.
  showToast(message, 0);
}

// 탭에서 사이트에 처음 진입한 화면(주소 직접 입력·북마크·외부 사이트에서 유입)의 히스토리 항목에 표시를 남긴다.
// 로그인 이동이 이 항목을 replace로 덮어쓰면, 로그인 화면에서 뒤로가기를 눌렀을 때 돌아올 사이트 화면이 없어
// 사이트를 벗어나 버린다. 그래서 이 항목만은 남겨두고(push) 로그인으로 이동하는 데 쓴다.
// (brand/category처럼 history.replaceState를 쓰는 화면은 이 state를 지우지 않도록 기존 state를 넘겨야 한다.)
function isFirstSiteEntry() {
  const state = window.history && window.history.state;
  return !!(state && state.firstSiteEntry);
}

(function markFirstSiteEntry() {
  try {
    const cameFromSite = document.referrer && new URL(document.referrer).origin === window.location.origin;
    // 사이트 안에서 새 탭으로 연 화면은 referrer가 같은 사이트여도 그 탭의 첫 항목이므로 첫 진입으로 본다.
    const isOnlyEntryInTab = window.history.length === 1;
    if ((cameFromSite && !isOnlyEntryInTab) || isFirstSiteEntry()) return;
    const state = window.history.state;
    window.history.replaceState({ ...(state && typeof state === 'object' ? state : {}), firstSiteEntry: true }, '');
  } catch (error) {
    // history/referrer 접근이 막힌 환경에서는 표시 없이 진행한다(항상 replace로 폴백).
  }
})();

// 로그인 페이지로 이동할 때는 기본적으로 replace를 쓴다. href(push)로 이동하면 login 항목이 히스토리에 남아
// 로그인 후(또는 로그인 화면에서) 뒤로가기를 눌렀을 때 로그인 화면이 다시 나타난다.
// 단 keepFirstEntry가 true이고 현재 항목이 사이트 첫 진입 화면이면 그 항목을 남기고(push) 이동한다.
// (사용자가 직접 로그인으로 가는 동작에만 쓴다. 인증이 필수인 화면의 401 처리처럼 되돌아와도 다시 튕기는
// 경우에는 남길 이유가 없으므로 쓰지 않는다.)
function goToLogin(url, keepFirstEntry = false) {
  if (keepFirstEntry && isFirstSiteEntry()) {
    window.location.assign(url);
  } else {
    window.location.replace(url);
  }
}

// redirect를 넘기면 로그인 성공 후 돌아올 주소로 전달한다.
function navigateToLogin(redirect, { keepFirstEntry = false } = {}) {
  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
  goToLogin(`/login${query}`, keepFirstEntry);
}

// <a href="login...">으로 로그인에 가는 링크(하단 네비, 장바구니 안내 패널, 회원가입 화면 등)는
// 링크마다 바인딩하지 않고 위임으로 가로채 같은 규칙(replace, 첫 진입 화면이면 유지)을 적용한다.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest && e.target.closest('a[href]');
  if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
  let url;
  try {
    url = new URL(link.href, window.location.href);
  } catch (error) {
    return;
  }
  if (url.origin !== window.location.origin || !/^\/login(?:\.html)?\/?$/.test(url.pathname)) return;
  e.preventDefault();
  goToLogin(url.href, true);
});

// 세션 쿠키, JSON 변환, HTTP·네트워크 오류 처리를 공통으로 수행한다.
async function requestJson(path, options = {}) {
  const { body, headers = {}, silent401 = false, ...requestOptions } = options;
  const config = {
    credentials: 'include',
    ...requestOptions,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    }
  };

  // 로그인 요청(POST /api/auth/login)의 401은 인증 만료가 아니라 이메일/비밀번호 불일치이므로
  // 전역 리다이렉트 대상에서 제외하고, login.js가 INVALID_EMAIL_OR_PASSWORD를 직접 처리하게 한다.
  const isLoginRequest = path === '/api/auth/login' && (config.method || 'GET').toUpperCase() === 'POST';

  // 요청 데이터가 있을 때만 JSON 문자열로 변환하여 본문에 담는다.
  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, config);
  } catch (error) {
    // 서버에 도달하지 못한 경우 화면에서 구분할 수 있는 네트워크 오류로 변환한다.
    throw new ApiError('네트워크 연결을 확인해주세요.', {
      code: 'NETWORK_ERROR'
    });
  }

  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    // JSON이 아닌 응답이 오면 일반 HTTP 오류와 구분하여 전달한다.
    throw new ApiError('서버 응답을 처리할 수 없습니다.', {
      status: response.status,
      code: 'INVALID_JSON_RESPONSE'
    });
  }

  // 4xx·5xx 응답의 상태, 오류 코드와 데이터를 화면별 catch 처리로 전달한다.
  if (!response.ok) {
    // silent401: 로그인 여부만 조용히 확인하는 배경 호출(예: 전역 네비게이션 상태 갱신)은
    // 인증이 필수인 페이지가 아니므로 전역 리다이렉트를 건너뛰고 호출부에서 직접 처리하게 한다.
    if (response.status === 401 && !silent401 && !isLoginRequest) {
      showUnauthorizedToast('로그인이 필요한 서비스입니다.');
      // href(push)로 이동하면 현재 페이지가 히스토리에 그대로 남아, 로그인 후 돌아왔다가
      // 다시 뒤로가기를 누를 때 이 미인증 방문 기록을 다시 거치게 된다. navigateToLogin은
      // replace로 대체해 로그인 왕복 과정이 히스토리에 여분의 항목을 남기지 않도록 한다.
      const redirectTarget = window.location.href;
      setTimeout(() => navigateToLogin(redirectTarget), UNAUTHORIZED_REDIRECT_DELAY_MS);
      return;
    }

    throw new ApiError(result.message || 'API 요청에 실패했습니다.', {
      status: response.status,
      code: result.code,
      data: result.data
    });
  }

  return result;
}

// sessionCache에 유효한 배열 캐시가 있으면 그대로 반환하고, 없으면 API를 조회해 캐시에 저장한다.
// 목록 형태(data가 배열) 응답을 캐시 우선으로 조회하는 화면(홈 상품 목록, 카테고리 목록 등)에서 공통으로 사용한다.
// 반환값의 fromCache로 호출부가 스켈레톤 노출 여부를 판단할 수 있다.
async function fetchListWithCache(path, cacheKey, ttlMs) {
  const cached = window.sessionCache ? window.sessionCache.get(cacheKey, ttlMs) : null;
  if (Array.isArray(cached)) {
    return { data: cached, fromCache: true };
  }

  const result = await requestJson(path);
  // requestJson은 401(silent401 미지정 시) 발생 시 예외 대신 로그인 페이지로 리다이렉트하며
  // undefined를 반환한다. 이런 비정상 응답까지 빈 배열로 캐시하면, 재로그인 후에도 TTL이
  // 끝나기 전까지 빈 목록이 계속 노출되므로 정상 응답(data가 배열)일 때만 캐시에 쓴다.
  const isValidResponse = result && Array.isArray(result.data);
  const data = isValidResponse ? result.data : [];
  if (window.sessionCache && isValidResponse) {
    window.sessionCache.set(cacheKey, data);
  }
  return { data, fromCache: false };
}

// sessionCache 키·TTL은 데이터를 저장하는 화면(home.js)과 읽기만 하는 화면(category.js)이
// 값을 동일하게 맞춰야 하므로 여러 화면(js 파일)에서 공유하도록 전역 상수로 둔다.
window.CATEGORY_CACHE_KEY = 'iksanstore:categories:v1';
window.CATEGORY_CACHE_TTL_MS = 5 * 60 * 1000;
window.PRODUCT_CACHE_KEY = 'iksanstore:products:v1';
window.PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;

// 일반 script 태그로 불러온 각 화면에서 공통 함수와 오류 객체를 사용할 수 있게 공개한다.
window.ApiError = ApiError;
window.requestJson = requestJson;
window.fetchListWithCache = fetchListWithCache;
window.showToast = showToast;
