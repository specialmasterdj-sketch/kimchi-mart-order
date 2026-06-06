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

  // Owner-only by user's explicit decision — only B.H.K marks ⭐. Everyone
  // else can SEE the badge/box but cannot toggle. This effectively locks
  // marks: once 사장님 marks it, no other manager can un-mark.
  const OWNER_ROLES = /^(OWNER|오너|사장|대표|BOSS|DUEÑO|PROPIETARIO)$/i;
  const OWNER_NAMES = ['BHK','B.H.K','BHK','비에이치케이'];

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
    state.unsubGlobal = fbOps.onValue(fbOps.ref(db, 'recs_global/' + vendor), (snap) => {
      const v = snap.val() || {};
      state.globalIds = new Set(Object.keys(v));
      notify();
    });
  }

  function isGlobal(productId){ return state.globalIds.has(String(productId)); }
  // Branch-scoped variants kept as no-ops so old vendor integrations still
  // load without error. They always return false / do nothing.
  function isBranch(/*productId*/){ return false; }
  function isRecommended(productId){ return isGlobal(productId); }

  function toggleGlobal(productId){
    if (!canMark() || !state.fbOps || !state.vendor) return;
    const id = String(productId);
    const path = 'recs_global/' + state.vendor + '/' + id;
    const m = me() || {};
    if (state.globalIds.has(id)){
      state.fbOps.remove(state.fbOps.ref(state.db, path)).catch(e => console.warn('rec remove failed', e));
    } else {
      state.fbOps.set(state.fbOps.ref(state.db, path), { ts: Date.now(), by: m.name || 'unknown' })
        .catch(e => console.warn('rec set failed', e));
    }
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
    return '<span class="km-rec-badge" title="사장님 추천 — 무조건 발주">⭐ 사장님 추천</span>';
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
      '.km-rec-card{outline:4px solid #f59e0b !important;outline-offset:-4px;' +
        'background:linear-gradient(180deg,#fffbeb 0%,#fff7d6 100%) !important;' +
        'box-shadow:0 0 0 1px rgba(245,158,11,.45),0 6px 18px rgba(245,158,11,.28) !important;' +
        'position:relative}' +
      // Top-left corner flag (triangle) on every marked card
      '.km-rec-card::before{content:"⭐";position:absolute;top:0;left:0;width:34px;height:34px;' +
        'display:flex;align-items:center;justify-content:center;font-size:18px;' +
        'background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#fff;' +
        'clip-path:polygon(0 0,100% 0,0 100%);z-index:4;pointer-events:none;' +
        'text-shadow:0 1px 1px rgba(0,0,0,.3);padding:2px 0 0 2px}' +
      // Inline "사장님 추천" label
      '.km-rec-badge{display:inline-block;background:#f59e0b;color:#fff;padding:2px 8px;' +
        'border-radius:6px;font-size:.72em;font-weight:800;letter-spacing:.3px;' +
        'margin-left:6px;vertical-align:middle;box-shadow:0 1px 3px rgba(245,158,11,.4)}' +
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
        '<span>⭐ ' + (label || '사장님 추천만 보기') + '</span>' +
      '</label>'
    );
  }

  // Public API — kept stable so vendor pages don't need to change.
  window.kmRecs = {
    init, setVendor, setBranch,
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
