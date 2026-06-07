/* Owner-recommended products — single scope, owner-only.
   Only B.H.K (사장님) marks ⭐ products. Every staff member at every branch
   sees the same set: a strong yellow box around the card so the must-order
   items stand out while scrolling the catalog. Nobody but the owner can
   toggle, so once a product is marked it is effectively locked in.

   Storage (Firebase RTDB, same project as carts):
     recs_global/<vendor>/<productId> = { ts, by }

   Public API (window.kmRecs) is intentionally kept backward-compatible with
   the earlier two-scope version so existing vendor-page integrations keep
   working unchanged. The branch-scoped variants are now no-ops. */
(function(){
  // In-memory cache (set of productId strings). null until first snapshot.
  const state = {
    db: null,
    vendor: '',
    branch: '',
    globalIds: new Set(),
    listeners: [],
    fbOps: null,
    unsubGlobal: null,
  };

  function me(){
    try { return JSON.parse(localStorage.getItem('chat.me') || 'null'); } catch(e){ return null; }
  }
  function normName(n){ return (n || '').replace(/\s+/g,'').toUpperCase(); }
  function role(){ return ((me() || {}).role || '').trim().toUpperCase(); }

  // Owner-only marking. Anyone with OWNER role OR a name in the owner list
  // can pin ⭐. Everyone else SEES the badge but cannot toggle — once an
  // owner pins it, the mark is effectively locked.
  // Owner names match the chat.html / database.rules.json whitelist (DJ +
  // Sun Kim are both registered as owners as of 2026-05-28).
  const OWNER_ROLES = /^(OWNER|EXECUTIVE|오너|사장|대표|전무|BOSS|DUEÑO|PROPIETARIO|EJECUTIVO)$/i;
  const OWNER_NAMES = ['DJ','BHK','B.H.K','비에이치케이','SUNKIM','SUN KIM','선킴','김선'];

  function canMark(){
    const m = me() || {};
    if (OWNER_NAMES.includes(normName(m.name))) return true;
    return OWNER_ROLES.test(role());
  }

  function notify(){
    for (const fn of state.listeners){ try { fn(); } catch(e){ console.warn('rec listener failed', e); } }
  }

  function setVendor(v){
    const next = String(v || '');
    if (state.vendor === next) return;
    state.vendor = next;
    state.globalIds = new Set();
    if (state.fbOps) subscribeGlobal();
    notify();
  }
  // setBranch kept as no-op for API compatibility with earlier vendor-page
  // integrations. Marks are now global-only — there is no per-branch scope.
  function setBranch(b){ state.branch = String(b || '').toUpperCase(); }

  function init({ db, vendor, branch, ref, set, onValue, remove }){
    if (!db || !vendor || !ref || !set || !onValue || !remove){
      console.warn('[kmRecs] init missing args — recommendations disabled');
      return;
    }
    state.db = db;
    state.vendor = String(vendor);
    state.branch = (branch || '').toString().toUpperCase();
    state.fbOps = { ref, set, onValue, remove };
    subscribeGlobal();
  }

  function subscribeGlobal(){
    const { db, fbOps, vendor } = state;
    if (!fbOps || !vendor) return;
    if (state.unsubGlobal){ try { state.unsubGlobal(); } catch(e){} state.unsubGlobal = null; }
    if (state._retryT){ clearTimeout(state._retryT); state._retryT = null; }
    const path = 'recs_global/' + vendor;
    console.info('[kmRecs] subscribing to ' + path);
    state.unsubGlobal = fbOps.onValue(fbOps.ref(db, path), (snap) => {
      state._retryCount = 0;
      const v = snap.val() || {};
      state.globalIds = new Set(Object.keys(v));
      console.info('[kmRecs] ' + path + ' snapshot:', state.globalIds.size, 'marked');
      notify();
    }, (err) => {
      console.warn('[kmRecs] read failed for ' + path + ':', err && err.message);
      // Read fails when the snapshot fires before Firebase auth restored the
      // user from IndexedDB, OR when the signed-in user is not approved in
      // database.rules.json. Retry a few times with backoff so an auth race
      // recovers, but stop after ~30s so we don't hammer Firebase forever
      // when the underlying issue is a missing approved status.
      state._retryCount = (state._retryCount || 0) + 1;
      if (state._retryCount > 5){
        console.warn('[kmRecs] giving up after ' + state._retryCount + ' retries — check user approval / DB rules');
        return;
      }
      if (state._retryT) return;
      const delay = Math.min(15000, 1000 * Math.pow(2, state._retryCount - 1));
      state._retryT = setTimeout(() => {
        state._retryT = null;
        console.info('[kmRecs] retrying subscription (#' + state._retryCount + ') after read error');
        subscribeGlobal();
      }, delay);
    });
  }

  // Public refresh hook — vendor pages call this from onAuthStateChanged
  // so the subscription re-attaches with the freshly-restored auth token.
  function refresh(){
    if (state.fbOps && state.vendor) subscribeGlobal();
  }

  function isGlobal(productId){ return state.globalIds.has(String(productId)); }
  // Branch-scoped variants kept as no-ops so old vendor integrations still
  // load without error. They always return false / do nothing.
  function isBranch(/*productId*/){ return false; }
  function isRecommended(productId){ return isGlobal(productId); }

  function toggleGlobal(productId){
    if (!canMark()){
      _recToast('⚠ 별표 권한이 없습니다 (오너 전용)');
      return;
    }
    if (!state.fbOps || !state.vendor){
      _recToast('⚠ 별표 기능 초기화 안 됨 (새로고침 해보세요)');
      console.warn('[kmRecs] toggle blocked — fbOps/vendor missing', !!state.fbOps, state.vendor);
      return;
    }
    const id = String(productId);
    const path = 'recs_global/' + state.vendor + '/' + id;
    const m = me() || {};
    const wasOn = state.globalIds.has(id);
    // Optimistic UI: flip the mark immediately so the click is visibly
    // responsive, then reconcile with the server. If the write is rejected
    // (e.g. RTDB rules block recs_global), revert and surface the error so
    // it is not silently swallowed.
    if (wasOn) state.globalIds.delete(id); else state.globalIds.add(id);
    notify();
    const onErr = (e) => {
      console.warn('rec toggle failed', e);
      if (wasOn) state.globalIds.add(id); else state.globalIds.delete(id);
      notify();
      _recToast('⚠ 별표 저장 실패: ' + ((e && e.message) || e) + ' — 권한/규칙 확인 필요');
    };
    if (wasOn){
      state.fbOps.remove(state.fbOps.ref(state.db, path)).catch(onErr);
    } else {
      state.fbOps.set(state.fbOps.ref(state.db, path), { ts: Date.now(), by: m.name || 'unknown' })
        .catch(onErr);
    }
  }

  // Small toast helper — reuses the host page's toast() if present, otherwise
  // falls back to a self-contained floating message so failures are visible.
  function _recToast(msg){
    try {
      if (typeof window.toast === 'function'){ window.toast(msg); return; }
    } catch(e){}
    try {
      let el = document.getElementById('km-rec-toast');
      if (!el){
        el = document.createElement('div');
        el.id = 'km-rec-toast';
        el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
          'background:#1f2937;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;' +
          'font-weight:700;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = '1';
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 3000);
    } catch(e){ console.warn(msg); }
  }
  function toggleBranch(/*productId*/){ /* no-op — branch scope removed */ }

  function subscribe(fn){
    if (typeof fn === 'function') state.listeners.push(fn);
    return () => {
      const i = state.listeners.indexOf(fn);
      if (i >= 0) state.listeners.splice(i, 1);
    };
  }

  // --- HTML helpers used by every vendor catalog page ---

  // Class to splice into the host card element. Marked products get a
  // strong yellow box treatment (border + background tint + corner flag)
  // so staff notice them at a glance while scrolling the catalog.
  function cardClass(productId){
    return isGlobal(productId) ? ' km-rec-card' : '';
  }

  // Visible to ALL users. Renders nothing if the product is not marked.
  function badgeHTML(productId){
    if (!isGlobal(productId)) return '';
    return '<span class="km-rec-badge" title="TOP PICK — 무조건 발주">TOP PICK</span>';
  }

  // Toggle button — only rendered for OWNER. Empty string for everyone else
  // (so other managers cannot un-mark a product the owner pinned).
  function toggleHTML(productId){
    if (!canMark()) return '';
    const id = String(productId).replace(/'/g, "\\'");
    const on = isGlobal(productId);
    return (
      '<div class="km-rec-tools" onclick="event.stopPropagation()">' +
        '<button class="km-rec-tool' + (on ? ' on' : '') + '" ' +
                'onclick="event.stopPropagation();window.kmRecs.toggleGlobal(\'' + id + '\')" ' +
                'title="' + (on ? '추천 해제' : '⭐ 추천 마크 (전 지점 무조건 발주)') + '">' +
          (on ? '⭐' : '☆') +
        '</button>' +
      '</div>'
    );
  }

  function injectStyles(){
    if (document.getElementById('km-rec-styles')) return;
    const css = document.createElement('style');
    css.id = 'km-rec-styles';
    css.textContent = (
      // Yellow box around the whole card — meant to scream "발주 필수".
      '.km-rec-card{outline:1.5px solid #f59e0b !important;outline-offset:-1.5px;' +
        'background:linear-gradient(180deg,#fffbeb 0%,#fff7d6 100%) !important;' +
        'box-shadow:0 0 0 1px rgba(245,158,11,.25),0 4px 12px rgba(245,158,11,.18) !important;' +
        'position:relative}' +
      // Top-left corner flag (triangle) on every marked card
      '.km-rec-card::before{content:"⭐";position:absolute;top:0;left:0;width:34px;height:34px;' +
        'display:flex;align-items:center;justify-content:center;font-size:18px;' +
        'background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#fff;' +
        'clip-path:polygon(0 0,100% 0,0 100%);z-index:4;pointer-events:none;' +
        'text-shadow:0 1px 1px rgba(0,0,0,.3);padding:2px 0 0 2px}' +
      // Inline "TOP PICK" label
      '.km-rec-badge{display:inline-block;background:#f59e0b;color:#fff;padding:1px 5px;' +
        'border-radius:3px;font-size:9px;font-weight:700;letter-spacing:.5px;' +
        'margin-left:4px;vertical-align:middle;box-shadow:0 1px 2px rgba(245,158,11,.35);text-transform:uppercase}' +
      // Floating toggle (owner-only — others never see it)
      '.km-rec-tools{position:absolute;top:6px;right:6px;display:flex;gap:3px;z-index:6}' +
      '.km-rec-tool{width:32px;height:32px;border-radius:50%;border:2px solid #d97706;' +
        'background:rgba(255,255,255,.95);font-size:17px;line-height:1;cursor:pointer;padding:0;' +
        'display:flex;align-items:center;justify-content:center;font-family:inherit;' +
        'opacity:.7;transition:.12s}' +
      '.km-rec-tool:hover{opacity:1;transform:scale(1.1)}' +
      '.km-rec-tool.on{opacity:1;background:#fbbf24;color:#fff;border-color:#b45309;' +
        'box-shadow:0 0 0 3px rgba(245,158,11,.3)}' +
      // Header filter chip
      '.km-rec-filter{display:inline-flex;align-items:center;gap:6px;background:#fff8e1;border:1.5px solid #f59e0b;' +
        'border-radius:18px;padding:5px 12px;font-size:.82em;font-weight:700;color:#92400e;cursor:pointer;' +
        'user-select:none;font-family:inherit;margin-left:8px}' +
      '.km-rec-filter:hover{background:#fef3c7}' +
      '.km-rec-filter.active{background:#f59e0b;color:#fff;border-color:#d97706}' +
      '.km-rec-filter input{display:none}'
    );
    document.head.appendChild(css);
  }

  function filterChipHTML(id, label){
    return (
      '<label class="km-rec-filter" for="' + id + '" id="' + id + '_lbl">' +
        '<input type="checkbox" id="' + id + '" onchange="this.parentElement.classList.toggle(\'active\', this.checked);window.dispatchEvent(new CustomEvent(\'km-rec-filter\',{detail:{id:this.id,on:this.checked}}))">' +
        '<span>⭐ ' + (label || 'TOP PICK만 보기') + '</span>' +
      '</label>'
    );
  }

  // Public API — kept stable so vendor pages don't need to change.
  window.kmRecs = {
    init, setVendor, setBranch, refresh,
    isGlobal, isBranch, isRecommended,
    toggleGlobal, toggleBranch,
    subscribe,
    badgeHTML, toggleHTML, filterChipHTML, cardClass,
    canMark,
  };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }
})();
