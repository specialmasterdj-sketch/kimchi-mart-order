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
    notes: {},          // { productId: "3cs over available" }
    listeners: [],
    fbOps: null,
    unsubGlobal: null,
    unsubNotes: null,
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
    // Hydrate from localStorage immediately so chips show even before the
    // first Firebase snapshot arrives (or if it never does because of auth).
    state.notes = Object.assign({}, _loadLocalNotes());
    // Deferred notify so vendor pages have time to register their subscribe()
    // listener between init() and the actual fire. Without this delay the
    // hydrated notes sit in state but never trigger a re-render.
    setTimeout(notify, 0);
    subscribeGlobal();
    subscribeNotes();
  }

  // Notes now live INSIDE recs_global/<vendor>/<id> as an extra `note` field
  // so they inherit the existing Firebase rules — no schema/rules deployment
  // needed. subscribeNotes is kept as an alias for backward compatibility.
  function subscribeNotes(){ /* merged into subscribeGlobal */ }

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
      // A product is "marked" only if it has a `ts` field — note-only entries
      // (without TOP PICK) must not flip the yellow box on.
      const marked = new Set();
      const notes = {};
      for (const id in v){
        const e = v[id];
        if (!e) continue;
        if (e.ts) marked.add(id);
        if (e.note) notes[id] = String(e.note);
      }
      // Merge in any locally-saved notes that Firebase hasn't acked yet so
      // the chip stays visible even when the cross-device write fails (the
      // owner still wants to see their own memo while we figure out why).
      const localNotes = _loadLocalNotes();
      for (const id in localNotes){ if (!notes[id]) notes[id] = localNotes[id]; }
      state.globalIds = marked;
      state.notes = notes;
      console.info('[kmRecs] ' + path + ' snapshot:', marked.size, 'marked,', Object.keys(notes).length, 'notes (incl ' + Object.keys(localNotes).length + ' local)');
      notify();
    }, (err) => {
      console.warn('[kmRecs] read failed for ' + path + ':', err && err.message);
      // Read fails when the snapshot fires before Firebase auth restored the
      // user from IndexedDB, OR when the signed-in user is not approved in
      // database.rules.json. Retry a few times with backoff so an auth race
      // recovers, but stop after ~30s so we don't hammer Firebase forever
      // when the underlying issue is a missing approved status.
      // Even on read failure, re-notify so the page shows whatever we have
      // (localStorage-hydrated notes) instead of staying blank.
      notify();
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
    if (state.fbOps && state.vendor){ subscribeGlobal(); subscribeNotes(); }
  }

  function isGlobal(productId){ return state.globalIds.has(String(productId)); }
  function getNote(productId){ return state.notes[String(productId)] || ''; }

  // Owner-only — prompts for a short note (e.g. "3cs over available") and
  // stores it under recs_notes/<vendor>/<id>. Empty input clears the note.
  function editNote(productId){
    if (!canMark()){
      _recToast('⚠ 메모 권한이 없습니다 (오너 전용)');
      return;
    }
    if (!state.fbOps || !state.vendor){
      _recToast('⚠ 메모 기능 초기화 안 됨');
      return;
    }
    const id = String(productId);
    const current = state.notes[id] || '';
    const next = window.prompt('OVER 수량 입력 (예: 3cs, 5, 10box) — 비우면 삭제', current);
    if (next === null) return; // user cancelled
    const text = String(next).trim().slice(0, 24);
    // Store the note as a child of recs_global/<vendor>/<id> so it shares the
    // already-deployed RTDB rules and survives a TOP PICK toggle on/off.
    const basePath = 'recs_global/' + state.vendor + '/' + id;
    const m = me() || {};
    // Persist locally FIRST so the chip stays visible even if Firebase rejects
    // or the network is flaky — owner still sees their own memo.
    if (text){ state.notes[id] = text; } else { delete state.notes[id]; }
    _saveLocalNote(id, text);
    notify();
    const onErr = (e) => {
      console.warn('note save failed', e);
      // DO NOT revert local state — keep the chip visible from localStorage.
      _recToast('⚠ 메모 Firebase 동기화 실패 (로컬에만 저장): ' + ((e && e.message) || e));
    };
    if (text){
      state.fbOps.set(state.fbOps.ref(state.db, basePath + '/note'), text).catch(onErr);
      state.fbOps.set(state.fbOps.ref(state.db, basePath + '/noteBy'), m.name || 'unknown').catch(() => {});
    } else {
      state.fbOps.remove(state.fbOps.ref(state.db, basePath + '/note')).catch(onErr);
      state.fbOps.remove(state.fbOps.ref(state.db, basePath + '/noteBy')).catch(() => {});
    }
  }

  // localStorage backup so notes stay visible even when Firebase rejects /
  // is offline. Keyed per vendor so wang notes don't collide with rhee_full.
  function _localKey(){ return 'kmrecs_local_notes_' + (state.vendor || ''); }
  function _loadLocalNotes(){
    try { return JSON.parse(localStorage.getItem(_localKey()) || '{}') || {}; } catch(e){ return {}; }
  }
  function _saveLocalNote(id, text){
    try {
      const map = _loadLocalNotes();
      if (text) map[id] = text; else delete map[id];
      localStorage.setItem(_localKey(), JSON.stringify(map));
    } catch(e){ console.warn('local note save failed', e); }
  }
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
    const basePath = 'recs_global/' + state.vendor + '/' + id;
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
    // Write/remove only the ts+by child paths so an existing note attached
    // to the same product is preserved when toggling the star on/off.
    if (wasOn){
      state.fbOps.remove(state.fbOps.ref(state.db, basePath + '/ts')).catch(onErr);
      state.fbOps.remove(state.fbOps.ref(state.db, basePath + '/by')).catch(() => {});
    } else {
      state.fbOps.set(state.fbOps.ref(state.db, basePath + '/ts'), Date.now()).catch(onErr);
      state.fbOps.set(state.fbOps.ref(state.db, basePath + '/by'), m.name || 'unknown').catch(() => {});
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
  // Includes a second "memo" button so the owner can attach a short note
  // like "3cs over available" without needing a separate UI.
  function toggleHTML(productId){
    if (!canMark()) return '';
    const id = String(productId).replace(/'/g, "\\'");
    const on = isGlobal(productId);
    const hasNote = !!getNote(productId);
    return (
      '<div class="km-rec-tools" onclick="event.stopPropagation()">' +
        '<button class="km-rec-tool' + (on ? ' on' : '') + '" ' +
                'onclick="event.stopPropagation();window.kmRecs.toggleGlobal(\'' + id + '\')" ' +
                'title="' + (on ? '추천 해제' : '⭐ 추천 마크 (전 지점 무조건 발주)') + '">' +
          (on ? '⭐' : '☆') +
        '</button>' +
        '<button class="km-rec-tool km-rec-note-btn' + (hasNote ? ' on' : '') + '" ' +
                'onclick="event.stopPropagation();window.kmRecs.editNote(\'' + id + '\')" ' +
                'title="' + (hasNote ? '메모 편집' : '메모 추가 (예: 3cs over available)') + '">' +
          '📝' +
        '</button>' +
      '</div>'
    );
  }

  // Visible to ALL users — shows the owner's minimum-order reference
  // ("over: 3cs"). Renders nothing if no note is set.
  function noteHTML(productId){
    const text = getNote(productId);
    if (!text) return '';
    const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return '<span class="km-rec-note" title="OVER: ' + safe + '"><span class="km-rec-note-prefix">OVER:</span>' + safe + '</span>';
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
      // Owner-set "over: ___" reference (e.g., "over: 3cs"). Inline next to
      // the TOP PICK badge so ordering staff can see the minimum at a glance.
      '.km-rec-note{display:inline-block;background:#0369a1;color:#fff;padding:1px 6px;' +
        'border-radius:3px;font-size:9px;font-weight:700;letter-spacing:.3px;' +
        'margin-left:4px;vertical-align:middle;box-shadow:0 1px 2px rgba(3,105,161,.35);' +
        'text-transform:uppercase;white-space:nowrap;cursor:pointer}' +
      '.km-rec-note:hover{background:#075985}' +
      '.km-rec-note-prefix{opacity:.75;font-weight:600;margin-right:2px}' +
      // Owner-only toggle row — square buttons that flow normally below the
      // product name (instead of an absolute corner overlay that hides text).
      '.km-rec-tools{display:flex;gap:4px;justify-content:center;margin:4px 0;z-index:6}' +
      '.km-rec-tool{min-width:28px;height:24px;border-radius:4px;border:1.5px solid #d97706;' +
        'background:#fff;font-size:13px;line-height:1;cursor:pointer;padding:0 6px;' +
        'display:inline-flex;align-items:center;justify-content:center;font-family:inherit;' +
        'opacity:.85;transition:.12s}' +
      '.km-rec-tool:hover{opacity:1;background:#fef3c7}' +
      '.km-rec-tool.on{opacity:1;background:#fbbf24;color:#fff;border-color:#b45309;' +
        'box-shadow:0 0 0 2px rgba(245,158,11,.3)}' +
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
    noteHTML, editNote, getNote,
    canMark,
  };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }
})();
