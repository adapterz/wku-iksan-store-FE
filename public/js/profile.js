// signup.js/login.js와 동일한 컨벤션: 화면별로 필요한 에러 코드만 모아 둔다.
const ERROR_MESSAGES = Object.freeze({
  // 닉네임 오류
  REQUIRED_NICKNAME: '닉네임을 입력해 주세요.',
  INVALID_NICKNAME_TYPE: '닉네임 입력값을 확인해주세요',
  INVALID_NICKNAME_FORMAT: '한글·영문·숫자만 사용할 수 있습니다.',
  NICKNAME_TOO_SHORT: '닉네임은 2자 이상 입력해 주세요.',
  NICKNAME_TOO_LONG: '닉네임은 8자 이하로 입력해 주세요',
  NICKNAME_ALREADY_EXISTS: '이미 사용 중인 닉네임입니다.',
  // 이메일 오류
  REQUIRED_EMAIL: '이메일을 입력해 주세요.',
  INVALID_EMAIL_TYPE: '이메일 입력값을 확인해 주세요.',
  INVALID_EMAIL_FORMAT: '이메일 형식을 확인해 주세요',
  EMAIL_TOO_LONG: '이메일이 너무 깁니다.',
  EMAIL_ALREADY_EXISTS: '이미 가입된 이메일 입니다.',
  // 비밀번호 오류
  REQUIRED_PASSWORD: '비밀번호를 입력해 주세요.',
  INVALID_PASSWORD_TYPE: '비밀번호 입력값을 확인해주세요.',
  INVALID_PASSWORD_FORMAT: '비밀번호에는 공백을 사용할 수 없습니다.',
  PASSWORD_TOO_SHORT: '비밀번호는 8자 이상 입력해 주세요',
  PASSWORD_TOO_LONG: '비밀번호는 15자 이하로 입력해주세요',
  COMMON_PASSWORD: '다른 비밀번호를 사용해 주세요.',
  INVALID_PASSWORD: '비밀번호가 일치하지 않습니다.',
  // 계정 삭제 오류
  ACCOUNT_HAS_UNUSED_GIFTS: '미사용 선물이 남아있어 계정을 삭제할 수 없습니다.',
  // 공통 오류
  UNAUTHORIZED: '로그인이 필요합니다.',
  NETWORK_ERROR: '네트워크 연결을 확인해 주세요.',
  INVALID_JSON_RESPONSE: '서버 응답을 처리할 수 없습니다.',
  INTERNAL_SERVER_ERROR: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
});

// form 범위 안에서만 동작하는 에러 표시/초기화 헬퍼 (여러 form이 서로의 에러를 건드리지 않도록 분리)
function showFormError(globalErrorEl, message, focusElement = null) {
  if (focusElement) {
    const parentGroup = focusElement.closest('.form-group');
    const inlineErrorEl = parentGroup ? parentGroup.querySelector('.auth-error') : null;
    if (inlineErrorEl) {
      inlineErrorEl.textContent = message;
      inlineErrorEl.hidden = false;
      inlineErrorEl.setAttribute('aria-live', 'polite');
    }
    focusElement.setAttribute('aria-invalid', 'true');
    if (document.activeElement !== focusElement) {
      focusElement.focus();
    }
  } else if (globalErrorEl) {
    globalErrorEl.textContent = message;
    globalErrorEl.hidden = false;
    globalErrorEl.setAttribute('aria-live', 'polite');
  }
}

function clearFormError(form, globalErrorEl) {
  if (globalErrorEl) {
    globalErrorEl.hidden = true;
    globalErrorEl.textContent = '';
  }
  Array.from(form.querySelectorAll('input')).forEach((input) => {
    input.removeAttribute('aria-invalid');
    const parentGroup = input.closest('.form-group');
    const inlineErrorEl = parentGroup ? parentGroup.querySelector('.auth-error') : null;
    if (inlineErrorEl) {
      inlineErrorEl.hidden = true;
      inlineErrorEl.textContent = '';
    }
  });
}

function validateNicknameValue(nickname, nicknameInput) {
  if (!nickname) {
    return { isValid: false, message: ERROR_MESSAGES.REQUIRED_NICKNAME, element: nicknameInput };
  }
  if (/\s/.test(nickname)) {
    return { isValid: false, message: ERROR_MESSAGES.INVALID_NICKNAME_FORMAT, element: nicknameInput };
  }
  if (nickname.length < 2) {
    return { isValid: false, message: ERROR_MESSAGES.NICKNAME_TOO_SHORT, element: nicknameInput };
  }
  if (nickname.length > 8) {
    return { isValid: false, message: ERROR_MESSAGES.NICKNAME_TOO_LONG, element: nicknameInput };
  }
  if (!/^[가-힣a-zA-Z0-9]+$/.test(nickname)) {
    return { isValid: false, message: ERROR_MESSAGES.INVALID_NICKNAME_FORMAT, element: nicknameInput };
  }
  return { isValid: true };
}

function validateEmailValue(email, emailInput) {
  if (!email) {
    return { isValid: false, message: ERROR_MESSAGES.REQUIRED_EMAIL, element: emailInput };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { isValid: false, message: ERROR_MESSAGES.INVALID_EMAIL_FORMAT, element: emailInput };
  }
  if (email.length > 255) {
    return { isValid: false, message: ERROR_MESSAGES.EMAIL_TOO_LONG, element: emailInput };
  }
  return { isValid: true };
}

function validateNewPasswordValue(password, passwordInput) {
  if (!password) {
    return { isValid: false, message: ERROR_MESSAGES.REQUIRED_PASSWORD, element: passwordInput };
  }
  if (/\s/.test(password)) {
    return { isValid: false, message: ERROR_MESSAGES.INVALID_PASSWORD_FORMAT, element: passwordInput };
  }
  if (password.length < 8) {
    return { isValid: false, message: ERROR_MESSAGES.PASSWORD_TOO_SHORT, element: passwordInput };
  }
  if (password.length > 15) {
    return { isValid: false, message: ERROR_MESSAGES.PASSWORD_TOO_LONG, element: passwordInput };
  }
  return { isValid: true };
}

document.addEventListener('DOMContentLoaded', async () => {
  // 인증 확인 및 현재 값(닉네임/이메일) 프리필. 성공 시 true, 실패(리다이렉트 처리됨) 시 false를 반환한다.
  async function checkAuthAndLoadUserData() {
    try {
      const resData = await requestJson('/api/auth/me');
      if (!resData || !resData.data) {
        return false;
      }

      const user = resData.data;
      const nicknameInput = document.getElementById('nickname');
      const emailInput = document.getElementById('email');
      if (nicknameInput) nicknameInput.value = user.nickname || '';
      if (emailInput) emailInput.value = user.email || '';

      document.body.style.visibility = 'visible';
      document.body.style.opacity = '1';
      return true;
    } catch (error) {
      console.error('사용자 정보를 불러오지 못했습니다:', error);
      alert('사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return false;
    }
  }

  const isAuthenticated = await window.registerBfcacheRevalidation(checkAuthAndLoadUserData);
  if (!isAuthenticated) {
    return;
  }

  // 비밀번호 실시간 강도 검사 (signup.js와 동일한 규칙)
  const newPasswordInput = document.getElementById('new-password');
  const strengthIndicator = document.getElementById('new-password-strength');
  if (newPasswordInput && strengthIndicator) {
    newPasswordInput.addEventListener('input', (e) => {
      const val = e.target.value;
      const parentGroup = newPasswordInput.closest('.form-group');
      const inlineErrorEl = parentGroup ? parentGroup.querySelector('.auth-error') : null;

      strengthIndicator.classList.remove('badge-visible', 'badge-invalid', 'badge-weak', 'badge-medium', 'badge-strong');

      if (!val) {
        strengthIndicator.classList.remove('badge-visible');
        if (inlineErrorEl) {
          inlineErrorEl.hidden = true;
          inlineErrorEl.textContent = '';
        }
        newPasswordInput.removeAttribute('aria-invalid');
        return;
      }

      strengthIndicator.classList.add('badge-visible');

      if (/\s/.test(val) || val.length < 8 || val.length > 15) {
        strengthIndicator.textContent = '사용 불가';
        strengthIndicator.classList.add('badge-invalid');
        return;
      }

      if (inlineErrorEl) {
        inlineErrorEl.hidden = true;
        inlineErrorEl.textContent = '';
      }
      newPasswordInput.removeAttribute('aria-invalid');

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

  // 닉네임 변경
  const nicknameForm = document.getElementById('nickname-form');
  const nicknameFormError = document.getElementById('nickname-form-error');
  if (nicknameForm) {
    nicknameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError(nicknameForm, nicknameFormError);

      const nickname = nicknameForm.nickname.value.trim();
      const validation = validateNicknameValue(nickname, nicknameForm.nickname);
      if (!validation.isValid) {
        showFormError(nicknameFormError, validation.message, validation.element);
        return;
      }

      const submitBtn = nicknameForm.querySelector('.btn-auth-submit');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const result = await requestJson('/api/users/me/nickname', {
          method: 'PATCH',
          body: { nickname }
        });
        const displayNicknameEl = document.getElementById('display-nickname');
        if (displayNicknameEl && result.data) displayNicknameEl.textContent = result.data.nickname;
        alert('닉네임이 변경되었습니다.');
      } catch (error) {
        console.error('닉네임 변경 실패:', error);
        const target = error.code === 'NICKNAME_ALREADY_EXISTS' ? nicknameForm.nickname : null;
        showFormError(nicknameFormError, ERROR_MESSAGES[error.code] || ERROR_MESSAGES.INTERNAL_SERVER_ERROR, target);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // 이메일 변경
  const emailForm = document.getElementById('email-form');
  const emailFormError = document.getElementById('email-form-error');
  if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError(emailForm, emailFormError);

      const email = emailForm.email.value.trim().toLowerCase();
      const password = emailForm.password.value;

      const emailValidation = validateEmailValue(email, emailForm.email);
      if (!emailValidation.isValid) {
        showFormError(emailFormError, emailValidation.message, emailValidation.element);
        return;
      }
      if (!password) {
        showFormError(emailFormError, ERROR_MESSAGES.REQUIRED_PASSWORD, emailForm.password);
        return;
      }

      const submitBtn = emailForm.querySelector('.btn-auth-submit');
      if (submitBtn) submitBtn.disabled = true;

      try {
        await requestJson('/api/users/me/email', {
          method: 'PATCH',
          body: { email, password }
        });
        emailForm.password.value = '';
        alert('이메일이 변경되었습니다.');
      } catch (error) {
        console.error('이메일 변경 실패:', error);
        const target = error.code === 'EMAIL_ALREADY_EXISTS' ? emailForm.email
          : error.code === 'INVALID_PASSWORD' ? emailForm.password
          : null;
        showFormError(emailFormError, ERROR_MESSAGES[error.code] || ERROR_MESSAGES.INTERNAL_SERVER_ERROR, target);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // 비밀번호 변경
  const passwordForm = document.getElementById('password-form');
  const passwordFormError = document.getElementById('password-form-error');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError(passwordForm, passwordFormError);

      const currentPassword = passwordForm.currentPassword.value;
      const newPassword = passwordForm.newPassword.value;

      if (!currentPassword) {
        showFormError(passwordFormError, ERROR_MESSAGES.REQUIRED_PASSWORD, passwordForm.currentPassword);
        return;
      }
      const newPasswordValidation = validateNewPasswordValue(newPassword, passwordForm.newPassword);
      if (!newPasswordValidation.isValid) {
        showFormError(passwordFormError, newPasswordValidation.message, newPasswordValidation.element);
        return;
      }

      const submitBtn = passwordForm.querySelector('.btn-auth-submit');
      if (submitBtn) submitBtn.disabled = true;

      try {
        await requestJson('/api/users/me/password', {
          method: 'PATCH',
          body: { currentPassword, newPassword }
        });
        passwordForm.reset();
        if (strengthIndicator) strengthIndicator.classList.remove('badge-visible');
        alert('비밀번호가 변경되었습니다.');
      } catch (error) {
        console.error('비밀번호 변경 실패:', error);
        const target = error.code === 'INVALID_PASSWORD' ? passwordForm.currentPassword : null;
        showFormError(passwordFormError, ERROR_MESSAGES[error.code] || ERROR_MESSAGES.INTERNAL_SERVER_ERROR, target);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // 계정 삭제
  const deleteForm = document.getElementById('delete-account-form');
  const deleteFormError = document.getElementById('delete-account-error');
  if (deleteForm) {
    deleteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError(deleteForm, deleteFormError);

      const password = deleteForm.password.value;
      if (!password) {
        showFormError(deleteFormError, ERROR_MESSAGES.REQUIRED_PASSWORD, deleteForm.password);
        return;
      }

      if (!window.confirm('정말 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
        return;
      }

      const submitBtn = deleteForm.querySelector('.btn-auth-submit');
      if (submitBtn) submitBtn.disabled = true;

      try {
        await requestJson('/api/users/me', {
          method: 'DELETE',
          body: { password }
        });
        localStorage.removeItem('isLoggedIn');
        window._wishlistCache = null;
        window._wishlistFetchPromise = null;
        alert('계정이 삭제되었습니다.');
        window.location.href = 'login.html';
      } catch (error) {
        console.error('계정 삭제 실패:', error);
        const target = error.code === 'INVALID_PASSWORD' ? deleteForm.password : null;
        showFormError(deleteFormError, ERROR_MESSAGES[error.code] || ERROR_MESSAGES.INTERNAL_SERVER_ERROR, target);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
});
