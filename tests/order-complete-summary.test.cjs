const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 실제 complete.js를 실행한다. API/주문 생성 없이 렌더링에 필요한 DOM만 제공한다.
function element() {
  return {
    hidden: false, textContent: '', innerHTML: '', style: {}, children: [],
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    removeAttribute() {},
    querySelector() { return null; },
    cloneNode() { return element(); }
  };
}

function page() {
  const elements = new Map(['complete-title', 'self-badge', 'gift-summary', 'gift-items-container', 'gift-item-card', 'gift-valid-period']
    .map(id => [id, element()]));
  const context = vm.createContext({
    document: {
      addEventListener() {},
      getElementById: id => elements.get(id) || null,
      createElement: element,
      createTextNode: text => ({ textContent: text })
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/complete.js'), 'utf8'), context);
  return { elements, render: context.renderCompletePage, mapGroup: context.mapOrderGroupToOrderView };
}

const product = { id: 76, name: '아메리카노', price: 99000, validPeriod: '발급일로부터 90일' };

for (const entry of [
  { name: 'legacy single order', order: { product, quantity: 1, totalPrice: 4500 }, expected: '총 1종 · 교환권 1개 · 4,500원' },
  { name: 'legacy response without quantity', order: { product, totalPrice: 4500 }, expected: '총 1종 · 교환권 1개 · 4,500원' },
  { name: 'single product group with one voucher', group: true, order: { items: [{ ...product, quantity: 1 }], totalQuantity: 1, totalPrice: 4500 }, expected: '총 1종 · 교환권 1개 · 4,500원' },
  { name: 'single product group with multiple vouchers', group: true, order: { items: [{ ...product, quantity: 3 }], totalQuantity: 3, totalPrice: 13500 }, expected: '총 1종 · 교환권 3개 · 13,500원' },
  { name: 'multiple product group', group: true, order: { items: [{ ...product, quantity: 2 }, { id: 77, quantity: 1 }], totalQuantity: 3, totalPrice: 21000 }, expected: '총 2종 · 교환권 3개 · 21,000원' },
  { name: 'quantity fallback preserves group quantities', group: true, order: { items: [{ ...product, quantity: 2 }, { id: 77, quantity: 3 }], totalPrice: 45000 }, expected: '총 2종 · 교환권 5개 · 45,000원' },
  { name: 'absent amount is not invented from current product price', order: { product, totalPrice: null }, expected: '총 1종 · 교환권 1개' },
  { name: 'zero amount is not mistaken for missing data', order: { product, totalPrice: 0 }, expected: '총 1종 · 교환권 1개 · 0원' }
]) {
  test(`completion summary: ${entry.name}`, () => {
    const p = page();
    const input = { isSelfGift: true, ...entry.order };
    const before = JSON.stringify(input);
    p.render(entry.group ? p.mapGroup(input) : input);
    const summary = p.elements.get('gift-summary');
    assert.equal(summary.hidden, false);
    assert.equal(summary.textContent, entry.expected);
    assert.equal(JSON.stringify(input), before, 'rendering must not mutate API data');
    assert.equal(p.elements.get('gift-items-container').children.length, entry.order.items?.length || 1);
  });
}

test('completion summary replaces multiple-product values when re-rendered for a single product', () => {
  const p = page();
  p.render({ isSelfGift: true, items: [{ id: 1, quantity: 2 }, { id: 2, quantity: 1 }], totalPrice: 21000 });
  p.render({ isSelfGift: false, receiver: { nickname: '받는 사람' }, product, totalPrice: 4500 });
  assert.equal(p.elements.get('gift-summary').hidden, false);
  assert.equal(p.elements.get('gift-summary').textContent, '총 1종 · 교환권 1개 · 4,500원');
  assert.equal(p.elements.get('gift-items-container').children.length, 1);
  assert.match(p.elements.get('complete-title').innerHTML, /받는 사람/);
});

test('completion summary clears old text and stays hidden when no product is present', () => {
  const p = page();
  p.render({ isSelfGift: true, items: [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }], totalPrice: 9000 });
  p.render({ isSelfGift: true, items: [] });
  assert.equal(p.elements.get('gift-summary').hidden, true);
  assert.equal(p.elements.get('gift-summary').textContent, '');
  assert.equal(p.elements.get('gift-items-container').children.length, 0);
});
