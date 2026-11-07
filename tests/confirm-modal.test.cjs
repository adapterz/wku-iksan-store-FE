const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/confirm-modal.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// 확인창이 쓰는 만큼만 흉내 낸 DOM: innerHTML에 적힌 id를 가진 자식을 만들어 getElementById로 찾게 한다.
function setup() {
  const byId = new Map();
  const doc = { activeElement: null, listeners: new Map() };
  function element(tag = 'div') {
    const listeners = new Map(), classes = new Set();
    let html = '';
    const el = {
      tag, textContent: '', isConnected: false, listeners,
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
      get innerHTML() { return html; },
      set innerHTML(value) {
        html = value;
        for (const [, id] of value.matchAll(/id="([^"]+)"/g)) {
          const child = element();
          child.id = id;
          child.isConnected = true;
          byId.set(id, child);
        }
      },
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      fire(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn({ target: el, preventDefault() {}, ...event }); },
      // 실제 브라우저처럼 잠긴(disabled) 요소에는 포커스가 들어가지 않는다.
      focus() { if (!el.disabled) doc.activeElement = el; }
    };
    return el;
  }
  const appended = [];
  Object.assign(doc, {
    body: { appendChild(child) { child.isConnected = true; appended.push(child); if (child.id) byId.set(child.id, child); return child; } },
    createElement: element,
    getElementById: id => byId.get(id) || null,
    addEventListener(type, fn) { if (!doc.listeners.has(type)) doc.listeners.set(type, new Set()); doc.listeners.get(type).add(fn); },
    removeEventListener(type, fn) { doc.listeners.get(type)?.delete(fn); },
    key(key) {
      const event = { key, prevented: false, preventDefault() { event.prevented = true; } };
      for (const fn of [...(doc.listeners.get('keydown') || [])]) fn(event);
      return event;
    }
  });
  const window = {};
  vm.runInContext(source, vm.createContext({ window, document: doc, setTimeout }));
  const opener = element('button');
  opener.isConnected = true;
  opener.focus();
  const $ = id => byId.get(id);
  return { window, doc, opener, appended, $, modal: () => $('confirm-modal') };
}

const options = { title: '이 교환권을 취소할까요?', message: '첫 줄\n둘째 줄', confirmText: '취소하기', cancelText: '닫기' };

test('확인창을 열면 문구와 버튼 글자를 넣고, 바로 실행되지 않게 닫기 버튼에 포커스를 둔다', async () => {
  const t = setup();
  t.window.showConfirmModal(options);
  assert.equal(t.modal().classList.contains('open'), true);
  assert.match(t.modal().innerHTML, /role="dialog" aria-modal="true"/);
  assert.equal(t.$('confirm-modal-title').textContent, '이 교환권을 취소할까요?');
  assert.equal(t.$('confirm-modal-message').textContent, '첫 줄\n둘째 줄');
  assert.equal(t.$('confirm-modal-ok').textContent, '취소하기');
  assert.equal(t.$('confirm-modal-cancel').textContent, '닫기');
  assert.equal(t.doc.activeElement, t.$('confirm-modal-cancel'));
});

test('확인 버튼은 true로 끝내고 확인창을 닫은 뒤 연 버튼으로 포커스를 돌려준다', async () => {
  const t = setup();
  const result = t.window.showConfirmModal(options);
  t.$('confirm-modal-ok').fire('click');
  assert.equal(await result, true);
  assert.equal(t.modal().classList.contains('open'), false);
  await tick();
  assert.equal(t.doc.activeElement, t.opener);
  // 끝난 뒤 남은 리스너가 다음 확인창의 결과를 건드리지 않는다.
  assert.equal(t.$('confirm-modal-ok').listeners.get('click').size, 0);
  assert.equal(t.doc.listeners.get('keydown').size, 0);
});

test('닫기, 바깥 클릭, Esc는 모두 false로 끝낸다', async () => {
  for (const close of [
    t => t.$('confirm-modal-cancel').fire('click'),
    t => t.modal().fire('click'),
    t => assert.equal(t.doc.key('Escape').prevented, true)
  ]) {
    const t = setup();
    const result = t.window.showConfirmModal(options);
    close(t);
    assert.equal(await result, false);
    assert.equal(t.modal().classList.contains('open'), false);
  }
});

test('확인창 안쪽을 누르는 것은 바깥 클릭으로 보지 않는다', async () => {
  const t = setup();
  let settled = false;
  t.window.showConfirmModal(options).then(() => { settled = true; });
  t.modal().fire('click', { target: t.$('confirm-modal-title') });
  await flush();
  assert.equal(settled, false);
  assert.equal(t.modal().classList.contains('open'), true);
});

test('Tab은 확인창의 두 버튼 사이만 오간다', () => {
  const t = setup();
  t.window.showConfirmModal(options);
  assert.equal(t.doc.key('Tab').prevented, true);
  assert.equal(t.doc.activeElement, t.$('confirm-modal-ok'));
  t.doc.key('Tab');
  assert.equal(t.doc.activeElement, t.$('confirm-modal-cancel'));
});

test('closeConfirmModal은 열린 확인창을 false로 끝내고, 열린 것이 없으면 아무 일도 하지 않는다', async () => {
  const t = setup();
  t.window.closeConfirmModal();
  const result = t.window.showConfirmModal(options);
  t.window.closeConfirmModal();
  assert.equal(await result, false);
  assert.equal(t.modal().classList.contains('open'), false);
});

test('새 확인창을 열면 이전 확인창은 false로 끝나고, 마크업은 한 번만 만든다', async () => {
  const t = setup();
  const first = t.window.showConfirmModal(options);
  const second = t.window.showConfirmModal({ ...options, title: '선물을 사용하시겠습니까?' });
  assert.equal(await first, false);
  assert.equal(t.modal().classList.contains('open'), true);
  assert.equal(t.$('confirm-modal-title').textContent, '선물을 사용하시겠습니까?');
  t.$('confirm-modal-ok').fire('click');
  assert.equal(await second, true);
  assert.equal(t.appended.length, 1);
});

test('문구는 textContent로 넣어 HTML로 해석되지 않는다', () => {
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\b(title|message)\b/);
  assert.match(source, /'confirm-modal-message'\)\.textContent = message/);
});

test('열기 전에 잠근 버튼을 returnFocusTo로 넘기면, 호출한 쪽이 잠금을 푼 뒤 그 버튼으로 포커스를 돌려준다', async () => {
  const t = setup();
  const button = t.opener;
  button.disabled = true; // 확인창을 열기 전에 잠근 상태 — 실제 브라우저에서는 이때 포커스를 잃는다
  t.doc.activeElement = null;
  const result = t.window.showConfirmModal({ ...options, returnFocusTo: button });
  t.doc.key('Escape');
  assert.equal(await result, false);
  button.disabled = false; // 호출한 쪽이 결과를 받고 잠금을 푼다
  await tick();
  assert.equal(t.doc.activeElement, button);
});

test('이전 확인창의 포커스 복귀가 새로 열린 확인창의 포커스를 빼앗지 않는다', async () => {
  const t = setup();
  t.window.showConfirmModal(options);
  t.window.showConfirmModal(options);
  await tick();
  assert.equal(t.doc.activeElement, t.$('confirm-modal-cancel'));
});
