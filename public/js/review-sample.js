/* Review-only sample. Uses real session + review APIs; no localStorage auth or cached reviews. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const state = { tab: 'public', productId: 76, page: 1, user: null, preview: false, seq: 0, edit: null, busy: false, loading: false };
  const labels = ['', '아쉬웠어요', '조금 아쉬웠어요', '괜찮았어요', '좋았어요', '정말 좋았어요'];
  const errors = { UNAUTHORIZED: '로그인이 만료되었어요. 다시 로그인해주세요.', REVIEW_ALREADY_EXISTS: '이미 작성한 후기예요. 내 후기에서 수정해주세요.', GIFT_NOT_REVIEWABLE: '사용 완료한 선물만 후기를 작성할 수 있어요.', FORBIDDEN_NOT_REVIEW_OWNER: '본인이 작성한 후기만 수정할 수 있어요.', REVIEW_NOT_FOUND: '후기를 찾을 수 없어요. 목록을 다시 확인해주세요.' };
  let toastTimer;
  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  async function api(path, method = 'GET', body) {
    let response;
    try { response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw new Error('연결이 원활하지 않아요. 잠시 후 다시 시도해주세요.'); }
    const result = await response.json();
    if (!response.ok) { const err = new Error(errors[result.code] || result.message || '요청을 처리하지 못했어요.'); err.status = response.status; throw err; }
    return result;
  }
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3500); }
  const date = value => new Date(value).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' });
  function productCard(product) {
    const box = node('div', 'rs-product');
    const img = node('img'); img.src = product.thumbnailUrl || 'images/product_76.png'; img.alt = product.name; img.width = 76; img.height = 76;
    const info = node('div'); info.append(node('small', '', product.brand), node('h3', '', product.name));
    if (product.price != null) info.append(node('b', '', product.price.toLocaleString('ko-KR') + '원'));
    box.append(img, info); return box;
  }
  function empty(title, detail, action) {
    const box = node('div', 'rs-empty'); box.append(node('b', '', title), node('p', '', detail));
    if (action) { const b = node('button', 'rs-secondary', action.label); b.onclick = action.run; box.append(b); }
    $('list').append(box);
  }
  function reviewCard(review, mine = false) {
    const card = node('article', 'rs-review'), head = node('div', 'rs-review-head');
    head.append(node('span', 'rs-avatar', review.nickname.slice(0,1)), node('strong', '', review.nickname));
    if (review.isMine) head.append(node('span', 'rs-badge', '내 후기'));
    const time = node('time', '', date(review.createdAt)); time.dateTime = review.createdAt; head.append(time); card.append(head);
    const stars = node('div', 'rs-stars', '★'.repeat(review.rating) + '☆'.repeat(5-review.rating)); stars.setAttribute('aria-label', '5점 만점에 ' + review.rating + '점'); card.append(stars);
    if (mine) card.append(node('p', 'rs-review-product', review.product.name));
    card.append(node('p', '', review.content));
    if (review.isMine) { const b = node('button', '', '수정 · 삭제'); b.onclick = () => openEditor({ reviewId: review.reviewId }); card.append(b); }
    return card;
  }
  async function auth() {
    try { state.user = (await api('/api/auth/me')).data; } catch (e) { if (e.status !== 401) throw e; state.user = null; }
  }
  let signingIn = false;
  async function login() {
    if (signingIn) return;
    if (!state.preview) { location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname + location.search); return; }
    signingIn = true;
    try { await api('/__preview/login','POST'); await auth(); await load(); }
    catch(e) { toast(e.message); } finally { signingIn = false; }
  }
  async function load(append = false) {
    const seq = ++state.seq; state.loading = true; $('more').disabled = true;
    if (!append) { state.page = 1; $('list').replaceChildren(); $('list').append(node('p', 'rs-empty', '불러오는 중…')); }
    $('page-error').hidden = true; $('retry').hidden = true; $('more').hidden = true;
    $('public-controls').hidden = state.tab !== 'public'; $('sort').hidden = state.tab !== 'public';
    $('list-title').textContent = {public:'전체 후기',gifts:'받은 선물',mine:'내가 작성한 후기'}[state.tab];
    $('list-guide').hidden = state.tab === 'public';
    $('list-guide').textContent = state.tab === 'gifts' ? '사용 완료한 선물마다 후기를 한 번씩 남길 수 있어요.' : '내 후기는 언제든 수정하거나 삭제할 수 있어요.';
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'));
    try {
      if (state.tab !== 'public' && !state.user) {
        $('list').replaceChildren(); empty('로그인 후 확인할 수 있어요', '받은 선물과 작성한 후기는 본인에게만 보여요.', {label:state.preview?'샘플 계정으로 체험하기':'로그인하기',run:login}); return;
      }
      if (state.tab === 'gifts') {
        const result = await api('/api/gifts'); if (seq !== state.seq) return;
        $('list').replaceChildren();
        if (!result.data.length) empty('아직 받은 선물이 없어요', '사용 완료한 선물이 생기면 후기를 남겨보세요.');
        for (const gift of result.data) {
          const box = node('article','rs-gift');
          box.append(productCard({name:gift.productName, brand:gift.brand, thumbnailUrl:gift.thumbnailUrl}));
          const b = node('button','rs-secondary',gift.reviewId?'작성한 후기 수정':gift.canReview?'후기 작성하기':'사용 완료 후 작성 가능');
          b.disabled = !gift.reviewId && !gift.canReview;
          b.onclick = () => openEditor(gift.reviewId ? {reviewId:gift.reviewId} : {giftId:gift.giftId});
          box.append(b); $('list').append(box);
        }
      } else {
        let result;
        if (state.tab === 'public') {
          const [product, reviews] = await Promise.all([api('/api/products/' + state.productId), api('/api/products/' + state.productId + '/reviews?page=' + state.page + '&limit=5&sort=' + $('sort').value)]);
          if (seq !== state.seq) return;
          $('product-card').replaceWith(Object.assign(productCard(product.data),{id:'product-card'}));
          $('back').href = 'product.html?id=' + state.productId;
          $('average').textContent = reviews.data.summary.averageRating.toFixed(1);
          $('average-stars').textContent = '★'.repeat(Math.round(reviews.data.summary.averageRating)) + '☆'.repeat(5-Math.round(reviews.data.summary.averageRating));
          $('review-count').textContent = reviews.data.summary.reviewCount + '개의 선물후기';
          result = { ...reviews, data:reviews.data.reviews };
        } else {
          result = await api('/api/reviews/me?page=' + state.page + '&limit=5'); if (seq !== state.seq) return;
        }
        if (!append) $('list').replaceChildren();
        if (!result.data.length && !append) empty('아직 작성된 후기가 없어요', state.tab === 'public' ? '첫 번째 선물후기를 남겨주세요.' : '받은 선물에서 사용한 선물의 후기를 작성해보세요.');
        result.data.forEach(r => $('list').append(reviewCard(r, state.tab === 'mine')));
        $('more').hidden = state.page >= result.meta.totalPages;
      }
    } catch(e) {
      if (seq !== state.seq) return;
      if (!append) $('list').replaceChildren();
      else state.page--;
      $('page-error').textContent = e.message; $('page-error').hidden = false; $('retry').hidden = false;
    } finally { if (seq === state.seq) { state.loading = false; $('more').disabled = false; } }
  }
  async function openEditor(target) {
    if (state.busy) return;
    state.busy = true;
    try {
      const result = await api(target.reviewId ? '/api/reviews/' + target.reviewId : '/api/gifts/' + target.giftId);
      if (!target.reviewId && !result.data.canReview) throw new Error('이 선물은 지금 후기를 작성할 수 없어요.');
      state.edit = target;
      const item = result.data;
      const product = target.reviewId ? item.product : {name:item.productName, thumbnailUrl:item.thumbnailUrl, brand:'사용 완료한 선물'};
      $('editor-product').replaceWith(Object.assign(productCard(product),{id:'editor-product'}));
      $('review-form').reset(); $('content').value = target.reviewId ? item.content : '';
      $('editor-title').textContent = target.reviewId ? '후기 수정' : '후기 작성';
      $('save-review').textContent = target.reviewId ? '수정 내용 저장하기' : '후기 등록하기';
      $('delete-review').hidden = !target.reviewId; $('form-error').textContent = '';
      if (target.reviewId) document.querySelector('input[name=rating][value="' + item.rating + '"]').checked = true;
      updateForm(); $('editor').showModal();
    } catch(e) { toast(e.message); } finally { state.busy = false; updateForm(); }
  }
  function updateForm() {
    const rating = Number(document.querySelector('input[name=rating]:checked')?.value || 0);
    document.querySelectorAll('#rating-inputs label').forEach((label,i) => label.classList.toggle('selected',i<rating));
    $('rating-label').textContent = labels[rating] || '별점을 선택해주세요';
    const length = [...$('content').value.trim()].length;
    $('counter').textContent = length.toLocaleString() + ' / 1,000';
    $('counter').parentElement.classList.toggle('over', length > 1000);
    $('save-review').disabled = state.busy || !rating || length < 1 || length > 1000;
  }
  function busy(value) { state.busy=value; $('close-editor').disabled=value; $('delete-review').disabled=value; updateForm(); }
  async function save(event) {
    event.preventDefault(); if (state.busy || $('save-review').disabled) return;
    const body = {rating:Number(document.querySelector('input[name=rating]:checked').value),content:$('content').value.trim()};
    const target = state.edit; busy(true); $('form-error').textContent='';
    try {
      await api(target.reviewId ? '/api/reviews/' + target.reviewId : '/api/reviews', target.reviewId ? 'PATCH':'POST',target.reviewId ? body : {...body,giftId:target.giftId});
      $('editor').close(); toast(target.reviewId?'후기가 수정되었어요.':'후기가 등록되었어요.'); await load();
    } catch(e) { $('form-error').textContent=e.message; } finally { busy(false); }
  }
  async function remove() {
    if (state.busy || !confirm('후기를 삭제할까요? 삭제한 내용은 되돌릴 수 없어요.')) return;
    busy(true);
    try { await api('/api/reviews/' + state.edit.reviewId,'DELETE'); $('editor').close(); toast('후기가 삭제되었어요.'); await load(); }
    catch(e) { $('form-error').textContent=e.message; } finally { busy(false); }
  }
  for (let i=1;i<=5;i++) {
    const label=node('label'), input=node('input'); input.type='radio';input.name='rating';input.value=i;input.required=true;input.setAttribute('aria-label',i+'점');input.onchange=updateForm;
    const star=node('span','','★');star.setAttribute('aria-hidden','true');label.append(input,star);$('rating-inputs').append(label);
  }
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;load();});
  $('product-select').onchange=()=>{state.productId=Number($('product-select').value);load();};
  $('sort').onchange=()=>load(); $('retry').onclick=()=>load();
  $('write-entry').onclick=()=>{state.tab='gifts';load();};
  $('more').onclick=()=>{if(!state.loading){state.page++;load(true);}};
  $('review-form').onsubmit=save;
  $('content').oninput=updateForm; $('delete-review').onclick=remove;
  $('close-editor').onclick=()=>{if(!state.busy)$('editor').close();};
  $('editor').addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});
  (async()=> {
    try { const preview=await fetch('/__preview/status'); state.preview=preview.ok && (await preview.json()).localPreview === true; } catch {}
    try { await auth(); } catch(e) { toast(e.message); }
    await load();
  })();
})();
