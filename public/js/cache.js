// 같은 브라우저 탭에서만 사용할 임시 캐시를 공통으로 관리한다.
(function createSessionCache() {
  function remove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn('sessionStorage 캐시 삭제 실패:', error);
    }
  }

  function get(key, ttlMs) {
    try {
      const rawValue = sessionStorage.getItem(key);
      if (!rawValue) return null;

      const cachedValue = JSON.parse(rawValue);
      const savedAt = Number(cachedValue.savedAt);
      const age = Date.now() - savedAt;

      // 저장 시각이나 유효시간이 올바르지 않거나 만료된 캐시는 제거한다.
      if (!Number.isFinite(savedAt) || !Number.isFinite(ttlMs) || age < 0 || age >= ttlMs) {
        remove(key);
        return null;
      }

      return cachedValue.data;
    } catch (error) {
      // 손상된 JSON이나 브라우저 저장소 접근 오류가 있어도 API 요청은 계속할 수 있게 한다.
      remove(key);
      return null;
    }
  }

  function set(key, data) {
    try {
      sessionStorage.setItem(key, JSON.stringify({
        data,
        savedAt: Date.now()
      }));
    } catch (error) {
      // 저장 용량 초과 등으로 캐시에 실패해도 기존 화면 동작에는 영향을 주지 않는다.
      console.warn('sessionStorage 캐시 저장 실패:', error);
    }
  }

  window.sessionCache = { get, set, remove };
})();
