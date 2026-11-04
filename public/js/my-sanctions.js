// 마이페이지 패널티 정책 화면의 "내 경고·제재 내역". 경고 토스트(component.js)는 사유를 보여주지 않으므로
// 사용자가 사유를 다시 확인할 수 있는 곳이다(PR #122 리뷰, FE #97의 알림함 대신). 화면을 열 때마다 새로 조회한다.
document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('btn-policy-penalty');
  const overlay = document.getElementById('policy-penalty-overlay');
  const messageEl = document.getElementById('my-sanctions-message');
  const listEl = document.getElementById('my-sanctions-list');
  const retryBtn = document.getElementById('my-sanctions-retry');
  if (!openBtn || !overlay || !messageEl || !listEl || !retryBtn) return;

  const PAGE_LIMIT = 50; // BE 허용 최대값. 경고는 계정당 1회라 이 수를 넘는 경우는 거의 없다.
  let request = null;
  let shownUserId; // 지금 화면의 내역을 조회한 계정. 아직 조회한 적 없으면 undefined.

  const currentUserId = () => window.accountGuard.currentUser()?.userId ?? null;
  const formatDay = value => new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

  // BE는 기간이 끝난 정지의 status를 active로 유지하고 종료 시각으로 판단한다(sanctionModel.getActiveSuspension).
  // status만 보면 끝난 정지가 "정지 중"으로 보이므로 종료 시각도 함께 비교한다.
  function stateLabel(sanction) {
    if (sanction.status === 'lifted') return { text: '해제됨', active: false };
    if (sanction.type === 'warning') return { text: '적용 중', active: true };
    return new Date(sanction.endsAt).getTime() > Date.now()
      ? { text: '정지 중', active: true }
      : { text: '정지 종료', active: false };
  }

  // 사유는 관리자가 입력한 글이라 textContent로만 넣는다.
  function createItem(sanction) {
    const state = stateLabel(sanction);
    const item = document.createElement('li');
    item.className = 'my-sanctions-item';

    const head = document.createElement('div');
    head.className = 'my-sanctions-head';
    const type = document.createElement('strong');
    type.textContent = sanction.type === 'warning' ? '경고' : '이용 정지';
    const badge = document.createElement('span');
    badge.className = `my-sanctions-badge${state.active ? ' active' : ''}`;
    badge.textContent = state.text;
    head.append(type, badge);

    const reason = document.createElement('p');
    reason.className = 'my-sanctions-reason';
    reason.textContent = sanction.reason;

    // 해제된 정지에 기간이 보이면 아직 정지 중으로 읽힐 수 있어 해제된 건은 기간을 표시하지 않는다.
    const showPeriod = sanction.type !== 'warning' && sanction.status !== 'lifted' && sanction.endsAt;
    const meta = document.createElement('p');
    meta.className = 'my-sanctions-meta';
    meta.textContent = `등록일 ${formatDay(sanction.createdAt)}${showPeriod ? ` · 종료일 ${formatDay(sanction.endsAt)}` : ''}`;

    item.append(head, reason, meta);
    return item;
  }

  function showMessage(text, { retry = false } = {}) {
    listEl.replaceChildren();
    messageEl.textContent = text;
    messageEl.hidden = false;
    retryBtn.hidden = !retry;
  }

  async function load() {
    if (request) request.abort();
    const controller = new AbortController();
    request = controller;
    shownUserId = currentUserId();
    showMessage('내역을 불러오는 중이에요.');

    try {
      const result = await window.requestJson(`/api/users/me/sanctions?limit=${PAGE_LIMIT}`, { signal: controller.signal });
      if (request !== controller || currentUserId() !== shownUserId) return;
      if (!result) return; // 401: 공통 처리가 로그인 이동을 맡는다
      const sanctions = Array.isArray(result.data) ? result.data : [];
      if (!sanctions.length) {
        showMessage('경고·제재 내역이 없어요.');
        return;
      }
      listEl.replaceChildren(...sanctions.map(createItem));
      const total = result.meta?.totalCount ?? sanctions.length;
      messageEl.textContent = total > sanctions.length ? `최근 ${sanctions.length}건만 표시하고 있어요.` : '';
      messageEl.hidden = !messageEl.textContent;
      retryBtn.hidden = true;
    } catch (error) {
      if (request !== controller || currentUserId() !== shownUserId) return;
      console.error('내 경고·제재 내역 조회 실패:', error);
      showMessage('내역을 불러오지 못했어요.', { retry: true });
    }
  }

  openBtn.addEventListener('click', load);
  retryBtn.addEventListener('click', load);

  // 내역을 열어 둔 사이 계정이 바뀌면 이전 계정의 내역을 남기지 않는다. account:ready는 탭 복귀 때마다
  // 같은 계정으로도 발생하므로 실제로 바뀐 경우만 처리한다.
  document.addEventListener('account:ready', event => {
    const userId = event.detail.user?.userId ?? null;
    if (shownUserId === undefined || userId === shownUserId) return;
    if (request) request.abort();
    request = null;
    shownUserId = undefined;
    showMessage('');
    if (userId !== null && overlay.classList.contains('open')) load();
  });
});
