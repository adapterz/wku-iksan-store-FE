document.addEventListener("header:ready", async () => {

  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');

  if (!orderId) {
    alert("잘못된 접근입니다.");
    location.href = "index.html";
    return;
  }

  // bfcache로 페이지가 복원될 때(pageshow, persisted) 재검증할 수 있도록 함수로 분리한다.
  async function checkCompleteAuthAndLoadOrder() {
    try {
      const result = await requestJson(`/api/orders/${orderId}`);

      // result가 없으면(=undefined) api.js 전역 인터셉터가 401을 처리(로그인 페이지 이동)한 것이므로
      // 그 이동을 다른 리다이렉트로 덮어쓰지 않도록 그대로 반환한다.
      if (!result) {
        return false;
      }

      if (result.data) {
        const order = result.data;
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
        location.href = "login.html";
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
  const { isSelfGift, receiver, product } = order;

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

  // Product Info
  const giftThumbnail = document.getElementById("gift-thumbnail");
  const giftBrand = document.getElementById("gift-brand");
  const giftName = document.getElementById("gift-name");
  const giftValidPeriod = document.getElementById("gift-valid-period");

  if (product) {
    if (giftThumbnail) giftThumbnail.src = product.thumbnailUrl || "";
    if (giftBrand) giftBrand.textContent = product.brand || "";
    if (giftName) giftName.textContent = product.name || "";
    if (giftValidPeriod) {
      const validPeriodText = product.validPeriod || "발급일로부터 365일 이내에 사용 가능";
      renderValidPeriodText(giftValidPeriod, validPeriodText);
    }
  }
}


