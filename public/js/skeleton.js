// 공통 skeleton 노출 시간 제어 유틸리티
// onTimeout: maxMs 안에 settle()이 호출되지 않으면 실행되는 콜백(주로 기존 실패/빈 상태 UI 표시)
// settle(): API 응답(성공/실패) 시점에 호출. 이미 timeout이 발생했어도 이후 실제 렌더링은 별도로 진행하면 됨.
function createSkeletonGuard(onTimeout, maxMs = 1500) {
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) onTimeout();
  }, maxMs);

  return function settle() {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
  };
}
