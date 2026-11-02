const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 실제 완료 화면 렌더러를 실행하되 API 호출과 주문 생성은 하지 않는다.
function element() {
  return {
    hidden: false, style: {}, innerHTML: '', children: [],
    get textContent() { return this._text || ''; },
    set textContent(value) { this._text = value; this.children = []; },
    appendChild(child) { this.children.push(child); this._text = this.textContent + child.textContent; },
    replaceChildren(...children) { this.children = children; },
    removeAttribute() {}, querySelector() { return null; }, cloneNode() { return element(); }
  };
}

function page() {
  const ids = ['complete-title', 'self-badge', 'gift-summary', 'gift-items-container', 'gift-item-card', 'gift-valid-period'];
  const elements = new Map(ids.map(id => [id, element()]));
  const context = vm.createContext({ document: {
    addEventListener() {}, getElementById: id => elements.get(id) || null,
    createElement: element, createTextNode: text => ({ textContent: text })
  } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/complete.js'), 'utf8'), context);
  return { elements, render: context.renderCompletePage, map: context.mapOrderGroupToOrderView };
}

const expected = '발급일로부터 1년 이내에 사용 가능';
for (const validPeriod of ['발급일로부터 90일', '1년', '', null, undefined]) {
  test(`single order uses common policy instead of product text: ${String(validPeriod)}`, () => {
    const p = page();
    const order = { isSelfGift: true, product: { id: 1, validPeriod }, totalPrice: 4500 };
    const original = JSON.stringify(order);
    p.render(order);
    assert.equal(p.elements.get('gift-valid-period').textContent, expected);
    assert.equal(JSON.stringify(order), original);
  });
}

for (const items of [[{ id: 1, quantity: 1 }], [{ id: 1, quantity: 3 }], [{ id: 1, quantity: 1, validPeriod: '90일' }, { id: 2, quantity: 2, validPeriod: '30일' }]]) {
  test(`group policy remains consistent: ${JSON.stringify(items)}`, () => {
    const p = page();
    p.render(p.map({ isSelfGift: false, receiver: { nickname: '친구' }, items, totalPrice: 13500 }));
    const period = p.elements.get('gift-valid-period');
    assert.equal(period.textContent, expected);
    assert.equal(period.children[1].textContent, '1년', 'period emphasis is preserved');
  });
}

test('re-render from single to group replaces old validity text without duplicate nodes', () => {
  const p = page();
  p.render({ isSelfGift: true, product: { id: 1, validPeriod: '90일' } });
  p.render(p.map({ isSelfGift: true, items: [{ id: 2, quantity: 2 }] }));
  assert.equal(p.elements.get('gift-valid-period').textContent, expected);
  assert.equal(p.elements.get('gift-valid-period').children.length, 3);
});

test('initial HTML and JS render use the same common policy', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/complete.html'), 'utf8');
  const initial = html.match(/id="gift-valid-period">([\s\S]*?)<\/div>/)[1].replace(/<[^>]+>/g, '');
  assert.equal(initial, expected);
});
