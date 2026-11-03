const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const component = fs.readFileSync(path.join(__dirname, '../public/js/component.js'), 'utf8');

// loadPopularKeywords()는 component.js 최상단(DOMContentLoaded 밖)에 선언돼 있어 recent-searches.test.cjs와
// 같은 최소 vm 컨텍스트로 직접 호출할 수 있다. 렌더링(DOM 생성, 클릭 시 navigateToSearch 호출)은 같은 파일의
// renderRecentSearches()처럼 DOMContentLoaded 클로저 안에 있어 이 테스트 스타일로는 다루지 않는다.
function page({ response, throwError = false } = {}) {
  const calls = [];
  const context = {
    window: { location: { href: '' } },
    document: { addEventListener() {}, getElementById() { return null; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    console: { warn() {}, error() {} },
    requestJson(path) {
      calls.push(path);
      if (throwError) return Promise.reject(new Error('network error'));
      return Promise.resolve(response);
    },
  };
  vm.createContext(context);
  vm.runInContext(component, context);
  return { context, calls };
}

test('loadPopularKeywords returns data and caches it across repeated calls', async () => {
  const data = [{ rank: 1, keyword: '나이키' }, { rank: 2, keyword: '가방' }];
  const p = page({ response: { data, meta: { computedAt: '2026-11-02T00:00:00.000Z' } } });

  assert.deepEqual(await p.context.loadPopularKeywords(), data);
  assert.deepEqual(await p.context.loadPopularKeywords(), data);
  assert.equal(p.calls.length, 1);
  assert.deepEqual(p.calls, ['/api/products/popular-keywords']);
});

test('loadPopularKeywords returns an empty array when the response has no data', async () => {
  const p = page({ response: { data: [], meta: { computedAt: '2026-11-02T00:00:00.000Z' } } });
  assert.deepEqual(await p.context.loadPopularKeywords(), []);
});

test('loadPopularKeywords tolerates a malformed response (missing data field)', async () => {
  const p = page({ response: {} });
  // vm 컨텍스트 안에서 생성된 빈 배열이라 메인 리얼름의 []와 참조/프로토타입이 달라 deepEqual 대신 length로 확인한다.
  assert.equal((await p.context.loadPopularKeywords()).length, 0);
});

test('loadPopularKeywords swallows request failures and retries on the next call', async () => {
  const p = page({ throwError: true });
  assert.equal((await p.context.loadPopularKeywords()).length, 0);
  assert.equal((await p.context.loadPopularKeywords()).length, 0);
  // 실패 응답은 캐시하지 않으므로 다음 호출에서 다시 요청한다.
  assert.equal(p.calls.length, 2);
});

test('loadPopularKeywords started twice before the first resolves shares one request', async () => {
  // 응답이 오기 전에 오버레이를 닫았다 다시 열어 동시에 호출되는 상황을 재현한다.
  const data = [{ rank: 1, keyword: '나이키' }];
  const p = page({ response: { data, meta: { computedAt: '2026-11-02T00:00:00.000Z' } } });

  const [first, second] = await Promise.all([
    p.context.loadPopularKeywords(),
    p.context.loadPopularKeywords(),
  ]);
  assert.deepEqual(first, data);
  assert.deepEqual(second, data);
  assert.equal(p.calls.length, 1);
});
