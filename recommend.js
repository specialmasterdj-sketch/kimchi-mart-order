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
    globalIds: new Set(),   // star / TOP PICK (recs_global/<vendor>/<id>/ts)
    bestIds: new Set(),     // BEST ITEM — separate red mark (.../best)
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
      const best = new Set();
      const notes = {};
      for (const id in v){
        const e = v[id];
        if (!e) continue;
        if (e.ts) marked.add(id);
        if (e.best) best.add(id);
        if (e.note) notes[id] = String(e.note);
      }
      // Merge in any locally-saved notes that Firebase hasn't acked yet so
      // the chip stays visible even when the cross-device write fails (the
      // owner still wants to see their own memo while we figure out why).
      const localNotes = _loadLocalNotes();
      for (const id in localNotes){ if (!notes[id]) notes[id] = localNotes[id]; }
      state.globalIds = marked;
      state.bestIds = best;
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
  function isBest(productId){ return state.bestIds.has(String(productId)); }
  function getNote(productId){ return state.notes[String(productId)] || ''; }

  // Owner-only — prompts for a short note (e.g. "3cs over available") and
  // stores it under recs_notes/<vendor>/<id>. Empty input clears the note.
  // 🆕 2026-06-08: replaced native window.prompt() with a custom in-page modal
  //   so it can't be silently blocked by Chrome's "prevent additional dialogs"
  //   toggle (which the owner accidentally hit, leaving the OK button dead).
  async function editNote(productId){
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
    const next = await _recPromptModal(
      'OVER 수량 입력',
      '예: 3cs, 5, 10box — 비우면 삭제',
      current
    );
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
    // 🆕 2026-06-08: 사장님 리포트 "확인 눌러도 반영 안 됨" — UX 가 무피드백.
    //   저장 직후 명확한 토스트 표시. Firebase 비동기 결과와 별도로 사용자는
    //   즉시 "저장됐다" 확인 가능. (로컬엔 이미 박혔으니 진실에 부합.)
    _recToast(text ? ('✅ OVER 저장: ' + text) : '🗑 OVER 삭제');
    const onErr = (e) => {
      console.warn('note save failed', e);
      // DO NOT revert local state — keep the chip visible from localStorage.
      _recToast('⚠ Firebase 동기화 실패 (로컬엔 저장됨): ' + ((e && e.message) || e));
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
  // "추천만 보기" filter shows BOTH star (TOP PICK) and BEST ITEM marks so
  // first-time orderers can isolate every important product at once.
  function isRecommended(productId){ return isGlobal(productId) || isBest(productId); }

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

  // BEST ITEM — a SEPARATE mark from the star, stored at
  // recs_global/<vendor>/<id>/best so it toggles independently of /ts (star)
  // and /note (memo). Owner-only, same optimistic-write pattern as the star.
  function toggleBest(productId){
    if (!canMark()){
      _recToast('⚠ BEST ITEM 권한이 없습니다 (오너 전용)');
      return;
    }
    if (!state.fbOps || !state.vendor){
      _recToast('⚠ 기능 초기화 안 됨 (새로고침 해보세요)');
      return;
    }
    const id = String(productId);
    const basePath = 'recs_global/' + state.vendor + '/' + id;
    const m = me() || {};
    const wasOn = state.bestIds.has(id);
    if (wasOn) state.bestIds.delete(id); else state.bestIds.add(id);
    notify();
    const onErr = (e) => {
      console.warn('best toggle failed', e);
      if (wasOn) state.bestIds.add(id); else state.bestIds.delete(id);
      notify();
      _recToast('⚠ BEST ITEM 저장 실패: ' + ((e && e.message) || e) + ' — 권한/규칙 확인');
    };
    if (wasOn){
      state.fbOps.remove(state.fbOps.ref(state.db, basePath + '/best')).catch(onErr);
      state.fbOps.remove(state.fbOps.ref(state.db, basePath + '/bestBy')).catch(() => {});
    } else {
      state.fbOps.set(state.fbOps.ref(state.db, basePath + '/best'), Date.now()).catch(onErr);
      state.fbOps.set(state.fbOps.ref(state.db, basePath + '/bestBy'), m.name || 'unknown').catch(() => {});
    }
  }

  // In-page prompt modal — replaces window.prompt() so Chrome's silent
  // "prevent additional dialogs" toggle can't dead-lock the OK button.
  // Returns a Promise that resolves to the entered string, or null on cancel.
  function _recPromptModal(title, hint, current){
    return new Promise((resolve) => {
      let resolved = false;
      const overlay = document.createElement('div');
      overlay.className = 'km-rec-prompt-overlay';
      overlay.innerHTML = (
        '<div class="km-rec-prompt-box" role="dialog" aria-modal="true">' +
          '<div class="km-rec-prompt-title"></div>' +
          '<div class="km-rec-prompt-hint"></div>' +
          '<input type="text" class="km-rec-prompt-input" maxlength="24" autocomplete="off">' +
          '<div class="km-rec-prompt-btns">' +
            '<button type="button" class="km-rec-prompt-cancel">취소</button>' +
            '<button type="button" class="km-rec-prompt-ok">확인</button>' +
          '</div>' +
        '</div>'
      );
      // Use textContent so untrusted strings can't inject HTML.
      overlay.querySelector('.km-rec-prompt-title').textContent = String(title || '');
      overlay.querySelector('.km-rec-prompt-hint').textContent  = String(hint  || '');
      const input = overlay.querySelector('.km-rec-prompt-input');
      input.value = current == null ? '' : String(current);
      document.body.appendChild(overlay);
      // Defer focus to next tick so iOS Safari actually shows the keyboard.
      setTimeout(() => { try { input.focus(); input.select(); } catch(e){} }, 30);
      const done = (val) => {
        if (resolved) return;
        resolved = true;
        try { overlay.remove(); } catch(e){}
        resolve(val);
      };
      // 🆕 2026-06-08: iOS PWA 에서 click 만으로는 가끔 OK 가 안 먹히는 케이스 보고.
      //   pointerup 도 동시 바인딩 — 둘 중 하나만 와도 done() 발동 (resolved 가드).
      //   pointerup 은 마우스·터치·펜 모두 통일된 이벤트.
      const okBtn = overlay.querySelector('.km-rec-prompt-ok');
      const cancelBtn = overlay.querySelector('.km-rec-prompt-cancel');
      const bindFire = (el, val) => {
        const fire = (e) => { try { e.preventDefault(); } catch(_){} done(typeof val === 'function' ? val() : val); };
        el.addEventListener('click', fire);
        el.addEventListener('pointerup', fire);
      };
      bindFire(okBtn,    () => input.value);
      bindFire(cancelBtn, null);
      // Click on the dim background = cancel (matches the cart/pd modal UX).
      overlay.addEventListener('click', (e) => { if (e.target === overlay) done(null); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){ e.preventDefault(); done(input.value); }
        else if (e.key === 'Escape'){ e.preventDefault(); done(null); }
      });
    });
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
    let c = '';
    if (isGlobal(productId)) c += ' km-rec-card';       // star → yellow box
    if (isBest(productId))   c += ' km-rec-best-card';  // best → red outline
    return c;
  }

  // Visible to ALL users. Star (TOP PICK, orange) and BEST ITEM (red) are
  // independent badges — a product can show either, both, or neither.
  function badgeHTML(productId){
    let out = '';
    if (isGlobal(productId)) out += '<span class="km-rec-badge" title="TOP PICK — 추천">⭐ TOP PICK</span>';
    if (isBest(productId))   out += '<span class="km-rec-badge-best" title="BEST ITEM — 꼭 주문하세요 / Must order">⭐ BEST ITEM</span>';
    return out;
  }

  // Toggle button — only rendered for OWNER. Empty string for everyone else
  // (so other managers cannot un-mark a product the owner pinned).
  // Includes a second "memo" button so the owner can attach a short note
  // like "3cs over available" without needing a separate UI.
  function toggleHTML(productId){
    if (!canMark()) return '';
    const id = String(productId).replace(/'/g, "\\'");
    const on = isGlobal(productId);
    const onBest = isBest(productId);
    const hasNote = !!getNote(productId);
    return (
      '<div class="km-rec-tools" onclick="event.stopPropagation()">' +
        '<button class="km-rec-tool' + (on ? ' on' : '') + '" ' +
                'onclick="event.stopPropagation();window.kmRecs.toggleGlobal(\'' + id + '\')" ' +
                'title="' + (on ? '추천(TOP PICK) 해제' : '⭐ 추천 마크 (TOP PICK)') + '">' +
          (on ? '⭐' : '☆') +
        '</button>' +
        '<button class="km-rec-tool km-rec-best-btn' + (onBest ? ' on' : '') + '" ' +
                'onclick="event.stopPropagation();window.kmRecs.toggleBest(\'' + id + '\')" ' +
                'title="' + (onBest ? 'BEST ITEM 해제' : 'BEST ITEM 표시 (빨간 라벨 · 전 지점)') + '">' +
          'BEST' +
        '</button>' +
        '<button class="km-rec-tool km-rec-note-btn' + (hasNote ? ' on' : '') + '" ' +
                'onclick="event.stopPropagation();window.kmRecs.editNote(\'' + id + '\')" ' +
                'title="' + (hasNote ? '메모 편집' : '메모 추가 (예: 3cs over available)') + '">' +
          '📝' +
        '</button>' +
      '</div>'
    );
  }

  // Pick the natural unit for a product when the owner types just a number.
  // Rice / grain SKUs 15 LB or heavier are sold by the bag; everything else
  // ships in cases. Looks at name + Korean name + category fields so it
  // works across all vendor product shapes (hanmi, wismettac, rheebros, …).
  function defaultUnit(p){
    if (!p) return 'cs';
    const blob = String(
      (p.name||'') + ' ' + (p.nameKr||'') + ' ' +
      (p.category||'') + ' ' + (p.categoryKr||'')
    ).toUpperCase();
    const isRiceGrain = /RICE|GRAIN|JASMINE|쌀|곡물/.test(blob);
    if (!isRiceGrain) return 'cs';
    const size = String(p.size || p.packSize || '');
    const lbMatch = size.match(/(\d+(?:\.\d+)?)\s*LB/i);
    const lbs = lbMatch ? parseFloat(lbMatch[1]) : 0;
    return lbs >= 15 ? 'bag' : 'cs';
  }

  // Visible to ALL users — shows the owner's minimum-order reference
  // ("OVER: 5cs"). Bare numbers get a default unit appended so the owner
  // can type just "5". defaultUnit is normally "cs" but vendor pages pass
  // "bag" for rice / grain SKUs 15 LB or larger.
  function noteHTML(productId, defaultUnitOverride){
    const text = getNote(productId);
    if (!text) return '';
    const unit = defaultUnitOverride || 'cs';
    const trimmed = String(text).trim();
    const display = /^\d+$/.test(trimmed) ? trimmed + unit : trimmed;
    const safe = display.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      // Star / TOP PICK badge — orange.
      '.km-rec-badge{display:inline-block;background:#f59e0b;color:#fff;padding:1px 5px;' +
        'border-radius:3px;font-size:9px;font-weight:700;letter-spacing:.5px;' +
        'margin:0 4px 3px 0;vertical-align:middle;box-shadow:0 1px 2px rgba(245,158,11,.35);text-transform:uppercase}' +
      // BEST ITEM badge — bold red with a gentle pulse so first-time orderers
      // cannot miss it. Independent of the star.
      '.km-rec-badge-best{display:inline-block;background:#dc2626;color:#fff;padding:2px 7px;' +
        'border-radius:4px;font-size:10.5px;font-weight:800;letter-spacing:.4px;' +
        'margin:0 0 3px 0;vertical-align:middle;box-shadow:0 1px 3px rgba(220,38,38,.45);' +
        'text-transform:uppercase;animation:kmRecPulse 2s ease-in-out infinite}' +
      '@keyframes kmRecPulse{0%,100%{box-shadow:0 1px 3px rgba(220,38,38,.45)}' +
        '50%{box-shadow:0 0 0 3px rgba(220,38,38,.18),0 1px 3px rgba(220,38,38,.45)}}' +
      // BEST ITEM card outline — red. Declared after .km-rec-card so a product
      // that is BOTH star+best keeps the yellow background but gets the red ring.
      '.km-rec-best-card{outline:2px solid #dc2626 !important;outline-offset:-2px;position:relative}' +
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
      // BEST ITEM toggle button — red text, fills solid red when on.
      '.km-rec-best-btn{border-color:#dc2626;color:#dc2626;font-size:9px;font-weight:800;letter-spacing:.3px}' +
      '.km-rec-best-btn:hover{background:#fee2e2}' +
      '.km-rec-best-btn.on{opacity:1;background:#dc2626;color:#fff;border-color:#b91c1c;' +
        'box-shadow:0 0 0 2px rgba(220,38,38,.3)}' +
      // Header filter chip
      '.km-rec-filter{display:inline-flex;align-items:center;gap:6px;background:#fff8e1;border:1.5px solid #f59e0b;' +
        'border-radius:18px;padding:5px 12px;font-size:.82em;font-weight:700;color:#92400e;cursor:pointer;' +
        'user-select:none;font-family:inherit;margin-left:8px}' +
      '.km-rec-filter:hover{background:#fef3c7}' +
      '.km-rec-filter.active{background:#f59e0b;color:#fff;border-color:#d97706}' +
      '.km-rec-filter input{display:none}' +
      // Custom OVER-input modal — used by editNote so Chrome cannot dead-lock
      // the OK button via the silent "block additional dialogs" toggle.
      '.km-rec-prompt-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000;' +
        'display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit;' +
        'animation:kmRecFade .15s ease-out}' +
      '@keyframes kmRecFade{from{opacity:0}to{opacity:1}}' +
      '.km-rec-prompt-box{background:#fff;border-radius:14px;max-width:380px;width:100%;padding:18px 18px 14px;' +
        'box-shadow:0 12px 40px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:10px}' +
      '.km-rec-prompt-title{font-size:15px;font-weight:800;color:#1a1a1a;line-height:1.3}' +
      '.km-rec-prompt-hint{font-size:12.5px;color:#666;line-height:1.4}' +
      '.km-rec-prompt-input{width:100%;padding:11px 13px;border:1.5px solid #d4d4d8;border-radius:9px;' +
        'font-size:15px;font-weight:700;color:#222;outline:none;font-family:inherit;background:#fafafa;' +
        'transition:border-color .12s,background .12s}' +
      '.km-rec-prompt-input:focus{border-color:#f59e0b;background:#fff;box-shadow:0 0 0 3px rgba(245,158,11,.18)}' +
      '.km-rec-prompt-btns{display:flex;gap:8px;margin-top:4px}' +
      '.km-rec-prompt-btns button{flex:1;border:none;border-radius:9px;padding:11px 14px;font-size:13.5px;' +
        'font-weight:800;cursor:pointer;font-family:inherit;transition:transform .08s,opacity .12s}' +
      '.km-rec-prompt-btns button:active{transform:scale(0.97)}' +
      '.km-rec-prompt-cancel{background:#f1f5f9;color:#475569}' +
      '.km-rec-prompt-cancel:hover{background:#e2e8f0}' +
      '.km-rec-prompt-ok{background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#fff;' +
        'box-shadow:0 2px 8px rgba(245,158,11,.35)}' +
      '.km-rec-prompt-ok:hover{opacity:.92}'
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
    isGlobal, isBest, isBranch, isRecommended,
    toggleGlobal, toggleBest, toggleBranch,
    subscribe,
    badgeHTML, toggleHTML, filterChipHTML, cardClass,
    noteHTML, editNote, getNote, defaultUnit,
    canMark,
  };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }
})();
