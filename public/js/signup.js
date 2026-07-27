// 1. 변하지 않는 상수(에러 메시지)는 스코프 바깥으로 분리 (메모리 최적화)
const ERROR_MESSAGES = Object.freeze({
  // 이메일 오류
  REQUIRED_EMAIL: '이메일을 입력해 주세요.',
  INVALID_EMAIL_TYPE : '이메일 입력값을 확인해 주세요.',
  INVALID_EMAIL_FORMAT : '이메일 형식을 확인해 주세요',
  EMAIL_TOO_LONG : '이메일이 너무 깁니다.',
  EMAIL_ALREADY_EXISTS : '이미 가입된 이메일 입니다.',
  // 비밀번호 오류
  REQUIRED_PASSWORD: '비밀번호를 입력해 주세요.',
  INVALID_PASSWORD_TYPE : '비밀번호 입력값을 확인해주세요.',
  INVALID_PASSWORD_FORMAT : '비밀번호에는 공백을 사용할 수 없습니다.',
  PASSWORD_TOO_SHORT : '비밀번호는 8자 이상 입력해 주세요',
  PASSWORD_TOO_LONG : '비밀번호는 15자 이하로 입력해주세요',
  COMMON_PASSWORD : '다른 비밀번호를 사용해 주세요.',
  // 닉네임 오류
  REQUIRED_NICKNAME: '닉네임을 입력해 주세요.',
  INVALID_NICKNAME_TYPE : '닉네임 입력값을 확인해주세요',
  INVALID_NICKNAME_FORMAT : '한글·영문·숫자만 사용할 수 있습니다.',
  NICKNAME_TOO_SHORT : '닉네임은 2자 이상 입력해 주세요.',
  NICKNAME_TOO_LONG : '닉네임은 8자 이하로 입력해 주세요',
  NICKNAME_ALREADY_EXISTS: '이미 사용 중인 닉네임입니다.',
  // 공통 오류
  NETWORK_ERROR : '네트워크 연결을 확인해 주세요.',
  INVALID_JSON_RESPONSE : '서버 응답을 처리할 수 없습니다.',
  INTERNAL_SERVER_ERROR: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
});


document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signup-form');
  const errorEl = document.getElementById('signup-error');
  const submitBtn = form ? form.querySelector('.btn-auth-submit') : null;
  
  // 2. 폼 안의 모든 input 요소들을 1회만 조회하여 캐싱 (DOM 재탐색 방지)
  const formInputs = form ? Array.from(form.querySelectorAll('input')) : [];

  // UX/A11y 강화를 위해 포커스를 이동시킬 element를 인자로 추가
  function showError(message, focusElement = null) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
    errorEl.setAttribute('aria-live', 'assertive'); // 스크린 리더가 에러를 즉각 읽도록 설정
    if (focusElement) {
      focusElement.setAttribute('aria-invalid', 'true');
      focusElement.focus();
    }
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.textContent = '';
    
    // 캐싱된 formInputs 배열을 순회하여 불필요한 DOM 트리 재탐색 방지
    formInputs.forEach(input => input.removeAttribute('aria-invalid'));
  }

  // 유효성 검사 로직을 별도 함수로 분리 (관심사 분리, DRY 원칙)
  function validateForm(emailInput, passwordInput, nicknameInput) {
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const nickname = nicknameInput.value.trim();

    // 이메일 유효성 검사
    if (!email) {
      return {
        isValid: false,
        message: ERROR_MESSAGES.REQUIRED_EMAIL,
        element: emailInput
      };
    }
    if (email.length > 255) {
      return { 
        isValid: false,
        message: ERROR_MESSAGES.EMAIL_TOO_LONG, 
        element: emailInput 
      };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { 
        isValid: false, 
        message: ERROR_MESSAGES.INVALID_EMAIL_FORMAT, 
        element: emailInput 
      };
    }

    // 비밀번호 유효성 검사
    if (!password) {
      return { 
        isValid: false,
        message: ERROR_MESSAGES.REQUIRED_PASSWORD,
        element: passwordInput 
      };
    }
    if (/\s/.test(password)) {
      return {
        isValid: false,
        message: ERROR_MESSAGES.INVALID_PASSWORD_FORMAT,
        element: passwordInput
      };
    }
    if (password.length < 8) {
      return {
        isValid: false,
        message: ERROR_MESSAGES.PASSWORD_TOO_SHORT,
        element: passwordInput
      };
    }
    if (password.length > 15) {
      return {
        isValid: false,
        message: ERROR_MESSAGES.PASSWORD_TOO_LONG,
        element: passwordInput
      };
    }

    // 닉네임 유효성 검사
    if (!nickname) {
      return { 
        isValid: false, 
        message: ERROR_MESSAGES.REQUIRED_NICKNAME, 
        element: nicknameInput 
      };
    }

    // 불완전한 자음/모음(ㄱ-ㅎㅏ-ㅣ) 단독 입력 방지를 위해 정규식 롤백 적용
    if (!/^[가-힣a-zA-Z0-9]+$/.test(nickname)) {
      return {
        isValid: false,
        message: ERROR_MESSAGES.INVALID_NICKNAME_FORMAT,
        element: nicknameInput
      };
    }
    if (nickname.length < 2) return {
      isValid: false,
      message: ERROR_MESSAGES.NICKNAME_TOO_SHORT,
      element: nicknameInput
    };
    if (nickname.length > 8) return {
      isValid: false,
      message: ERROR_MESSAGES.NICKNAME_TOO_LONG,
      element: nicknameInput
    };
    return { isValid: true, data: { email, password, nickname } };
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();

      // 분리된 유효성 검사 함수 호출
      const validation = validateForm(form.email, form.password, form.nickname);
      
      // 유효성 검사 실패 시 에러 표시 후 종료
      if (!validation.isValid) {
        showError(validation.message, validation.element);
        return;
      }
      if (submitBtn) submitBtn.disabled = true;
      try {
        const result = await requestJson('/api/auth/signup', {
          method: 'POST',
          body: validation.data
        });
        if (result.code === 'SIGNUP_SUCCESS') {
          alert('회원가입이 완료되었습니다. 로그인해주세요.');
          window.location.href = 'login.html';
          return;
        }
        showError(ERROR_MESSAGES[result.code] || '회원가입에 실패했습니다.');
      } catch (error) {
        console.error('회원가입 요청 실패:', error);

        // Optional Chaining(?.) 적용 및 순수 네트워크 오류 대비
        const errorCode = error?.code;
        showError(ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.NETWORK_ERROR);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
  // Home Button Logic
  const btnHome = document.getElementById('btn-home');
  if (btnHome) {
    btnHome.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'index.html';
    });
  }
});
