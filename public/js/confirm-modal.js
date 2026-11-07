// 브라우저 기본 confirm() 대신 쓰는 페이지 내 확인창.
// 기본 확인창은 제목에 사이트 주소("localhost:8090 내용:")가 붙고 모양을 바꿀 수 없어서,
// 선물함의 리뷰 삭제 확인창(.review-modal / .review-confirm-body)과 같은 모양으로 띄운다.
//
// showConfirmModal({ title, message, confirmText, cancelText, returnFocusTo }) → Promise<boolean>
//   확인 버튼이면 true, 닫기·바깥 클릭·Esc·closeConfirmModal()이면 false.
//   returnFocusTo: 닫힌 뒤 포커스를 돌려줄 요소. 확인창을 열기 전에 버튼을 잠그면(disabled) 그 버튼이
//   포커스를 잃어 document.activeElement로는 알 수 없으므로 호출하는 쪽이 직접 넘긴다.
// closeConfirmModal() — 열려 있는 확인창을 닫기로 처리한다(계정 전환으로 화면을 비울 때 등).
(function () {
  let active = null;

  function getModal() {
    let modal = document.getElementById('confirm-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.className = 'review-modal';
    modal.innerHTML = `
      <div class="review-modal-content review-modal-content-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message">
        <div class="review-confirm-body">
          <h2 id="confirm-modal-title"></h2>
          <p id="confirm-modal-message" class="confirm-modal-message"></p>
          <div class="review-confirm-actions">
            <button type="button" id="confirm-modal-cancel" class="review-secondary-btn"></button>
            <button type="button" id="confirm-modal-ok" class="review-danger-btn"></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  window.showConfirmModal = function ({ title, message = '', confirmText = '확인', cancelText = '닫기', returnFocusTo = null }) {
    if (active) active(false); // 이미 열린 확인창은 닫기로 끝내고 새로 연다.
    const modal = getModal();
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    // 문구는 textContent로 넣고, 줄바꿈은 CSS(white-space: pre-line)로 보여준다.
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    const opener = returnFocusTo || document.activeElement;

    return new Promise(resolve => {
      const finish = result => {
        if (active !== finish) return;
        active = null;
        modal.classList.remove('open');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve(result);
        // 키보드 사용자를 위해 확인창을 연 버튼으로 포커스를 돌려준다(이미 사라졌으면 생략).
        // 호출한 쪽이 결과를 받고 버튼 잠금을 푼 다음에 옮겨야 포커스가 들어가므로 한 박자 늦춘다.
        setTimeout(() => {
          if (!active && opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
        }, 0);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = event => { if (event.target === modal) finish(false); };
      const onKey = event => {
        if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        else if (event.key === 'Tab') {
          // 버튼이 두 개뿐이라 Tab이 확인창 뒤 화면으로 빠져나가지 않게 둘 사이만 오간다.
          event.preventDefault();
          (document.activeElement === okBtn ? cancelBtn : okBtn).focus();
        }
      };

      active = finish;
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
      modal.classList.add('open');
      // 되돌릴 수 없는 작업이라 Enter를 바로 눌러도 실행되지 않게 닫기 버튼에 포커스를 둔다.
      cancelBtn.focus();
    });
  };

  window.closeConfirmModal = function () {
    if (active) active(false);
  };
})();
