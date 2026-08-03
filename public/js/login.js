document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const submitBtn = form ? form.querySelector('.btn-auth-submit') : null;

  const ERROR_MESSAGES = Object.freeze({
    REQUIRED_EMAIL: '이메일을 입력해주세요.',
    REQUIRED_PASSWORD: '비밀번호를 입력해주세요.',
    INVALID_EMAIL_OR_PASSWORD: '이메일 또는 비밀번호가 올바르지 않습니다.',
    INTERNAL_SERVER_ERROR: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
  });

  const formInputs = form ? Array.from(form.querySelectorAll('input')) : [];

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
      if (!errorEl) return;
      if (errorEl.textContent !== message) {
        errorEl.textContent = message;
      }
      errorEl.hidden = false;
      errorEl.setAttribute('aria-live', 'polite');
    }
  }

  function clearError() {
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
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

  function validateForm(emailInput, passwordInput) {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
      return { isValid: false, message: ERROR_MESSAGES.REQUIRED_EMAIL, element: emailInput };
    }
    if (!password) {
      return { isValid: false, message: ERROR_MESSAGES.REQUIRED_PASSWORD, element: passwordInput };
    }
    return { isValid: true };
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();

      const validation = validateForm(form.email, form.password);
      if (!validation.isValid) {
        showError(validation.message, validation.element);
        return;
      }

      const email = form.email.value.trim();
      const password = form.password.value;

      if (submitBtn) submitBtn.disabled = true;

      try {
        const result = await requestJson('/api/auth/login', {
          method: 'POST',
          body: { email, password }
        });

        if (result.code === 'LOGIN_SUCCESS') {
          localStorage.setItem('isLoggedIn', 'true');
          const redirectTarget = new URLSearchParams(window.location.search).get('redirect');
          let safeUrl = 'index.html';
          
          if (redirectTarget) {
            try {
              const decodedUrl = decodeURIComponent(redirectTarget);
              // Open Redirect 및 XSS 방어: 브라우저 URL 파서를 통해 백슬래시 우회 등을 원천 차단하고
              // 실제 해석되는 origin이 현재 사이트(window.location.origin)와 동일한지 엄격히 검증
              const parsedUrl = new URL(decodedUrl, window.location.origin);
              if (parsedUrl.origin === window.location.origin) {
                safeUrl = decodedUrl;
              }
            } catch (e) {
              // URL 파싱 실패(비정상적인 URL 등) 시 무시하고 기본값(index.html)으로 폴백
            }
          }
          
          window.location.href = safeUrl;
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
