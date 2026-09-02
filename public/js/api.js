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

function showUnauthorizedToast(message) {
  let toastEl = document.getElementById('global-401-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'global-401-toast';
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
}

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
      const redirectTarget = encodeURIComponent(window.location.href);
      setTimeout(() => {
        window.location.href = `/login.html?redirect=${redirectTarget}`;
      }, UNAUTHORIZED_REDIRECT_DELAY_MS);
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
