const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const key = 'iksanstore:recentSearches:v1';
const component = fs.readFileSync(path.join(__dirname, '../public/js/component.js'), 'utf8');
const search = fs.readFileSync(path.join(__dirname, '../public/js/search.js'), 'utf8');

function page({ initial = [], readError = false, writeError = false, callback = true } = {}) {
  const storage = new Map([[key, JSON.stringify(initial)]]);
  const inputEvents = new Map(), submitEvents = new Map(), windowEvents = new Map();
  const ready = [], calls = [], loads = [], writes = [];
  const input = { value: '', blurCount: 0, blur() { this.blurCount++; },
    addEventListener(type, listener) { inputEvents.set(type, listener); } };
  const submit = { addEventListener(type, listener) { submitEvents.set(type, listener); } };
  const header = { innerHTML: '' };
  const context = {
    window: {
      location: { href: 'https://iksan.store/search?keyword=coffee', pathname: '/search', search: '?keyword=coffee' },
      history: { length: 2 },
      addEventListener(type, listener) {
        const handlers = windowEvents.get(type) || [];
        handlers.push(listener); windowEvents.set(type, handlers);
      },
    },
    document: {
      body: null,
      addEventListener(type, listener) { if (type === 'DOMContentLoaded') ready.push(listener); },
      querySelector(selector) { return selector === 'header.main-header' ? header : null; },
      getElementById(id) { return ({ 'search-page-input': input, 'search-page-submit': submit })[id] || null; },
    },
    localStorage: {
      getItem(name) { if (readError) throw Error('storage blocked'); return storage.get(name) || null; },
      setItem(name, value) { if (writeError) throw Error('quota'); storage.set(name, value); writes.push(value); },
    },
    console: { warn() {}, error() {} },
    URLSearchParams,
    history: { pushState(state, title, url) { context.window.location.search = new URL(url, 'https://iksan.store').search; } },
  };
  vm.createContext(context);
  vm.runInContext(component, context);
  if (callback) context.window.onSearchPageKeywordSubmit = keyword => calls.push(keyword);
  context.window.renderSearchHeader('coffee');
  return {
    context, storage, calls, loads, writes, input,
    keywords: () => JSON.parse(storage.get(key)),
    fire(type, value, composing = false) {
      input.value = value;
      let prevented = false;
      if (type === 'click') submitEvents.get('click')();
      else inputEvents.get('keydown')({ key: 'Enter', isComposing: composing, preventDefault() { prevented = true; } });
      return prevented;
    },
    startSearchPage() {
      // Execute the real search.js lifecycle with only the unrelated product loader stubbed.
      context.window.createProductListLoader = () => ({ load: (...args) => loads.push(args) });
      vm.runInContext(search, context);
      ready.at(-1)();
    },
    popstate() { for (const listener of windowEvents.get('popstate') || []) listener(); },
  };
}

for (const type of ['keydown', 'click']) {
  test(`result-header ${type} records a trimmed keyword once and submits the search`, () => {
    const p = page({ initial: ['커피'] });
    p.fire(type, '  빵  ');
    assert.deepEqual(p.keywords(), ['빵', '커피']);
    assert.deepEqual(p.calls, ['빵']);
    assert.equal(p.writes.length, 1);
    assert.equal(p.input.blurCount, 1);
    assert.equal(p.context.window.location.href, 'https://iksan.store/search?keyword=coffee');
  });
  test(`blank result-header ${type} neither records nor submits`, () => {
    const p = page({ initial: ['커피'] });
    p.fire(type, '   ');
    assert.deepEqual(p.keywords(), ['커피']);
    assert.equal(p.calls.length, 0);
    assert.equal(p.writes.length, 0);
  });
}

test('IME composition Enter does not record or submit; committed Enter does', () => {
  const p = page();
  assert.equal(p.fire('keydown', '빵', true), false);
  assert.equal(p.calls.length, 0);
  assert.equal(p.writes.length, 0);
  assert.equal(p.fire('keydown', '빵'), true);
  assert.deepEqual(p.keywords(), ['빵']);
  assert.deepEqual(p.calls, ['빵']);
});

test('result-header searches deduplicate, move to front, and retain at most ten', () => {
  const initial = Array.from({ length: 10 }, (_, i) => `상품${i}`);
  const p = page({ initial });
  p.fire('click', '상품5');
  assert.deepEqual(p.keywords(), ['상품5', ...initial.filter(item => item !== '상품5')]);
  p.fire('click', '새상품');
  assert.deepEqual(p.keywords(), ['새상품', '상품5', '상품0', '상품1', '상품2', '상품3', '상품4', '상품6', '상품7', '상품8']);
});

test('fallback without search callback still records exactly once and navigates', () => {
  const p = page({ callback: false });
  p.fire('click', '빵 & 커피');
  assert.deepEqual(p.keywords(), ['빵 & 커피']);
  assert.equal(p.writes.length, 1);
  assert.equal(p.context.window.location.href, `search.html?keyword=${encodeURIComponent('빵 & 커피')}`);
});

for (const option of ['readError', 'writeError']) {
  test(`result search still submits when storage throws (${option})`, () => {
    const p = page({ [option]: true });
    assert.doesNotThrow(() => p.fire('keydown', '커피'));
    assert.deepEqual(p.calls, ['커피']);
  });
}

test('malformed stored JSON does not prevent recording the next search', () => {
  const p = page();
  p.storage.set(key, '{broken');
  p.fire('click', '커피');
  assert.deepEqual(p.keywords(), ['커피']);
  assert.deepEqual(p.calls, ['커피']);
});

test('real search.js pushState submission records, but initial load and popstate do not', () => {
  const p = page({ initial: ['커피', '빵'] });
  p.startSearchPage();
  assert.equal(p.writes.length, 0);
  p.fire('click', '케이크');
  assert.deepEqual(p.keywords(), ['케이크', '커피', '빵']);
  assert.equal(p.context.window.location.search, `?keyword=${encodeURIComponent('케이크')}`);
  assert.equal(p.loads.at(-1)[0], '케이크');
  p.context.window.location.search = `?keyword=${encodeURIComponent('빵')}`;
  p.popstate();
  assert.equal(p.loads.at(-1)[0], '빵');
  assert.deepEqual(p.keywords(), ['케이크', '커피', '빵']);
  assert.equal(p.writes.length, 1);
});

test('existing shared navigation, individual deletion and clear-all remain compatible', () => {
  const p = page();
  p.context.navigateToSearch('커피');
  p.context.navigateToSearch('빵');
  assert.deepEqual(p.keywords(), ['빵', '커피']);
  p.context.removeRecentSearch('빵');
  assert.deepEqual(p.keywords(), ['커피']);
  p.context.clearRecentSearches();
  assert.deepEqual(p.keywords(), []);
});
