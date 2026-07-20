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
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (response.ok && result.code === 'LOGIN_SUCCESS') {
          const redirectTarget = new URLSearchParams(window.location.search).get('redirect');
          window.location.href = redirectTarget ? decodeURIComponent(redirectTarget) : 'index.html';
          return;
        }

        showError(ERROR_MESSAGES[result.code] || '로그인에 실패했습니다.');
      } catch (error) {
        console.error('로그인 요청 실패:', error);
        showError(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Search Overlay Open/Close Logic (공통 UI, home.js와 동일 패턴)
  const searchOpenBtn = document.getElementById('btn-search-open');
  const searchCloseBtn = document.getElementById('btn-search-close');
  const searchOverlay = document.getElementById('search-overlay');
  const searchInput = searchOverlay ? searchOverlay.querySelector('.search-overlay-input') : null;

  if (searchOpenBtn && searchCloseBtn && searchOverlay) {
    searchOpenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      searchOverlay.classList.add('open');
      if (searchInput) {
        setTimeout(() => searchInput.focus(), 50);
      }
    });

    searchCloseBtn.addEventListener('click', () => {
      searchOverlay.classList.remove('open');
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
