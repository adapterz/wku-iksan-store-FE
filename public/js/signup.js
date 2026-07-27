document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signup-form');
  const errorEl = document.getElementById('signup-error');
  const submitBtn = form ? form.querySelector('.btn-auth-submit') : null;

  const ERROR_MESSAGES = {
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
  };

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      clearError();

      const email = form.email.value.trim();
      const password = form.password.value;
      const nickname = form.nickname.value.trim();

      if (submitBtn) submitBtn.disabled = true;

      try {
        const result = await requestJson('/api/auth/signup', {
          method: 'POST',
          body: { email, password, nickname }
        });

        if (result.code === 'SIGNUP_SUCCESS') {
          alert('회원가입이 완료되었습니다. 로그인해주세요.');
          window.location.href = 'login.html';
          return;
        }

        showError(ERROR_MESSAGES[result.code] || '회원가입에 실패했습니다.');
      } catch (error) {
        console.error('회원가입 요청 실패:', error);
        showError(ERROR_MESSAGES[error.code] || ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
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
