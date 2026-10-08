/* 📒 주문 기록 — 보낼 때도, 비울 때도 남긴다.
 *
 * 2026-10-08 전무님: "오더한 것 지우면 아주 버리지 말고 저장하기.
 *   그래야 이 아이템 언제 몇 개 오더한 기록이 남고, 중복 오더하는 일이 없게."
 *
 * 두 군데에 적는다
 *   ① orders/{지점}/_shared_history/{벤더}/{시각}  — 장바구니 통째. 잘못 비워도 되살린다.
 *   ② expiry/{지점}/ordRecent/{벤더::품번}         — 품목별 마지막 주문. 오더앱이 🛒 띠로 띄운다.
 *
 * ⚠️ 왜 window.__kmFb 를 쓰나
 *   Firebase 는 <script type="module"> 안에서 들여온다. 그 안의 db/ref/set 은 바깥 script 에서 안 보인다.
 *   예전 코드가 `typeof set === 'function'` 으로 검사했는데 늘 거짓이라 "자동 백업" 이 한 번도 안 돌았다.
 *   (2026-10-08 확인 — 5개 지점 _shared_history 가 전부 비어 있었다)
 *   그래서 모듈 쪽에서 window.__kmFb = { db, ref, set, update } 로 내놓고, 여기서는 그것만 본다.
 *
 * 쓰는 쪽: index.html(벤더 오더 센터) · rheebros.html(리브 전용 앱)
 */
(function () {
  'use strict';

  // RTDB 열쇠에 못 쓰는 글자를 %XX 로 바꾼다 (되돌릴 수 있게)
  function encKey(k) {
    return String(k).replace(/[.#$\[\]\/]|%(?![0-9A-Fa-f]{2})/g,
      function (ch) { return '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'); });
  }

  // 품목별 열쇠는 되돌릴 일이 없어 그냥 _ 로 눕힌다 — recv.js·recv_push.js 와 글자까지 같아야 한다
  function itemKey(vendor, id) {
    return (vendor + '::' + id).replace(/[.#$\[\]\/]/g, '_');
  }

  function whoAmI() {
    try { return (JSON.parse(localStorage.getItem('chat.me') || 'null') || {}).name || ''; } catch (e) { return ''; }
  }

  function today(ts) {
    return new Date(ts - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  /** @param items {품번: 수량} — 0 이하는 거른다 */
  window.kmLogOrder = function (branch, vendor, items, why) {
    try {
      var fb = window.__kmFb;
      if (!fb || !fb.db || !branch || !vendor) return;
      var ids = Object.keys(items || {}).filter(function (id) { return (+items[id]) > 0; });
      if (!ids.length) return;

      var ts = Date.now();
      var cart = {};
      ids.forEach(function (id) { cart[encKey(id)] = +items[id]; });

      fb.set(fb.ref(fb.db, 'orders/' + branch + '/_shared_history/' + vendor + '/' + ts), {
        ts: ts,
        by: whoAmI() || 'unknown',
        why: why || '',
        types: ids.length,
        units: ids.reduce(function (n, id) { return n + (+items[id] || 0); }, 0),
        cart: cart
      })['catch'](function (e) { console.warn('[order log] 통째 저장 실패', e); });

      var day = today(ts), patch = {};
      ids.forEach(function (id) { patch[itemKey(vendor, id)] = { d: day, q: +items[id], ts: ts }; });
      fb.update(fb.ref(fb.db, 'expiry/' + branch + '/ordRecent'), patch)
        ['catch'](function (e) { console.warn('[order log] 품목별 저장 실패', e); });
    } catch (e) { console.warn('[order log]', e); }
  };
})();
