class ApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED', data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

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

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, config);
  } catch (error) {
    throw new ApiError('네트워크 연결을 확인해주세요.', {
      code: 'NETWORK_ERROR'
    });
  }

  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    throw new ApiError('서버 응답을 처리할 수 없습니다.', {
      status: response.status,
      code: 'INVALID_JSON_RESPONSE'
    });
  }

  if (!response.ok) {
    throw new ApiError(result.message || 'API 요청에 실패했습니다.', {
      status: response.status,
      code: result.code,
      data: result.data
    });
  }

  return result;
}

window.ApiError = ApiError;
window.requestJson = requestJson;
