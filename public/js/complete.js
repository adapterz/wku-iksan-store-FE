document.addEventListener("header:ready", async () => {

  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');
  const orderGroupId = urlParams.get('orderGroupId');

  if (!orderId && !orderGroupId) {
    alert("잘못된 접근입니다.");
    location.href = "index.html";
    return;
  }

  // bfcache로 페이지가 복원될 때(pageshow, persisted) 재검증할 수 있도록 함수로 분리한다.
  async function checkCompleteAuthAndLoadOrder() {
    try {
      const path = orderGroupId ? `/api/order-groups/${orderGroupId}` : `/api/orders/${orderId}`;
      const result = await requestJson(path);

      // result가 없으면(=undefined) api.js 전역 인터셉터가 401을 처리(로그인 페이지 이동)한 것이므로
      // 그 이동을 다른 리다이렉트로 덮어쓰지 않도록 그대로 반환한다.
      if (!result) {
        return false;
      }

      if (result.data) {
        // order-groups는 상품 1개 객체가 아니라 items 배열로 온다. bottom-sheet에서 만든 묶음
        // 주문은 항상 상품 1종류만 담으므로 items[0]만 꺼내 단건 주문과 같은 모양으로 맞춘다.
        const order = orderGroupId ? mapOrderGroupToOrderView(result.data) : result.data;
        renderCompletePage(order);
        // 인증 및 데이터 로드 완료 후 화면 표시 (깜빡임 방지)
        document.body.style.visibility = "visible";
        document.body.style.opacity = "1";
        return true;
      } else {
        alert("주문 정보가 올바르지 않습니다.");
        location.href = "index.html";
        return false;
      }
    } catch (error) {
      console.error("주문 정보 조회 실패:", error);
      // 401은 api.js 전역 인터셉터가 처리하므로 여기선 403 등 나머지 오류만 다룬다.
      if (error.status === 403) {
        alert("접근 권한이 없습니다.");
        navigateToLogin();
      } else {
        alert("주문 정보를 불러올 수 없습니다.");
        location.href = "index.html";
      }
      return false;
    }
  }

  // component.js의 공통 헬퍼: 최초 실행 후 bfcache 복원 시 재검증까지 등록해준다.
  // 최초 조회가 실패한 경우(이미 알림/리다이렉트 처리됨)에는 재검증 리스너를 등록하지 않는다.
  await window.registerBfcacheRevalidation(checkCompleteAuthAndLoadOrder);

});

// order-groups 응답(GET /api/order-groups/:id)을 renderCompletePage가 기대하는 형태로 변환한다.
// 장바구니 묶음 주문은 상품이 여러 종류일 수 있으므로 items 전체와 합계를 그대로 넘긴다 —
// 첫 상품만 꺼내면 장바구니에서 여러 상품을 함께 주문했을 때 나머지 상품이 화면에서 사라진다.
function mapOrderGroupToOrderView(group) {
  return {
    isSelfGift: group.isSelfGift,
    receiver: group.receiver,
    items: group.items || [],
    totalQuantity: group.totalQuantity,
    totalPrice: group.totalPrice
  };
}

// "N일" 같은 기간 표기를 볼드로 강조해서 넣는다 (예: "발급일로부터 365일 이내에 사용 가능").
function renderValidPeriodText(el, text) {
  const match = text.match(/\d+\s*일/);
  if (!match) {
    el.textContent = text;
    return;
  }

  const start = match.index;
  const end = start + match[0].length;
  el.textContent = "";
  el.appendChild(document.createTextNode(text.slice(0, start)));
  const strong = document.createElement("strong");
  strong.textContent = match[0];
  el.appendChild(strong);
  el.appendChild(document.createTextNode(text.slice(end)));
}

function renderCompletePage(order) {
  const { isSelfGift, receiver } = order;

  // Title and Badge
  const completeTitle = document.getElementById("complete-title");
  const selfBadge = document.getElementById("self-badge");

  if (isSelfGift) {
    completeTitle.innerHTML = `<strong>나</strong> 에게<br>선물을 보냈습니다.`;
    if (selfBadge) selfBadge.style.display = 'block';
  } else {
    const receiverName = receiver ? receiver.nickname : "친구";
    completeTitle.innerHTML = `<strong>${receiverName}</strong> 에게<br>선물을 보냈습니다.`;
    if (selfBadge) selfBadge.style.display = 'none';
  }

  // 단건 주문({product, quantity})과 묶음 주문({items:[...]}) 두 응답 모양을 하나로 맞춘다.
  const items = (order.items && order.items.length)
    ? order.items
    : (order.product ? [{ ...order.product, quantity: order.quantity || 1 }] : []);
  const totalQuantity = order.totalQuantity != null
    ? order.totalQuantity
    : items.reduce((sum, item) => sum + (item.quantity || 1), 0);

  // Product Info — 상품마다 카드를 하나씩 그린다. 템플릿 카드(가장 처음의 정적 마크업)는 그대로
  // 재사용해 기존 id를 유지하고, 추가 상품은 그 카드를 복제하되 id 중복을 막기 위해 id를 지운다.
  const container = document.getElementById("gift-items-container");
  const templateCard = document.getElementById("gift-item-card");
  if (container && templateCard) {
    container.replaceChildren();
    items.forEach((item, index) => {
      const card = index === 0 ? templateCard : templateCard.cloneNode(true);
      if (index > 0) {
        card.removeAttribute('id');
        ['img', '.gift-brand', '.gift-name', '.gift-qty'].forEach(selector => {
          const el = card.querySelector(selector);
          if (el) el.removeAttribute('id');
        });
      }
      const img = card.querySelector('img');
      const brandEl = card.querySelector('.gift-brand');
      const nameEl = card.querySelector('.gift-name');
      const qtyEl = card.querySelector('.gift-qty');
      if (img) img.src = item.thumbnailUrl || "";
      if (brandEl) brandEl.textContent = item.brand || "";
      if (nameEl) nameEl.textContent = item.name || "";
      if (qtyEl) qtyEl.textContent = `수량 : ${item.quantity || 1}개`;
      container.appendChild(card);
    });
  }

  // 상품이 2종 이상일 때만 전체 수량·총액 요약을 보여준다 (단건/단일 상품 묶음은 카드 하나로 충분).
  const summaryEl = document.getElementById("gift-summary");
  if (summaryEl) {
    if (items.length > 1) {
      summaryEl.hidden = false;
      summaryEl.textContent = order.totalPrice != null
        ? `총 ${items.length}종 · 교환권 ${totalQuantity}개 · ${order.totalPrice.toLocaleString()}원`
        : `총 ${items.length}종 · 교환권 ${totalQuantity}개`;
    } else {
      summaryEl.hidden = true;
    }
  }

  // Usage Period — 상품이 1개일 때만 그 상품의 validPeriod를 쓴다 (order-groups 응답에는 없어
  // 기본 문구로 대체되고, 묶음일 때는 상품마다 다를 수 있어 공통 문구를 쓴다).
  const giftValidPeriod = document.getElementById("gift-valid-period");
  if (giftValidPeriod) {
    const validPeriodText = (items.length === 1 && items[0].validPeriod) || "발급일로부터 365일 이내에 사용 가능";
    renderValidPeriodText(giftValidPeriod, validPeriodText);
  }
}


