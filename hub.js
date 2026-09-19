/* hub.js — 🏬 헐리우드 경유 품목 (2026-09-19)

   전무님: "물품들을 선정해 벤더에게 직접 오더 못 하게 하고 헐리우드 지점으로 오더하게
   해서 헐리우드에서 각 지점으로 보내는 방법 … 오더 앱에서 그 물품들을 클릭하면
   헐리우드 공동 오더 앱에 들어오게." 배경: 지점마다 박스로 받아 20%만 팔고 버린다.

   · 경유 지정/해제 — 오너·임원만 (추천 표시 kmRecs 와 같은 권한 canMark).
     상품 타일의 [🏬 경유 지정] 버튼. 박스 입수(1박스 몇 개)를 물어 함께 저장.
   · 헐리우드가 아닌 지점 — 경유 품목은 +/− 대신 [🏬 헐리우드에 요청] 버튼.
     누르면 kfood-guide 공동 오더 앱(share-order.html)이 그 품목을 연 채로 열린다.
     setQty 로 들어오는 다른 길(숫자패드 등)도 guard() 가 막는다 — 단, 줄이는 건 허용
     (지정 전에 담아둔 것을 뺄 수 있게).
   · 헐리우드 — 평소처럼 벤더 장바구니에 담는다 (박스로 사서 나눠 보내는 곳).

   저장: shareOrders/_items/{벤더}__{품번} — 공동 오더 앱과 같은 노드라 RTDB 규칙이
   이미 게시돼 있다(shareOrders, 승인 직원 read/write). 품번의 . # $ [ ] / 는 키로 못 쓰므로
   recommend.js 와 같은 방식으로 %XX 인코딩.
*/
(function(){
  const HUB_APP = 'https://specialmasterdj-sketch.github.io/kfood-guide/share-order.html';
  const ORDER_APP = 'https://specialmasterdj-sketch.github.io/kimchi-mart-order/';
  const HUB_BRANCH = 'HOLLYWOOD';
  const S = { items: {}, listeners: [], fb: null };

  function fbKey(id){
    return String(id).replace(/[.#$\[\]\/]|%(?![0-9A-Fa-f]{2})/g,
      ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  }
  function baseId(pid){ return String(pid || '').replace(/__(EA|PL)$/, ''); }   // 낱개·파레트 줄도 같은 상품
  function key(vendor, pid){ return String(vendor) + '__' + fbKey(baseId(pid)); }
  function branch(){ try { return (localStorage.getItem('km_branch') || '').toUpperCase(); } catch(e){ return ''; } }
  function me(){ try { return JSON.parse(localStorage.getItem('chat.me') || 'null') || {}; } catch(e){ return {}; } }
  function canMark(){ try { return !!(window.kmRecs && window.kmRecs.canMark()); } catch(e){ return false; } }
  function lang(){ try { return localStorage.getItem('kimchi_lang') || 'ko'; } catch(e){ return 'ko'; } }
  function T(ko, en, es){ const l = lang(); return l === 'en' ? en : l === 'es' ? es : ko; }
  function esc(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function notify(){ S.listeners.forEach(fn => { try { fn(); } catch(e){ console.warn('[kmHub] listener', e); } }); }

  function init(fb){
    if (!fb || !fb.db || !fb.ref || !fb.onValue){ console.warn('[kmHub] init missing args'); return; }
    S.fb = fb;
    fb.onValue(fb.ref(fb.db, 'shareOrders/_items'), snap => {
      S.items = snap.val() || {};
      notify();
    }, err => console.warn('[kmHub] 경유 품목 불러오기 실패', err && err.message));
  }
  function item(vendor, pid){ const it = S.items[key(vendor, pid)]; return (it && it.active !== false) ? it : null; }
  function isHub(vendor, pid){ return !!item(vendor, pid); }
  function blocked(vendor, pid){ return isHub(vendor, pid) && branch() !== HUB_BRANCH; }
  function reqUrl(vendor, pid){
    return HUB_APP + '?hub=' + encodeURIComponent(key(vendor, pid)) + (branch() ? '&from=' + encodeURIComponent(branch()) : '');
  }

  function badgeHTML(vendor, pid){
    if (!isHub(vendor, pid)) return '';
    return '<div class="km-hub-badge">🏬 ' + T('헐리우드 경유', 'Via Hollywood', 'Vía Hollywood') + '</div>';
  }
  function toggleHTML(vendor, pid){
    if (!canMark()) return '';
    const on = isHub(vendor, pid);
    return '<button type="button" class="km-hub-toggle' + (on ? ' on' : '') + '" ' +
      'onclick="event.stopPropagation();kmHub.toggle(\'' + esc(vendor) + '\',\'' + esc(String(pid).replace(/'/g, "\\'")) + '\')">' +
      (on ? '🏬 ' + T('경유 해제', 'Remove hub', 'Quitar') : '🏬 ' + T('경유 지정', 'Route via Hollywood', 'Vía Hollywood')) + '</button>';
  }
  // 헐리우드가 아닌 지점의 +/− 자리
  function requestHTML(vendor, pid){
    const it = item(vendor, pid);
    return '<a class="km-hub-req" href="' + esc(reqUrl(vendor, pid)) + '" onclick="event.stopPropagation()">' +
      '🏬 ' + T('헐리우드에 요청', 'Request from Hollywood', 'Pedir a Hollywood') + ' →</a>' +
      '<div class="km-hub-note">' + T('이 상품은 벤더에 직접 주문하지 않고 헐리우드에서 받습니다', 'Not ordered from the vendor — Hollywood sends it', 'No se pide al proveedor — lo envía Hollywood') +
      (it && it.caseSize ? ' · ' + T('1박스 ', 'case ', 'caja ') + esc(it.caseSize) + T('개', '', '') : '') + '</div>';
  }
  // setQty 앞에서 부른다. true 면 막은 것.
  function guard(vendor, pid, nextQty, curQty){
    if (!blocked(vendor, pid)) return false;
    if (!(nextQty > (curQty || 0))) return false;           // 줄이기·지우기는 허용
    if (confirm(T('🏬 헐리우드 경유 품목입니다.\n벤더에 직접 주문할 수 없고 헐리우드에서 받습니다.\n\n공동 오더 앱에서 요청할까요?',
                  '🏬 This item is routed via Hollywood.\nIt cannot be ordered from the vendor directly.\n\nOpen the shared order app to request it?',
                  '🏬 Este producto va vía Hollywood.\nNo se puede pedir al proveedor.\n\n¿Abrir la app para pedirlo?'))){
      location.href = reqUrl(vendor, pid);
    }
    return true;
  }
  async function toggle(vendor, pid){
    if (!canMark()) return;
    if (!S.fb || !S.fb.set){ alert(T('아직 연결 중입니다. 잠시 후 다시 눌러주세요.', 'Still connecting — try again.', 'Conectando — intente de nuevo.')); return; }
    const id = baseId(pid), k = key(vendor, id);
    const ref = S.fb.ref(S.fb.db, 'shareOrders/_items/' + k);
    try {
      if (isHub(vendor, id)){
        if (!confirm(T('헐리우드 경유를 해제할까요?\n(지점들이 다시 벤더에 직접 주문하게 됩니다)', 'Remove Hollywood routing?', '¿Quitar vía Hollywood?'))) return;
        await S.fb.set(ref, null);
        return;
      }
      const V = window.VENDORS || (typeof VENDORS !== 'undefined' ? VENDORS : {});
      const vend = V[vendor] || {};
      const p = (vend.products || []).find(x => String(x.id) === String(id)) || {};
      let guess = '';
      try { const m = String(p.size || '').match(/(\d+)\s*[xX×]/); if (m) guess = m[1]; } catch(e){}
      const ans = prompt(T('🏬 헐리우드 경유로 지정합니다.\n' + (p.name || p.nameKr || id) + '\n\n1박스에 몇 개 들어있나요? (지점들이 개수로 요청합니다)',
                          'Route via Hollywood:\n' + (p.name || id) + '\n\nUnits per case?',
                          'Vía Hollywood:\n' + (p.name || id) + '\n\n¿Unidades por caja?'), guess);
      if (ans === null) return;
      const cs = parseInt(ans, 10) || 0;
      let img = p.image || '';
      if (img && !/^(https?:|data:)/.test(img)) img = ORDER_APP + img.replace(/^\.?\//, '');
      await S.fb.set(ref, {
        vendor: vendor, vendorName: vend.name || vendor, vendorNameKr: vend.nameKr || '',
        pid: String(id), name: p.name || p.nameKr || String(id), nameKr: p.nameKr || '',
        size: p.size || '', brand: p.brand || '', barcode: p.barcode || '', price: p.price || 0,
        image: img, caseSize: cs, active: true,
        by: me().name || '', ts: Date.now()
      });
    } catch(e){
      alert(T('저장 실패: ', 'Save failed: ', 'Error: ') + ((e && e.message) || e));
    }
  }
  function subscribe(fn){ S.listeners.push(fn); }
  function count(){ return Object.keys(S.items).filter(k => S.items[k] && S.items[k].active !== false).length; }

  // 스타일 — 페이지 CSS 를 건드리지 않게 여기서 넣는다
  try {
    const css = document.createElement('style');
    css.textContent =
      '.km-hub-badge{display:inline-block;margin:3px 0;background:#ecfdf5;color:#166534;border:1px solid #86efac;border-radius:10px;padding:2px 8px;font-size:10.5px;font-weight:800}' +
      '.km-hub-toggle{display:block;width:100%;margin:4px 0;border:1px dashed #16a34a;background:#fff;color:#166534;border-radius:8px;padding:4px 6px;font-size:10.5px;font-weight:800;cursor:pointer;font-family:inherit}' +
      '.km-hub-toggle.on{background:#dcfce7;border-style:solid}' +
      '.km-hub-req{display:block;text-align:center;margin-top:6px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border-radius:10px;padding:9px 6px;font-size:12.5px;font-weight:900;text-decoration:none}' +
      '.km-hub-note{font-size:9.5px;color:#166534;text-align:center;margin-top:3px;font-weight:600;line-height:1.35}';
    (document.head || document.documentElement).appendChild(css);
  } catch(e){}

  window.kmHub = { init, isHub, blocked, badgeHTML, toggleHTML, requestHTML, guard, toggle, subscribe, count, key };
})();
