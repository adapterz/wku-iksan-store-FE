'use strict';
// 독립 연동 초안. 기존 상품/주문/선물함 화면은 수정하지 않는다.
(() => {
  const $ = id => document.getElementById(id);
  // FE 표시·입력·검증의 단일 기준. 정책 변경 시 BE 상수와 DB CHECK도 함께 변경한다.
  const limits = Object.freeze({ products:30, perProduct:10, perOrder:50 });
  $('quantity-policy').textContent = `최대 ${limits.products}종 보관 · 상품당 ${limits.perProduct}개 · 한 번에 교환권 ${limits.perOrder}개`;
  const state = { user: null, items: [], selected: new Set(), busy: false, needsSync: false, refreshRequested: false };
  const won = value => Number(value).toLocaleString('ko-KR') + '원';
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
  const labels = { CART_CHANGED:'다른 화면에서 장바구니가 변경됐어요. 수량을 다시 확인해주세요.', PRODUCT_UNAVAILABLE:'판매하지 않는 상품이 있어요. 선택을 변경해주세요.', CART_ITEM_NOT_FOUND:'장바구니 항목이 변경됐어요. 다시 확인해주세요.', CART_BUSY:'다른 요청을 처리 중이에요. 잠시 후 다시 시도해주세요.' };
  async function api(path, method = 'GET', body, extra = {}) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      // 공통 전송/JSON 오류 처리를 재사용하되 401은 이 화면에서 처리한다.
      const data = await window.requestJson(path, { method, body, cache:'no-store', signal:controller.signal, headers:extra, silent401:true });
      return data.data;
    } catch(error) {
      const limitLabels = { CART_LIMIT_EXCEEDED:`장바구니에는 최대 ${limits.products}종을 담을 수 있어요.`, CART_QUANTITY_EXCEEDED:`같은 상품은 최대 ${limits.perProduct}개까지 담을 수 있어요.` };
      error.message = limitLabels[error.code] || labels[error.code] || error.message;
      throw error;
    } finally { clearTimeout(timeout); }
  }
  const message = text => window.showToast(text);
  function setBusy(value) {
    state.busy = value;
    $('controls').disabled = value || state.needsSync || !state.user;
    $('sync-cart').disabled = value;
    $('sync-needed').hidden = !state.needsSync;
  }
  function signedOut(accountChanged = false) {
    state.user = null; state.items = []; state.selected.clear();
    state.needsSync = false;
    $('workspace').hidden = true; $('items').replaceChildren(); $('signed-out').hidden = false;
    $('signed-out-title').textContent = accountChanged ? '로그인 계정이 변경됐어요' : '로그인이 필요해요';
    $('signed-out-copy').textContent = accountChanged ? '현재 계정의 장바구니를 다시 불러와주세요.' : '내 장바구니를 계정에 저장하고 불러옵니다.';
    $('login').textContent = accountChanged ? '현재 계정 장바구니 열기' : '로그인하기';
    $('login').href = accountChanged ? location.pathname : '/login?redirect=' + encodeURIComponent(location.pathname + location.search);
  }
  function fail(error, { initialize = false } = {}) {
    if (error.status === 401) {
      const initialSignedOut = initialize && !state.user;
      signedOut();
      if (initialSignedOut) { $('page-error').textContent = ''; $('page-error').hidden = true; return; }
      $('page-error').textContent = '로그인이 만료됐어요. 다시 로그인해주세요.';
    }
    else $('page-error').textContent = error.message || '연결에 실패했어요. 잠시 후 다시 시도해주세요.';
    $('page-error').hidden = false;
  }
  async function ensureIdentity() {
    const user = await api('/api/auth/me');
    if (!state.user || user.userId !== state.user.userId) {
      signedOut(true);
      throw new Error('로그인 계정이 변경됐어요. 이전 화면을 비웠습니다. 페이지를 새로고침해 현재 계정으로 다시 이용해주세요.');
    }
    state.user = user;
  }
  async function run(work, { initialize = false } = {}) {
    if (state.busy) return; setBusy(true); $('page-error').hidden = true;
    try { if (!initialize) await ensureIdentity(); await work(); }
    catch(error) { fail(error, { initialize }); }
    finally {
      setBusy(false);
      if (state.refreshRequested) { state.refreshRequested = false; refreshIdentity(); }
    }
  }
  // 수량 합산 POST는 재전송하지 않는다. 성공·실패 모두 최신 목록으로 확인한다.
  async function mutate(work) {
    if (state.needsSync) throw new Error('이전 요청의 결과를 먼저 확인해주세요.');
    let failure;
    try { await work(); } catch(error) { failure = error; }
    window.dispatchEvent(new CustomEvent('cart-updated'));
    if (failure?.status === 401) throw failure;
    try { await ensureIdentity(); await load(); }
    catch(error) {
      if (state.user) state.needsSync = true;
      if (error.status === 401 || !state.user) throw error;
      throw new Error('처리 결과를 확인하지 못했어요. 다시 담지 말고 아래 버튼으로 최신 내용을 확인해주세요.');
    }
    if (failure) {
      if (!failure.status || failure.status >= 500) throw new Error('응답이 끊겼지만 서버의 최신 내용을 다시 불러왔어요. 수량을 확인한 뒤 이용해주세요.');
      throw failure;
    }
  }
  const selectedItems = () => state.items.filter(item => state.selected.has(item.cartItemId));
  function totals() {
    const selected = selectedItems(), quantity = selected.reduce((sum,item) => sum + item.quantity, 0);
    $('total').textContent = won(selected.reduce((sum,item) => sum + (item.subtotal || 0), 0));
    $('units').textContent = `${selected.length}종 · 교환권 ${quantity}개`;
    const orderDisabled = !selected.length || quantity > limits.perOrder || selected.some(item => !item.canOrder);
    $('btn-order-self').disabled = orderDisabled;
    $('btn-order-gift').disabled = orderDisabled;
    $('remove-selected').disabled = !selected.length;
    const available = state.items.filter(item => item.canOrder);
    $('select-all').checked = !!available.length && available.every(item => state.selected.has(item.cartItemId));
    $('select-all').indeterminate = selected.length > 0 && !$('select-all').checked;
  }
  function render() {
    $('items').replaceChildren(); $('count').textContent = state.items.length;
    if (!state.items.length) $('items').append(node('p','아직 담은 상품이 없어요. 위에서 상품을 담아보세요.','empty'));
    for (const item of state.items) {
      const article = node('article'), row = node('div',null,'row'), check = node('input'); check.type = 'checkbox'; check.checked = state.selected.has(item.cartItemId); check.setAttribute('aria-label', item.name + ' 선택');
      check.onchange = () => {
        if (check.checked) {
          const currentQuantity = selectedItems().reduce((sum,i) => sum + i.quantity, 0);
          if (currentQuantity + item.quantity > limits.perOrder) { check.checked = false; message(`한 번에 교환권 ${limits.perOrder}개까지 선택할 수 있어요.`); return; }
          state.selected.add(item.cartItemId);
        } else { state.selected.delete(item.cartItemId); }
        totals();
      };
      const info = node('div',null,'grow'); info.append(node('small',item.brand,'muted'),node('h3',item.name),node('span',won(item.unitPrice),'price'));
      row.append(check);
      if (item.thumbnailUrl) { const img = node('img'); img.src = item.thumbnailUrl; img.alt = ''; img.onerror = () => { img.hidden = true; }; row.append(img); }
      row.append(info); article.append(row);
      if (!item.canOrder) article.append(node('p','현재 주문할 수 없는 상품입니다. 장바구니에서는 삭제할 수 있어요.','unavailable'));
      const controls = node('div',null,'row quantity');
      for (const delta of [-1,1]) { const button = node('button',delta < 0 ? '−' : '+'); button.type = 'button'; button.disabled = item.quantity + delta < 1 || item.quantity + delta > limits.perProduct; button.setAttribute('aria-label',item.name + (delta < 0 ? ' 수량 줄이기' : ' 수량 늘리기')); button.onclick = () => run(() => mutate(() => api('/api/cart-items/' + item.cartItemId,'PATCH',{ quantity:item.quantity + delta,version:item.version }))); controls.append(button); if (delta < 0) controls.append(node('span',item.quantity + '개')); }
      const remove = node('button','삭제'); remove.type = 'button'; remove.setAttribute('aria-label',item.name + ' 삭제'); remove.onclick = () => run(() => mutate(() => api('/api/cart-items/' + item.cartItemId,'DELETE'))); controls.append(remove); article.append(controls); $('items').append(article);
    }
    totals();
  }
  async function load() { const items = await api('/api/cart-items'); await ensureIdentity(); state.items = items; state.needsSync = false; const ids = new Set(state.items.map(item => item.cartItemId)); state.selected = new Set([...state.selected].filter(id => ids.has(id))); render(); }
  $('reload').onclick = () => run(load);
  $('sync-cart').onclick = () => run(load);
  $('select-all').onchange = () => {
    if ($('select-all').checked) {
      const available = state.items.filter(item => item.canOrder);
      const quantity = available.reduce((sum,item) => sum + item.quantity, 0);
      if (quantity > limits.perOrder) { $('select-all').checked = false; message(`한 번에 교환권 ${limits.perOrder}개까지 선택할 수 있어요.`); return; }
      state.selected = new Set(available.map(item => item.cartItemId));
    } else { state.selected = new Set(); }
    render();
  };
  $('remove-selected').onclick = () => run(() => mutate(() => api('/api/cart-items/remove','POST',{itemIds:[...state.selected]})));
  // order.html이 cartItemIds 파라미터로 단건·묶음 주문을 모두 처리하므로, 선택한 상품(1개 이상)을
  // 그대로 넘겨 결제 페이지로 이동한다.
  function goToOrder(type) {
    const selected = selectedItems();
    if (!selected.length || selected.some(item => !item.canOrder)) return;
    const cartItemIds = selected.map(item => item.cartItemId).join(',');
    location.href = new URL(`order.html?cartItemIds=${cartItemIds}&type=${type}`, location.href).href;
  }
  $('btn-order-self').onclick = () => goToOrder('self');
  $('btn-order-gift').onclick = () => goToOrder('gift');
  function refreshIdentity() {
    if (!state.user) return;
    if (state.busy) { state.refreshRequested = true; return; }
    return run(async () => { if (!$('workspace').hidden) await load(); });
  }
  window.addEventListener('focus', refreshIdentity);
  window.addEventListener('pageshow', refreshIdentity);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshIdentity(); });
  run(async () => {
    state.user = await api('/api/auth/me'); $('workspace').hidden = false;
    await load();
  }, { initialize: true });
})();
