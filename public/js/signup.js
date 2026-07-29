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
    if (focusElement) {
      const parentGroup = focusElement.closest('.form-group');
      if (parentGroup) {
        const inlineErrorEl = parentGroup.querySelector('.auth-error');
        if (inlineErrorEl) {
          if (inlineErrorEl.textContent !== message) {
            inlineErrorEl.textContent = message;
          }
          inlineErrorEl.hidden = false;
          inlineErrorEl.setAttribute('aria-live', 'polite');
        }
      }
      focusElement.setAttribute('aria-invalid', 'true');
      if (document.activeElement !== focusElement) {
        focusElement.focus();
      }
    } else {
      // 글로벌 에러 (네트워크 에러 등 특정 input이 없는 경우)
      if (!errorEl) return;
      if (errorEl.textContent !== message) {
        errorEl.textContent = message;
      }
      errorEl.hidden = false;
      errorEl.setAttribute('aria-live', 'polite');
    }
  }

  function clearError() {
    // 글로벌 에러 초기화
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
    
    // 폼 내 모든 입력창의 에러 상태 및 인라인 에러 텍스트 초기화
    formInputs.forEach(input => {
      input.removeAttribute('aria-invalid');
      const parentGroup = input.closest('.form-group');
      if (parentGroup) {
        const inlineErrorEl = parentGroup.querySelector('.auth-error');
        if (inlineErrorEl) {
          inlineErrorEl.hidden = true;
          inlineErrorEl.textContent = '';
        }
      }
    });
  }

  // 유효성 검사 로직을 별도 함수로 분리 (관심사 분리, DRY 원칙)
  function validateForm(emailInput, passwordInput, nicknameInput) {
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const nickname = nicknameInput.value;

    // 이메일 유효성 검사
    if (!email) {
      return {
        isValid: false,
        message: ERROR_MESSAGES.REQUIRED_EMAIL,
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
    if (email.length > 255) {
      return { 
        isValid: false,
        message: ERROR_MESSAGES.EMAIL_TOO_LONG, 
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
    // 불완전한 자음/모음(ㄱ-ㅎㅏ-ㅣ) 단독 입력 방지를 위해 정규식 롤백 적용 (공백은 BE에서 최종 검증)
    if (!/^[가-힣a-zA-Z0-9\s]+$/.test(nickname)) {
      return {
        isValid: false,
        message: ERROR_MESSAGES.INVALID_NICKNAME_FORMAT,
        element: nicknameInput
      };
    }
    return { isValid: true, data: { email, password, nickname } };
  }

  // 비밀번호 실시간 강도 검사
  const passwordInput = document.getElementById('password');
  const strengthIndicator = document.getElementById('password-strength');

  // 비밀번호 칸의 에러 상태를 해제하는 헬퍼 함수 (메모리 최적화를 위해 외부로 분리)
  const clearPasswordError = (inputEl, errorEl) => {
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
    inputEl.removeAttribute('aria-invalid');
  };

  if (passwordInput && strengthIndicator) {
    passwordInput.addEventListener('input', (e) => {
      const val = e.target.value;
      
      const parentGroup = passwordInput.closest('.form-group');
      const inlineErrorEl = parentGroup ? parentGroup.querySelector('.auth-error') : null;

      // 기존 상태 클래스 초기화
      strengthIndicator.classList.remove('badge-visible', 'badge-invalid', 'badge-weak', 'badge-medium', 'badge-strong');

      if (!val) {
        showError(ERROR_MESSAGES.REQUIRED_PASSWORD, passwordInput);
        return;
      }
      
      strengthIndicator.classList.add('badge-visible');
      
      // 필수 규칙 미충족 시 실시간 인라인 에러 출력
      if (/\s/.test(val)) {
        strengthIndicator.textContent = '사용 불가';
        strengthIndicator.classList.add('badge-invalid');
        showError(ERROR_MESSAGES.INVALID_PASSWORD_FORMAT, passwordInput);
        return;
      }

      if (val.length < 8) {
        strengthIndicator.textContent = '사용 불가';
        strengthIndicator.classList.add('badge-invalid');
        showError(ERROR_MESSAGES.PASSWORD_TOO_SHORT, passwordInput);
        return;
      }

      if (val.length > 15) {
        strengthIndicator.textContent = '사용 불가';
        strengthIndicator.classList.add('badge-invalid');
        showError(ERROR_MESSAGES.PASSWORD_TOO_LONG, passwordInput);
        return;
      }

      // 위 필수 규칙을 모두 통과했다면 오류 메시지 제거
      clearPasswordError(passwordInput, inlineErrorEl);

      // 문자 종류 분석 (영문, 숫자, 특수문자)
      const hasLetter = /[a-zA-Z]/.test(val);
      const hasNumber = /\d/.test(val);
      const hasSpecial = /[^a-zA-Z0-9\s]/.test(val);
      
      const typesCount = [hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
      
      if (typesCount <= 1) {
        strengthIndicator.textContent = '약함';
        strengthIndicator.classList.add('badge-weak');
      } else if (typesCount === 2) {
        strengthIndicator.textContent = '보통';
        strengthIndicator.classList.add('badge-medium');
      } else {
        strengthIndicator.textContent = '강함';
        strengthIndicator.classList.add('badge-strong');
      }
    });
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

      // 에러 코드 포함 여부 기반 대상 요소 추출 헬퍼 함수
      const getErrorTarget = (code) => {
        if (!code) return null;
        if (code.includes('EMAIL')) return document.getElementById('email');
        if (code.includes('PASSWORD')) return document.getElementById('password');
        if (code.includes('NICKNAME')) return document.getElementById('nickname');
        return null; // 규칙에 맞지 않는 에러는 전역 에러로 Fallback
      };

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
        showError(ERROR_MESSAGES[result.code] || '회원가입에 실패했습니다.', getErrorTarget(result.code));
      } catch (error) {
        console.error('회원가입 요청 실패:', error);

        const errorCode = error?.code;
        // 등록된 에러 코드가 없으면 실제 서버 에러 원인(message) 또는 전역 에러로 Fallback
        const errorMessage = ERROR_MESSAGES[errorCode] || error?.message || ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
        showError(errorMessage, getErrorTarget(errorCode));
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
  // 홈/뒤로가기 버튼 등 공통 헤더 로직은 component.js에서 전역 처리됨
});
