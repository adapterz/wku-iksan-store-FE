const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
const scripts = ['api.js', 'component.js', 'profile.js'].map(source);
const generic = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
const retry = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
const relogin = '인증 정보가 변경되었습니다. 다시 로그인해 주세요.';

// 실제 api/component/profile 스크립트와 폼 이벤트를 실행한다.
// 없는 요소는 null이며, 공통 헤더/찜/알림 초기화는 이 폼 테스트에서 실행하지 않는다.
async function setup(response) {
  const elements = new Map();
  const ready = [];
  const calls = [];
  const alerts = [];
  const timers = [];
  const redirects = [];
  const document = {
    body: null,
    activeElement: null,
    addEventListener(type, fn) { if (type === 'DOMContentLoaded') ready.push(fn); },
    getElementById: id => elements.get(id) || null,
  };
  function element() {
    return {
      value: '', textContent: '', hidden: true, disabled: false, style: {},
      attributes: {}, events: {}, classList: { add() {}, remove() {} },
      setAttribute(key, value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; },
      addEventListener(type, fn) { this.events[type] = fn; },
      focus() { document.activeElement = this; },
    };
  }
  const forms = {};
  for (const [name, fields] of Object.entries({
    nickname: ['nickname'], email: ['email', 'password'],
    password: ['currentPassword', 'newPassword'], 'delete-account': ['password'],
  })) {
    const form = element();
    form.button = element();
    form.inputs = fields.map(field => {
      const input = element();
      input.inline = element();
      input.closest = () => ({ querySelector: () => input.inline });
      form[field] = input;
      return input;
    });
    form.querySelector = selector => selector === '.btn-auth-submit' ? form.button : null;
    form.querySelectorAll = selector => selector === 'input' ? form.inputs : [];
    form.reset = () => form.inputs.forEach(input => { input.value = ''; });
    form.error = element();
    forms[name] = form;
    elements.set(`${name}-form`, form);
    elements.set(`${name}-form-error`, form.error);
  }
  elements.set('nickname', forms.nickname.nickname);
  elements.set('email', forms.email.email);
  elements.set('global-toast', element());
  const context = {
    document, URL, URLSearchParams,
    console: { error() {}, log() {} },
    addEventListener() {},
    location: { pathname: '/profile', href: 'http://localhost/profile', replace: url => redirects.push(url) },
    localStorage: { getItem: () => 'true', removeItem() {} },
    alert: message => alerts.push(message), confirm: () => true,
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => ({ data: { userId: 1, nickname: 'QA', email: 'qa@example.test' } }) };
      if (response.network) throw new Error('offline');
      return { ok: response.status < 400, status: response.status, json: async () => ({ code: response.code, message: 'server-only diagnostic', data: response.data }) };
    },
  };
  context.window = context;
  vm.createContext(context);
  scripts.forEach((code, index) => vm.runInContext(code, context, { filename: ['api.js', 'component.js', 'profile.js'][index] }));
  document.body = { style: {} };
  await ready.at(-1)(); // profile.js의 DOMContentLoaded만 실행
  forms.nickname.nickname.value = '새이름';
  forms.email.email.value = 'next@example.test';
  forms.email.password.value = 'TestOnly123!';
  forms.password.currentPassword.value = 'TestOnly123!';
  forms.password.newPassword.value = 'NextOnly123!';
  forms['delete-account'].password.value = 'TestOnly123!';
  return {
    forms, calls, alerts, timers, redirects, elements,
    async submit(name) { await forms[name].events.submit({ preventDefault() {} }); },
  };
}

test('password 409 shows persistent re-login guidance and clears passwords without redirecting', async () => {
  const h = await setup({ status: 409, code: 'PASSWORD_CHANGE_CONFLICT' });
  await h.submit('password');
  const form = h.forms.password;
  assert.equal(form.error.textContent, relogin);
  assert.equal(form.error.hidden, false);
  assert.equal(form.error.attributes['aria-live'], 'polite');
  assert.equal(form.currentPassword.value, '');
  assert.equal(form.newPassword.value, '');
  assert.equal(form.button.disabled, false);
  assert.equal(h.timers.length, 0);
  assert.equal(h.redirects.length, 0);
  assert.equal(h.calls.at(-1).url, '/api/users/me/password');
});

for (const name of ['nickname', 'email', 'password', 'delete-account']) {
  test(`${name} 429 shows retry guidance through the existing form/popup`, async () => {
    const h = await setup({ status: 429, code: 'TOO_MANY_REQUESTS' });
    await h.submit(name);
    if (name === 'delete-account') assert.deepEqual(h.alerts, [retry]);
    else {
      assert.equal(h.forms[name].error.textContent, retry);
      assert.equal(h.forms[name].error.hidden, false);
    }
    assert.equal(h.forms[name].button.disabled, false);
    assert.equal(h.timers.length, 0); // 자동 재요청/강제 로그아웃 없음
    assert.equal(h.calls.length, 2); // 인증 확인 + 제출 한 번
  });
}

test('unknown server code retains generic fallback instead of exposing arbitrary server text', async () => {
  const h = await setup({ status: 500, code: 'UNKNOWN_ERROR' });
  await h.submit('password');
  assert.equal(h.forms.password.error.textContent, generic);
});

test('wrong password still uses the existing field-specific guidance', async () => {
  const h = await setup({ status: 403, code: 'INVALID_PASSWORD' });
  await h.submit('password');
  assert.equal(h.forms.password.currentPassword.inline.textContent, '비밀번호가 일치하지 않습니다.');
  assert.equal(h.forms.password.error.hidden, true);
});

test('network failure retains network guidance', async () => {
  const h = await setup({ network: true });
  await h.submit('password');
  assert.equal(h.forms.password.error.textContent, '네트워크 연결을 확인해 주세요.');
  assert.equal(h.forms.password.button.disabled, false);
});

test('session 401 retains existing login redirection without form success or new error', async () => {
  const h = await setup({ status: 401, code: 'UNAUTHORIZED' });
  await h.submit('password');
  assert.equal(h.forms.password.error.hidden, true);
  assert.equal(h.elements.get('global-toast').textContent, '로그인이 필요한 서비스입니다.');
  assert.equal(h.timers.length, 1);
  h.timers[0]();
  assert.match(h.redirects[0], /^\/login(?:\.html)?\?redirect=/);
});

test('successful password submission retains success message and clears the form', async () => {
  const h = await setup({ status: 200, code: 'PASSWORD_UPDATED' });
  await h.submit('password');
  assert.equal(h.elements.get('global-toast').textContent, '비밀번호가 변경되었습니다.');
  assert.equal(h.forms.password.error.hidden, true);
  assert.equal(h.forms.password.currentPassword.value, '');
  assert.equal(h.forms.password.newPassword.value, '');
  assert.equal(h.forms.password.button.disabled, false);
});
