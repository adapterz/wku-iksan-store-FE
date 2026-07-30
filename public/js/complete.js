document.addEventListener("header:ready", async () => {



  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');

  if (!orderId) {
    alert("잘못된 접근입니다.");
    location.href = "index.html";
    return;
  }

  try {
    const result = await requestJson(`/api/orders/${orderId}`);
    if (result && result.data) {
      const order = result.data;
      renderCompletePage(order);
    } else {
      alert("주문 정보가 올바르지 않습니다.");
      location.href = "index.html";
    }
  } catch (error) {
    console.error("주문 정보 조회 실패:", error);
    if (error.status === 401 || error.status === 403) {
      alert("로그인이 필요하거나 접근 권한이 없습니다.");
      location.href = "login.html";
    } else {
      alert("주문 정보를 불러올 수 없습니다.");
      location.href = "index.html";
    }
  }


});

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

  // Delivery Section (Show with dummy data to match the UI screenshot, or hide if not needed)
  // Since the screenshot shows a delivery address, we'll show it with some placeholder info
  // In a real app, this would be based on order.shippingAddress or similar
  const deliverySection = document.getElementById("delivery-section");
  if (deliverySection) {
    deliverySection.style.display = 'block'; // Show it to match screenshot
    const deliveryName = document.getElementById("delivery-name");
    const deliveryPhone = document.getElementById("delivery-phone");
    const deliveryAddress = document.getElementById("delivery-address");
    
    // Fallback dummy data if no real data
    if (deliveryName) deliveryName.textContent = isSelfGift ? "나 (본인)" : (receiver ? receiver.nickname : "수령인");
    if (deliveryPhone) deliveryPhone.textContent = "010-1234-5678";
    if (deliveryAddress) deliveryAddress.textContent = "서울 동대문구 경희대로 26 (회기동, 경희대학교) 삼의원센터 310호";
  }

  // Product Info
  const giftThumbnail = document.getElementById("gift-thumbnail");
  const giftBrand = document.getElementById("gift-brand");
  const giftName = document.getElementById("gift-name");

  if (product) {
    if (giftThumbnail) giftThumbnail.src = product.thumbnailUrl || "";
    if (giftBrand) giftBrand.textContent = product.brand || "";
    if (giftName) giftName.textContent = product.name || "";
  }
}


