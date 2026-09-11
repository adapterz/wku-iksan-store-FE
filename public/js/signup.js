// profile.js와 거의 동일했던 에러 메시지/유효성 검사 로직이라 component.js의 공통 헬퍼를 그대로 쓴다.
const ERROR_MESSAGES = window.ERROR_MESSAGES;

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signup-form');
  const errorEl = document.getElementById('signup-error');
  const submitBtn = form ? form.querySelector('.btn-auth-submit') : null;

  // login.js와 동일하게 쓰던 인라인 폼 에러 로직이라 component.js의 공통 헬퍼에 위임한다.
  // (호출부는 그대로 두기 위해 이 페이지의 form/errorEl을 닫는 얇은 래퍼만 남긴다.)
  function showError(message, focusElement = null) {
    window.showFieldError(errorEl, message, focusElement);
  }

  function clearError() {
    window.clearFieldErrors(form, errorEl);
  }

  // 이메일/비밀번호/닉네임 각각의 규칙 자체는 profile.js와 공유하는 component.js 함수에 위임하고,
  // 여기서는 회원가입 폼 특유의 순서(이메일→비밀번호→닉네임)로 첫 실패만 골라 반환한다.
  function validateForm(emailInput, passwordInput, nicknameInput) {
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const nickname = nicknameInput.value;

    const emailValidation = window.validateEmailValue(email, emailInput);
    if (!emailValidation.isValid) return emailValidation;

    const passwordValidation = window.validateNewPasswordValue(password, passwordInput);
    if (!passwordValidation.isValid) return passwordValidation;

    const nicknameValidation = window.validateNicknameValue(nickname, nicknameInput);
    if (!nicknameValidation.isValid) return nicknameValidation;

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

      // 강도/유효성 판정 로직(window.getPasswordStrength)은 profile.js와 공유하고,
      // 빈 값일 때 즉시 "필수" 에러를 띄우는 회원가입 특유의 동작만 여기서 처리한다.
      const strength = window.getPasswordStrength(val);

      if (strength.level === 'empty') {
        showError(ERROR_MESSAGES.REQUIRED_PASSWORD, passwordInput);
        return;
      }

      strengthIndicator.classList.add('badge-visible');

      if (strength.level === 'invalid') {
        strengthIndicator.textContent = '사용 불가';
        strengthIndicator.classList.add('badge-invalid');
        const messageKey = strength.reason === 'whitespace' ? 'INVALID_PASSWORD_FORMAT'
          : strength.reason === 'tooShort' ? 'PASSWORD_TOO_SHORT'
          : 'PASSWORD_TOO_LONG';
        showError(ERROR_MESSAGES[messageKey], passwordInput);
        return;
      }

      // 위 필수 규칙을 모두 통과했다면 오류 메시지 제거
      clearPasswordError(passwordInput, inlineErrorEl);

      if (strength.level === 'weak') {
        strengthIndicator.textContent = '약함';
        strengthIndicator.classList.add('badge-weak');
      } else if (strength.level === 'medium') {
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
