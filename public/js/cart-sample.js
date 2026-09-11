'use strict';
// 독립 연동 초안. 기존 상품/주문/선물함 화면은 수정하지 않는다.
(() => {
  const $ = id => document.getElementById(id);
  const state = { user: null, items: [], selected: new Set(), receiver: null, busy: false, pending: null, needsSync: false, refreshRequested: false };
  const won = value => Number(value).toLocaleString('ko-KR') + '원';
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
  const key = () => 'cart-pending-order:' + state.user.userId;
  const labels = { CART_CHANGED:'다른 화면에서 장바구니가 변경됐어요. 수량을 다시 확인해주세요.', PRODUCT_PRICE_CHANGED:'상품 가격이 변경됐어요. 새 금액을 확인한 뒤 다시 보내주세요.', PRODUCT_UNAVAILABLE:'판매하지 않는 상품이 있어요. 선택을 변경해주세요.', CART_ITEM_NOT_FOUND:'장바구니 항목이 변경됐어요. 다시 확인해주세요.', CART_LIMIT_EXCEEDED:'장바구니에는 최대 30종을 담을 수 있어요.', CART_QUANTITY_EXCEEDED:'같은 상품은 최대 10개까지 담을 수 있어요.', ORDER_QUANTITY_EXCEEDED:'한 번에 교환권 50개까지 보낼 수 있어요.', CART_BUSY:'다른 요청을 처리 중이에요. 잠시 후 다시 시도해주세요.', USER_NOT_FOUND:'해당 닉네임의 회원을 찾지 못했어요.', RECEIVER_NOT_FOUND:'받는 사람이 탈퇴했거나 존재하지 않아요.', CANNOT_GIFT_TO_SELF:'본인에게 보내려면 나에게 선물하기를 선택해주세요.', IDEMPOTENCY_KEY_REUSED:'요청 정보가 일치하지 않아요. 새 주문을 만들지 말고 주문 상태를 확인해주세요.' };
  async function api(path, method = 'GET', body, extra = {}) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(path, { method, credentials:'same-origin', cache:'no-store', signal:controller.signal, headers:{ ...(body ? {'Content-Type':'application/json'} : {}), ...extra }, body:body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(labels[data.code] || data.message || '요청을 처리하지 못했어요.'), { status:res.status, code:data.code });
      return data.data;
    } finally { clearTimeout(timeout); }
  }
  function message(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(message.timer); message.timer = setTimeout(() => $('toast').hidden = true, 4500); }
  function setBusy(value) {
    state.busy = value;
    $('controls').disabled = value || !!state.pending || state.needsSync || !state.user;
    $('retry-order').disabled = value;
    $('sync-cart').disabled = value;
    $('pending').hidden = !state.pending;
    $('sync-needed').hidden = !state.needsSync;
  }
  function signedOut(accountChanged = false) {
    state.user = null; state.items = []; state.selected.clear(); state.receiver = null; state.pending = null;
    state.needsSync = false;
    $('nickname').value = ''; $('message').value = ''; $('recipient-result').textContent = '';
    $('confirm-dialog').close();
    $('workspace').hidden = true; $('completed').hidden = true; $('receipt').replaceChildren(); $('items').replaceChildren(); $('signed-out').hidden = false;
    $('signed-out-title').textContent = accountChanged ? '로그인 계정이 변경됐어요' : '로그인이 필요해요';
    $('signed-out-copy').textContent = accountChanged ? '현재 계정의 장바구니를 다시 불러와주세요.' : '내 장바구니를 계정에 저장하고 불러옵니다.';
    $('login').textContent = accountChanged ? '현재 계정 장바구니 열기' : '로그인하기';
    $('login').href = accountChanged ? location.pathname : '/login?redirect=' + encodeURIComponent(location.pathname + location.search);
  }
  function fail(error) {
    if (error.status === 401) { signedOut(); $('page-error').textContent = '로그인이 만료됐어요. 다시 로그인해주세요. 주문 요청이 있었다면 같은 계정으로 돌아와 결과를 확인해주세요.'; }
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
    catch(error) { fail(error); }
    finally {
      setBusy(false);
      if (state.refreshRequested) { state.refreshRequested = false; refreshIdentity(); }
    }
  }
  // 수량 합산 POST는 재전송하지 않는다. 성공·실패 모두 최신 목록으로 확인한다.
  async function mutate(work) {
    if (state.needsSync || state.pending) throw new Error('이전 요청의 결과를 먼저 확인해주세요.');
    let failure;
    try { await work(); } catch(error) { failure = error; }
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
    $('checkout').disabled = !selected.length || quantity > 50 || selected.some(item => !item.canOrder);
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
      check.onchange = () => { check.checked ? state.selected.add(item.cartItemId) : state.selected.delete(item.cartItemId); totals(); };
      const info = node('div',null,'grow'); info.append(node('small',item.brand,'muted'),node('h3',item.name),node('span',won(item.unitPrice),'price'));
      row.append(check);
      if (item.thumbnailUrl) { const img = node('img'); img.src = item.thumbnailUrl; img.alt = ''; img.onerror = () => { img.hidden = true; }; row.append(img); }
      row.append(info); article.append(row);
      if (!item.canOrder) article.append(node('p','현재 주문할 수 없는 상품입니다. 장바구니에서는 삭제할 수 있어요.','unavailable'));
      const controls = node('div',null,'row quantity');
      for (const delta of [-1,1]) { const button = node('button',delta < 0 ? '−' : '+'); button.type = 'button'; button.disabled = item.quantity + delta < 1 || item.quantity + delta > 10; button.setAttribute('aria-label',item.name + (delta < 0 ? ' 수량 줄이기' : ' 수량 늘리기')); button.onclick = () => run(() => mutate(() => api('/api/cart-items/' + item.cartItemId,'PATCH',{ quantity:item.quantity + delta,version:item.version }))); controls.append(button); if (delta < 0) controls.append(node('span',item.quantity + '개')); }
      const remove = node('button','삭제'); remove.type = 'button'; remove.setAttribute('aria-label',item.name + ' 삭제'); remove.onclick = () => run(() => mutate(() => api('/api/cart-items/' + item.cartItemId,'DELETE'))); controls.append(remove); article.append(controls); $('items').append(article);
    }
    totals();
  }
  async function load() { const items = await api('/api/cart-items'); await ensureIdentity(); state.items = items; state.needsSync = false; const ids = new Set(state.items.map(item => item.cartItemId)); state.selected = new Set([...state.selected].filter(id => ids.has(id))); render(); }
  async function loadProducts() {
    const products = await api('/api/products'); $('products').replaceChildren();
    for (const product of products) { const option = node('option',product.name + ' · ' + won(product.price)); option.value = product.id; $('products').append(option); }
  }
  function receipt(group) {
    $('workspace').hidden = true; $('completed').hidden = false; $('receipt').replaceChildren();
    $('receipt').append(node('p',`주문 묶음 #${group.orderGroupId} · ${group.receiver.nickname}에게 교환권 ${group.totalQuantity}개`));
    if (group.createdAt) { const date = new Date(group.createdAt); if (!Number.isNaN(date.getTime())) $('receipt').append(node('p','주문 시각 · ' + date.toLocaleString('ko-KR'), 'muted')); }
    for (const item of group.items) { const row = node('article'); row.append(node('strong',item.name),node('p',`${won(item.unitPrice)} × ${item.quantity}개 = ${won(item.subtotal)}`)); $('receipt').append(row); }
    if (group.message) $('receipt').append(node('p',group.message));
    $('receipt').append(node('p','총 ' + won(group.totalPrice)),node('p','받는 사람의 선물함에는 교환권이 각각 표시됩니다.','muted'));
    const url = new URL(location.href); url.searchParams.set('orderGroupId',group.orderGroupId); history.replaceState(null,'',url);
  }
  async function sendPending() {
    const pending = state.pending;
    // 다른 탭에서 계정이 바뀌었을 때 이전 계정의 주문을 새 계정으로 제출하지 않는다.
    await ensureIdentity();
    let group;
    try { group = await api('/api/order-groups','POST',pending.body,{'Idempotency-Key':pending.key}); }
    catch(error) {
      // 통신 단절·5xx·401은 결과가 불확실하므로 키/본문을 그대로 보관한다.
      if ([400,404,409].includes(error.status) && error.code !== 'IDEMPOTENCY_KEY_REUSED') { sessionStorage.removeItem(key()); state.pending = null; await load(); }
      throw error;
    }
    // 성공 결과를 먼저 보여준다. 보관소 정리에 실패하더라도 새 주문을 자동 생성하지 않는다.
    receipt(group); state.pending = null;
    try { sessionStorage.removeItem(key()); } catch { message('주문은 완료됐어요. 보관된 요청은 다시 보내도 중복 주문되지 않습니다.'); }
  }
  $('add-form').onsubmit = event => { event.preventDefault(); return run(async () => { await mutate(async () => { const item = await api('/api/cart-items','POST',{productId:Number($('products').value),quantity:Number($('add-quantity').value)}); state.selected.add(item.cartItemId); }); message('장바구니에 담았어요.'); }); };
  $('reload').onclick = () => run(load);
  $('sync-cart').onclick = () => run(load);
  $('select-all').onchange = () => { state.selected = new Set($('select-all').checked ? state.items.filter(item => item.canOrder).map(item => item.cartItemId) : []); render(); };
  $('remove-selected').onclick = () => run(() => mutate(() => api('/api/cart-items/remove','POST',{itemIds:[...state.selected]})));
  $('nickname').oninput = () => { state.receiver = null; $('recipient-result').textContent = '받는 사람을 다시 확인해주세요.'; };
  $('self').onchange = () => { state.receiver = null; $('recipient-form').hidden = $('self').checked; $('recipient-result').textContent = $('self').checked ? '본인에게 보냅니다.' : '받는 사람을 확인해주세요.'; };
  $('recipient-form').onsubmit = event => { event.preventDefault(); run(async () => { state.receiver = null; $('recipient-result').textContent = '받는 사람 확인 중…'; const user = await api('/api/users/search?nickname=' + encodeURIComponent($('nickname').value.trim())); if (user.userId === state.user.userId) throw new Error('본인에게 보내려면 나에게 선물하기를 선택해주세요.'); state.receiver = user; $('recipient-result').textContent = user.nickname + '에게 보냅니다.'; }); };
  $('checkout').onclick = () => {
    if (state.busy || state.pending || state.needsSync || !state.user) return;
    if (!$('self').checked && !state.receiver) return message('받는 사람을 먼저 확인해주세요.');
    $('confirm-text').textContent = `${$('self').checked ? state.user.nickname : state.receiver.nickname}에게 ${$('units').textContent}, ${$('total').textContent}의 선물을 보냅니다.`;
    $('confirm-dialog').showModal(); $('cancel-send').focus();
  };
  $('cancel-send').onclick = () => $('confirm-dialog').close();
  $('confirm-send').onclick = () => { $('confirm-dialog').close(); return run(async () => {
    if (state.needsSync || state.pending || !selectedItems().length) return;
    const body = { items:selectedItems().map(item => ({cartItemId:item.cartItemId,quantity:item.quantity,version:item.version,expectedUnitPrice:item.unitPrice})),isSelfGift:$('self').checked,message:$('message').value };
    if (!body.isSelfGift) body.receiverId = state.receiver.userId;
    const pending = {key:crypto.randomUUID(),body};
    // 저장할 수 없으면 요청하지 않는다. 새로고침 후에도 동일 키로 재시도하기 위함이다.
    sessionStorage.setItem(key(),JSON.stringify(pending)); state.pending = pending; await sendPending();
  }); };
  $('retry-order').onclick = () => run(sendPending);
  $('continue').onclick = () => run(async () => { const url = new URL(location.href); url.searchParams.delete('orderGroupId'); history.replaceState(null,'',url); $('completed').hidden = true; $('workspace').hidden = false; state.receiver = null; $('nickname').value = ''; $('message').value = ''; $('recipient-result').textContent = $('self').checked ? '본인에게 보냅니다.' : '받는 사람을 확인해주세요.'; await loadProducts(); await load(); });
  function refreshIdentity() {
    if (!state.user) return;
    if (state.busy) { state.refreshRequested = true; return; }
    // 복귀 시 가격/수량이 갱신되면 이전 확인 문구로 새 금액을 주문하지 않도록 닫는다.
    if ($('confirm-dialog').open) { $('confirm-dialog').close(); message('최신 내용을 확인한 뒤 선물을 다시 확인해주세요.'); }
    return run(async () => { if (!$('workspace').hidden) await load(); });
  }
  window.addEventListener('focus', refreshIdentity);
  window.addEventListener('pageshow', refreshIdentity);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshIdentity(); });
  run(async () => {
    state.user = await api('/api/auth/me'); $('workspace').hidden = false;
    const saved = sessionStorage.getItem(key());
    if (saved) state.pending = JSON.parse(saved);
    const groupId = new URL(location.href).searchParams.get('orderGroupId');
    if (groupId) { receipt(await api('/api/order-groups/' + encodeURIComponent(groupId))); return; }
    await loadProducts();
    await load();
  }, { initialize: true });
})();
