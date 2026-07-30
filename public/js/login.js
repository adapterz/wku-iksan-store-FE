document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const submitBtn = form ? form.querySelector('.btn-auth-submit') : null;

  const ERROR_MESSAGES = {
    REQUIRED_EMAIL: '이메일을 입력해주세요.',
    REQUIRED_PASSWORD: '비밀번호를 입력해주세요.',
    INVALID_EMAIL_OR_PASSWORD: '이메일 또는 비밀번호가 올바르지 않습니다.',
    INTERNAL_SERVER_ERROR: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
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

      if (submitBtn) submitBtn.disabled = true;

      try {
        const result = await requestJson('/api/auth/login', {
          method: 'POST',
          body: { email, password }
        });

        if (result.code === 'LOGIN_SUCCESS') {
          const redirectTarget = new URLSearchParams(window.location.search).get('redirect');
          window.location.href = redirectTarget ? decodeURIComponent(redirectTarget) : 'index.html';
          return;
        }

        showError(ERROR_MESSAGES[result.code] || '로그인에 실패했습니다.');
      } catch (error) {
        console.error('로그인 요청 실패:', error);
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
