/* 🔁 중복 오더 경고 — "이거 며칠 전에 받았습니다"
 *
 * 2026-10-08 전무님: "지금은 사람이 눈으로 하다 보니 놓치는 경우가 많고,
 *   또 오더해 낭비가 심해서" → 담기 전에 최근 입고를 바로 보여 준다.
 *
 * 읽는 곳 : expiry/{지점}/recvRecent   (인보이스 원장에서 만들어 올린다 — recv_push.js)
 *   { "rhee_full::00025D": { d:"2026-10-01", q:10, n:"상품명", t:2 } }
 *     d = 마지막 입고 날짜 · q = 그때 수량 · n = 이름 · t = 최근 30일 입고 횟수
 *
 * 쓰는 쪽은 상품칸에 띠 하나. 수량을 올릴 때만 소리 내어 알린다(담지 않으면 조용).
 */
(function(){
  var S = { map: null, sales: null, ord: null, same: null, branch: '', listeners: [] };
  var WARN_DAYS = 10;          // 며칠 안에 받았으면 알릴지

  function branch(){ try { return (localStorage.getItem('km_branch') || '').toUpperCase(); } catch(e){ return ''; } }
  function lang(){ try { return localStorage.getItem('km_lang') || localStorage.getItem('kimchi_lang') || 'ko'; } catch(e){ return 'ko'; } }
  function T(ko, en, es){ var l = lang(); return l === 'en' ? en : l === 'es' ? es : ko; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]; }); }

  function key(vendor, pid){ return (String(vendor) + '::' + String(pid)).replace(/[.#$\[\]\/]/g, '_'); }

  // 받은 지 며칠 됐나
  function daysAgo(d){
    if (!d) return null;
    var t = Date.parse(d + 'T00:00:00');
    if (isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86400000);
  }

  function info(vendor, pid){
    if (!S.map) return null;
    var r = S.map[key(vendor, pid)];
    if (!r) return null;
    var ago = daysAgo(r.d);
    if (ago === null || ago > WARN_DAYS) return null;
    return { ago: ago, qty: r.q, name: r.n, times: r.t || 1, date: r.d };
  }

  /* 상품칸에 붙는 띠 — 노랗게, 한 줄. 자리를 많이 쓰지 않는다. */
  function badgeHTML(vendor, pid){
    var r = info(vendor, pid);
    if (!r) return '';
    var when = r.ago === 0 ? T('오늘', 'today', 'hoy')
             : r.ago === 1 ? T('어제', 'yesterday', 'ayer')
             : T(r.ago + '일 전', r.ago + 'd ago', 'hace ' + r.ago + 'd');
    var more = r.times > 1 ? ' · ' + T(r.times + '번', r.times + '×', r.times + '×') : '';
    return '<div class="km-recv" title="' + esc(r.date + ' · ' + r.name) + '">🔁 ' +
      esc(when) + ' ' + esc(String(r.qty)) + T('개 받음', ' received', ' recibido') + esc(more) + '</div>';
  }

  /* 수량을 올릴 때만 묻는다 — 0 → 1 로 처음 담는 순간 한 번.
     이미 담은 걸 더 올리는 중이면 묻지 않는다(귀찮게 하지 않는다). */
  var asked = {};
  function guard(vendor, pid, next, prev){
    if (!(next > 0 && (prev || 0) === 0)) return false;     // 처음 담는 순간만
    var r = info(vendor, pid);
    if (!r) return false;
    var k = key(vendor, pid);
    if (asked[k]) return false;
    asked[k] = 1;
    var when = r.ago === 0 ? T('오늘', 'today', 'hoy')
             : r.ago === 1 ? T('어제', 'yesterday', 'ayer')
             : T(r.ago + '일 전', r.ago + ' days ago', 'hace ' + r.ago + ' días');
    var msg = T(
      '🔁 이 상품은 ' + when + ' ' + r.qty + '개 받았습니다.\n' + r.name + '\n\n그래도 담을까요?',
      '🔁 This item was received ' + when + ' (' + r.qty + ').\n' + r.name + '\n\nAdd it anyway?',
      '🔁 Este artículo se recibió ' + when + ' (' + r.qty + ').\n' + r.name + '\n\n¿Agregar de todos modos?');
    try { return !confirm(msg); } catch(e){ return false; }   // true = 막음
  }

  function count(){ return S.map ? Object.keys(S.map).length : 0; }

  /* 🔀 같은 물건인데 벤더가 다른 경우 — 2026-10-08 전무님:
     "오더할 때 '이거 지난주 다른 벤더에 오더했음' 식으로."
     바코드가 같으면 같은 물건이다. 다른 벤더에 '주문' 한 게 있으면 그것부터, 없으면 '받은' 것을 알린다. */
  function altHTML(vendor, pid){
    if (!S.same) return '';
    var sib = S.same[key(vendor, pid)];
    if (!sib || !sib.length) return '';
    var best = null;
    for (var i = 0; i < sib.length; i++){
      var x = sib[i];
      var o = (x.k && S.ord) ? S.ord[x.k] : null;         // 그 벤더에 주문한 적이 있나
      var cand = o ? { v: x.v, d: o.d, q: o.q, kind: 'ord' }
                   : { v: x.v, d: x.d, q: x.q, kind: 'recv' };
      if (!best || cand.d > best.d) best = cand;
    }
    if (!best) return '';
    var ago = daysAgo(best.d);
    if (ago === null || ago > 30) return '';
    var when = ago <= 1 ? T('어제', 'yesterday', 'ayer')
             : ago <= 7 ? T('지난주', 'last week', 'la semana pasada')
             : T(ago + '일 전', ago + 'd ago', 'hace ' + ago + 'd');
    var what = best.kind === 'ord' ? T('주문함', 'ordered', 'pedido') : T('받음', 'received', 'recibido');
    return '<div class="km-alt" title="' + esc(T('같은 물건을 다른 거래처에서', 'same item, other vendor', 'mismo artículo, otro proveedor')) + '">🔀 ' +
      esc(best.v) + ' ' + esc(when) + ' ' + esc(String(best.q)) + T('개 ', ' ', ' ') + esc(what) + '</div>';
  }

  /* 🛒 언제 몇 개 시켰나 — 2026-10-08 전무님: "이 아이템 언제 몇 개 오더한 기록이 남게."
     아직 안 들어온 주문이면(주문일 > 마지막 입고일) 더 눈에 띄게 알린다. */
  function ordHTML(vendor, pid){
    if (!S.ord) return '';
    var o = S.ord[key(vendor, pid)];
    if (!o || !o.d) return '';
    var ago = daysAgo(o.d);
    if (ago === null || ago > 30) return '';
    var when = ago === 0 ? T('오늘', 'today', 'hoy')
             : ago === 1 ? T('어제', 'yesterday', 'ayer')
             : T(ago + '일 전', ago + 'd ago', 'hace ' + ago + 'd');
    var r = S.map ? S.map[key(vendor, pid)] : null;
    var waiting = !r || !r.d || o.d > r.d;           // 주문했는데 아직 입고 기록이 없다
    return '<div class="km-ord' + (waiting ? ' wait' : '') + '">🛒 ' +
      esc(when) + ' ' + esc(String(o.q)) + T('개 주문', ' ordered', ' pedido') +
      (waiting ? ' · ' + T('입고 대기', 'awaiting', 'pendiente') : '') + '</div>';
  }

  /* 📈 얼마나 팔리는지 — 최근 7일 판매량. 오더할 때 '몇 개 시킬지' 의 근거.
     2026-10-08 전무님: "일일 판매량을 매일 올리면 판매량으로 오더할 때 도움이 되었으면 해." */
  function salesHTML(vendor, pid){
    if (!S.sales) return '';
    var r = S.sales[key(vendor, pid)];
    if (!r || !(r.s > 0)) return '';
    var dd = r.dd || 1;
    var perDay = r.s / dd;
    var rate = perDay >= 1 ? (Math.round(perDay * 10) / 10) + T('개/일', '/day', '/día')
                           : T('가끔', 'slow', 'lento');
    return '<div class="km-sales" title="' + esc(T('최근 ' + dd + '일 판매', 'last ' + dd + ' days', 'últimos ' + dd + ' días')) + '">📈 ' +
      esc(T(dd + '일 ' + r.s + '개 팔림', r.s + ' sold / ' + dd + 'd', r.s + ' vendidos / ' + dd + 'd')) +
      ' · ' + esc(rate) + '</div>';
  }

  function init(fb){
    if (!fb || !fb.db || !fb.ref || !fb.onValue){ console.warn('[kmRecv] init missing args'); return; }
    var br = branch();
    if (!br){ return; }
    S.branch = br;
    try {
      fb.onValue(fb.ref(fb.db, 'expiry/' + br + '/recvRecent'), function(snap){
        S.map = snap.val() || {};
        S.listeners.forEach(function(f){ try { f(); } catch(e){} });
      }, function(err){ console.warn('[kmRecv] read', err && err.message); });
      fb.onValue(fb.ref(fb.db, 'expiry/' + br + '/sameItem'), function(snap){
        S.same = snap.val() || {};
        S.listeners.forEach(function(f){ try { f(); } catch(e){} });
      }, function(err){ console.warn('[kmRecv] same', err && err.message); });
      fb.onValue(fb.ref(fb.db, 'expiry/' + br + '/ordRecent'), function(snap){
        S.ord = snap.val() || {};
        S.listeners.forEach(function(f){ try { f(); } catch(e){} });
      }, function(err){ console.warn('[kmRecv] ord', err && err.message); });
      fb.onValue(fb.ref(fb.db, 'expiry/' + br + '/salesRecent'), function(snap){
        S.sales = snap.val() || {};
        S.listeners.forEach(function(f){ try { f(); } catch(e){} });
      }, function(err){ console.warn('[kmRecv] sales', err && err.message); });
    } catch(e){ console.warn('[kmRecv] init', e); }
  }
  function subscribe(fn){ S.listeners.push(fn); }

  try {
    var css = document.createElement('style');
    css.textContent =
      '.km-recv{display:block;margin:3px 0 0;background:#fef3c7;border:1px solid #fcd34d;color:#92400e;' +
      'border-radius:7px;padding:2px 6px;font-size:9.5px;font-weight:800;line-height:1.35;' +
      'white-space:normal;word-break:keep-all}' +
      '.km-alt{display:block;margin:3px 0 0;background:#fff1f2;border:1px solid #fda4af;color:#9f1239;' +
      'border-radius:7px;padding:2px 6px;font-size:9.5px;font-weight:800;line-height:1.35;' +
      'white-space:normal;word-break:keep-all}' +
      '.km-ord{display:block;margin:3px 0 0;background:#f1f5f9;border:1px solid #cbd5e1;color:#334155;' +
      'border-radius:7px;padding:2px 6px;font-size:9.5px;font-weight:800;line-height:1.35;' +
      'white-space:normal;word-break:keep-all}' +
      '.km-ord.wait{background:#ede9fe;border-color:#c4b5fd;color:#5b21b6}' +
      '.km-sales{display:block;margin:3px 0 0;background:#e0f2fe;border:1px solid #7dd3fc;color:#075985;' +
      'border-radius:7px;padding:2px 6px;font-size:9.5px;font-weight:800;line-height:1.35;' +
      'white-space:normal;word-break:keep-all}';
    (document.head || document.documentElement).appendChild(css);
  } catch(e){}

  window.kmRecv = { init: init, badgeHTML: badgeHTML, salesHTML: salesHTML, ordHTML: ordHTML, altHTML: altHTML, guard: guard, subscribe: subscribe, info: info, count: count, key: key };
})();
