// Isolated prototype: reuses window.requestJson from js/api.js and shared helpers from
// js/admin-sample-common.js (escapeHtml, formatDate, toast, showPageError, showGate, showApp,
// showFatalError). No production page scripts are changed.
'use strict';

let categories = [];
let products = [];
let statusFilter = '';
let editingProductId = null; // null = 폼 닫힘, 'new' = 등록, 숫자 = 해당 id 수정
let editingCategoryId = null; // null = 폼 닫힘, 'new' = 추가, 숫자 = 해당 id 수정

const STATUS_LABEL = { active: '판매중', hidden: '숨김', discontinued: '단종' };

const OPTIONAL_FIELDS = [
  { key: 'thumbnailUrl', label: '썸네일 이미지 URL', type: 'text' },
  { key: 'description', label: '상품 설명', type: 'textarea' },
  { key: 'descriptionImageUrl', label: '설명 이미지 URL', type: 'text' },
  { key: 'validPeriod', label: '유효기간', type: 'text' },
  { key: 'usageMethod', label: '사용 방법', type: 'text' },
  { key: 'exchangeLocation', label: '교환처', type: 'text' },
  { key: 'caution', label: '주의사항', type: 'textarea' }
];

/* ---------- 상품 ---------- */

async function loadCategories() {
  const result = await window.requestJson('/api/categories', { silent401: true });
  if (result) categories = result.data;
}

function categoryOptions(selectedId) {
  return categories.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
}

// 빠르게 상태 필터를 연속 전환하면 응답이 요청 순서와 다르게 도착해 이전(오래된) 필터 결과가
// 최신 결과를 덮어쓸 수 있다(search.js abf86c5와 동일 패턴). 새 요청 시작 시 진행 중인 이전
// 요청을 취소해서 막는다.
let productsRequest = null;

async function loadProducts() {
  if (productsRequest) productsRequest.abort();
  const controller = new AbortController();
  productsRequest = controller;

  const query = statusFilter ? `?status=${statusFilter}` : '';
  try {
    const result = await window.requestJson('/api/admin/products' + query, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!result) return;
    products = result.data;
    renderProductList();
  } catch (err) {
    if (controller.signal.aborted) return;
    showPageError(err.message || '상품 목록을 불러오지 못했습니다.');
  }
}

function productOptionalFieldsForm(product) {
  return `<details class="ap-optional-details">
    <summary>상세 정보 (선택 입력)</summary>
    ${OPTIONAL_FIELDS.map(f => `
      <div class="as-field">
        <label for="pf-${f.key}">${f.label}</label>
        ${f.type === 'textarea'
          ? `<textarea id="pf-${f.key}" rows="2">${escapeHtml(product ? product[f.key] : '')}</textarea>`
          : `<input type="text" id="pf-${f.key}" value="${escapeHtml(product ? product[f.key] : '')}">`}
      </div>`).join('')}
  </details>`;
}

function productFormPanel(mode, product) {
  const isEdit = mode === 'edit';
  return `<div class="as-form-panel">
    <p class="as-form-title">${isEdit ? '상품 수정 #' + product.id : '새 상품 등록'}</p>
    <div class="as-field">
      <label for="pf-name">상품명</label>
      <input type="text" id="pf-name" value="${escapeHtml(isEdit ? product.name : '')}">
    </div>
    <div class="as-field">
      <label for="pf-brand">브랜드</label>
      <input type="text" id="pf-brand" value="${escapeHtml(isEdit ? product.brand : '')}">
    </div>
    <div class="as-field">
      <label for="pf-price">가격</label>
      <input type="number" id="pf-price" min="1" value="${isEdit ? product.price : ''}">
    </div>
    <div class="as-field">
      <label for="pf-category">카테고리</label>
      <select id="pf-category">${categoryOptions(isEdit ? product.categoryId : null)}</select>
    </div>
    ${productOptionalFieldsForm(isEdit ? product : null)}
    <p class="ai-field-error" id="product-form-error" hidden></p>
    <div class="ai-btn-row">
      <button class="ai-primary" id="product-form-submit">${isEdit ? '수정 저장' : '등록'}</button>
      <button class="ai-secondary" id="product-form-cancel">취소</button>
    </div>
  </div>`;
}

function readProductForm(isEdit) {
  const body = {
    name: document.getElementById('pf-name').value.trim(),
    brand: document.getElementById('pf-brand').value.trim(),
    price: Number(document.getElementById('pf-price').value),
    categoryId: Number(document.getElementById('pf-category').value)
  };
  for (const f of OPTIONAL_FIELDS) {
    const el = document.getElementById('pf-' + f.key);
    const value = el.value.trim();
    if (value) {
      body[f.key] = value;
    } else if (isEdit) {
      // 수정 화면에서 선택 필드를 비웠으면 "값을 그대로 둔다"가 아니라 "지운다"는 뜻이므로,
      // 키 자체를 빼지 않고 null을 명시적으로 보낸다 (BE validateOptionalText가 null을 지원함).
      body[f.key] = null;
    }
  }
  return body;
}

function renderProductForm() {
  const container = document.getElementById('product-form-container');
  if (editingProductId === null) {
    container.innerHTML = '<div class="ai-btn-row" style="padding:0 16px 16px"><button class="ai-primary" id="open-new-product-form">새 상품 등록</button></div>';
    document.getElementById('open-new-product-form').addEventListener('click', () => { editingProductId = 'new'; renderProductForm(); });
    return;
  }

  const product = editingProductId === 'new' ? null : products.find(p => p.id === editingProductId);
  container.innerHTML = productFormPanel(editingProductId === 'new' ? 'create' : 'edit', product);

  document.getElementById('product-form-cancel').addEventListener('click', () => { editingProductId = null; renderProductForm(); });
  document.getElementById('product-form-submit').addEventListener('click', async () => {
    const errEl = document.getElementById('product-form-error');
    const isEdit = editingProductId !== 'new';
    const body = readProductForm(isEdit);
    if (!body.name || !body.brand || !body.price || !body.categoryId) {
      errEl.textContent = '상품명·브랜드·가격·카테고리는 필수입니다.';
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;

    try {
      let result;
      if (editingProductId === 'new') {
        result = await window.requestJson('/api/admin/products', { method: 'POST', body });
      } else {
        result = await window.requestJson('/api/admin/products/' + editingProductId, { method: 'PATCH', body });
      }
      // silent401을 안 줬으므로 세션이 만료된 401 응답은 여기서 undefined로 돌아온다
      // (전역 로그인 리다이렉트가 이미 예약된 상태) — 이걸 성공으로 착각해 토스트를 띄우면 안 된다.
      if (!result) return;
      toast(editingProductId === 'new' ? '상품을 등록했습니다.' : '상품을 수정했습니다.');
      editingProductId = null;
      await loadProducts();
      renderProductForm(); // 폼을 닫고 "새 상품 등록" 버튼으로 되돌린다 — 안 하면 이 버튼이 그대로
                            // "수정 저장"으로 남아있어서, 다시 누르면 editingProductId가 이미 null이라
                            // PATCH /api/admin/products/null 같은 깨진 요청이 나간다.
    } catch (err) {
      errEl.textContent = err.message || '저장에 실패했습니다.';
      errEl.hidden = false;
    }
  });
}

async function changeProductStatus(id, status) {
  try {
    const result = await window.requestJson('/api/admin/products/' + id + '/status', { method: 'PATCH', body: { status } });
    if (!result) return; // 세션 만료(401) — 전역 로그인 리다이렉트에 맡기고 성공 토스트는 띄우지 않는다
    toast('상태를 "' + STATUS_LABEL[status] + '"(으)로 변경했습니다.');
    await loadProducts();
  } catch (err) {
    toast(err.message || '상태 변경에 실패했습니다.');
  }
}

function statusActionButtons(product) {
  const actions = [];
  if (product.status !== 'active') actions.push(['active', '판매 재개']);
  if (product.status !== 'hidden') actions.push(['hidden', '숨기기']);
  if (product.status !== 'discontinued') actions.push(['discontinued', '단종 처리']);
  return actions.map(([status, label]) =>
    `<button class="ai-toggle${status === 'discontinued' ? ' danger' : ''}" data-status-action="${product.id}:${status}">${label}</button>`).join('');
}

function productCard(p) {
  return `<div class="ai-card">
    <div class="ai-card-head">
      <div class="ai-card-head-left"><span class="ai-badge status-${p.status}">${STATUS_LABEL[p.status]}</span><span class="ai-id">#${p.id}</span></div>
      <button class="ai-toggle" data-edit-product="${p.id}">수정</button>
    </div>
    <p class="ai-content">${escapeHtml(p.name)}</p>
    <p class="ai-meta">${escapeHtml(p.brand)} · ${Number(p.price).toLocaleString()}원 · ${escapeHtml(p.categoryName)}</p>
    <div class="ai-btn-row">${statusActionButtons(p)}</div>
  </div>`;
}

function renderProductList() {
  const listEl = document.getElementById('product-list');
  listEl.innerHTML = products.length ? products.map(productCard).join('') : '<p class="ai-empty">해당 상태의 상품이 없습니다.</p>';

  listEl.querySelectorAll('[data-edit-product]').forEach(btn => {
    btn.addEventListener('click', () => { editingProductId = Number(btn.dataset.editProduct); renderProductForm(); });
  });
  listEl.querySelectorAll('[data-status-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [id, status] = btn.dataset.statusAction.split(':');
      changeProductStatus(Number(id), status);
    });
  });
}

/* ---------- 카테고리 ---------- */

function categoryFormPanel(mode, category) {
  const isEdit = mode === 'edit';
  return `<div class="as-form-panel">
    <p class="as-form-title">${isEdit ? '카테고리 수정 #' + category.id : '새 카테고리 추가'}</p>
    <div class="as-field">
      <label for="cf-name">카테고리명</label>
      <input type="text" id="cf-name" value="${escapeHtml(isEdit ? category.name : '')}" maxlength="50">
    </div>
    <p class="ai-field-error" id="category-form-error" hidden></p>
    <div class="ai-btn-row">
      <button class="ai-primary" id="category-form-submit">${isEdit ? '수정 저장' : '추가'}</button>
      <button class="ai-secondary" id="category-form-cancel">취소</button>
    </div>
  </div>`;
}

function renderCategoryForm() {
  const container = document.getElementById('category-form-container');
  if (editingCategoryId === null) {
    container.innerHTML = '<div class="ai-btn-row" style="padding:0 16px 16px"><button class="ai-primary" id="open-new-category-form">새 카테고리 추가</button></div>';
    document.getElementById('open-new-category-form').addEventListener('click', () => { editingCategoryId = 'new'; renderCategoryForm(); });
    return;
  }

  const category = editingCategoryId === 'new' ? null : categories.find(c => c.id === editingCategoryId);
  container.innerHTML = categoryFormPanel(editingCategoryId === 'new' ? 'create' : 'edit', category);

  document.getElementById('category-form-cancel').addEventListener('click', () => { editingCategoryId = null; renderCategoryForm(); });
  document.getElementById('category-form-submit').addEventListener('click', async () => {
    const errEl = document.getElementById('category-form-error');
    const name = document.getElementById('cf-name').value.trim();
    if (!name) {
      errEl.textContent = '카테고리명을 입력하세요.';
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;

    try {
      let result;
      if (editingCategoryId === 'new') {
        result = await window.requestJson('/api/admin/categories', { method: 'POST', body: { name } });
      } else {
        result = await window.requestJson('/api/admin/categories/' + editingCategoryId, { method: 'PATCH', body: { name } });
      }
      if (!result) return; // 세션 만료(401) — 전역 로그인 리다이렉트에 맡기고 성공 토스트는 띄우지 않는다
      toast(editingCategoryId === 'new' ? '카테고리를 추가했습니다.' : '카테고리를 수정했습니다.');
      editingCategoryId = null;
      await loadCategories();
      renderCategoryList();
      renderCategoryForm();
    } catch (err) {
      errEl.textContent = err.code === 'CATEGORY_ALREADY_EXISTS' ? '이미 존재하는 카테고리명입니다.' : (err.message || '저장에 실패했습니다.');
      errEl.hidden = false;
    }
  });
}

function renderCategoryList() {
  const listEl = document.getElementById('category-list');
  listEl.innerHTML = categories.length ? categories.map(c => `
    <div class="ai-card">
      <div class="ai-card-head">
        <div class="ai-card-head-left"><span class="ai-id">#${c.id}</span><span class="ai-content" style="margin:0">${escapeHtml(c.name)}</span></div>
        <button class="ai-toggle" data-edit-category="${c.id}">수정</button>
      </div>
    </div>`).join('') : '<p class="ai-empty">카테고리가 없습니다.</p>';

  listEl.querySelectorAll('[data-edit-category]').forEach(btn => {
    btn.addEventListener('click', () => { editingCategoryId = Number(btn.dataset.editCategory); renderCategoryForm(); });
  });
}

/* ---------- 공통 ---------- */

function activateTab(tab) {
  document.querySelectorAll('nav[aria-label="관리자 화면"] [data-tab]').forEach(b => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.getElementById('products-view').hidden = tab !== 'products';
  document.getElementById('categories-view').hidden = tab !== 'categories';
  if (tab === 'categories') { renderCategoryList(); renderCategoryForm(); }
}

async function checkAndLoad() {
  let me;
  try {
    me = await window.requestJson('/api/auth/me', { silent401: true });
  } catch (err) {
    if (err && err.status === 401) return showGate();
    return showFatalError('서버 연결에 실패했습니다.');
  }
  if (me.data.role !== 'admin') return showFatalError('관리자 권한이 필요합니다.');

  showApp();
  try {
    // loadCategories()와 loadProducts()는 서로 의존관계가 없으므로 병렬로 요청한다.
    await Promise.all([loadCategories(), loadProducts()]);
    renderProductForm();
  } catch (err) {
    // loadProducts()는 자체적으로 실패를 처리하므로 여기로는 loadCategories() 실패만 올라온다
    // (원래 코드가 이 부분까지 하나의 try/catch로 감싸고 있었던 동작을 그대로 유지).
    showPageError(err.message || '데이터를 불러오지 못했습니다.');
  }
}

document.querySelectorAll('nav[aria-label="관리자 화면"] [data-tab]').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

document.querySelectorAll('.ap-status-filter [data-status]').forEach(btn => {
  btn.addEventListener('click', () => {
    statusFilter = btn.dataset.status;
    document.querySelectorAll('.ap-status-filter [data-status]').forEach(b => {
      if (b === btn) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    editingProductId = null;
    loadProducts().then(renderProductForm);
  });
});

checkAndLoad();
