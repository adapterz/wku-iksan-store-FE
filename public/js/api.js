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

// 세션 쿠키, JSON 변환, HTTP·네트워크 오류 처리를 공통으로 수행한다.
async function requestJson(path, options = {}) {
  const { body, headers = {}, ...requestOptions } = options;
  const config = {
    credentials: 'include',
    ...requestOptions,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    }
  };

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
    throw new ApiError(result.message || 'API 요청에 실패했습니다.', {
      status: response.status,
      code: result.code,
      data: result.data
    });
  }

  return result;
}

// 일반 script 태그로 불러온 각 화면에서 공통 함수와 오류 객체를 사용할 수 있게 공개한다.
window.ApiError = ApiError;
window.requestJson = requestJson;
