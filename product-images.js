/* ============================================================
   product-images.js  —  window.kmImg
   주문 센터(index.html 등) 상품 카드의 "직원이 직접 올린 사진" 모듈.
   - 사진 없는 상품에 📷 촬영 / 📁 파일 / 🔗 URL / Ctrl+V 붙여넣기로 사진 추가
   - Firebase Storage 업로드 → URL 을 RTDB productImages/{vendor}/{id} 에 저장
     (Storage 실패 시 base64 dataURL 폴백 → 항상 동작)
   - 공유 주문이라 모두가 같은 사진을 봄. recommend.js 와 같은 패턴.
   2026-06-28 신규.
   ============================================================ */
(function(){
  const PATH = 'productImages';
  let FB = null;          // { db, ref, set, get, onValue, remove, storage, sRef, uploadBytes, getDownloadURL }
  let MAP = {};           // MAP[vendor][id] = url | dataURL
  let onChange = null;
  let cur = { vendor:'', id:'', name:'' };
  let pending = null;     // { kind:'blob'|'url', blob?, dataUrl?, url? }

  /* ---------- init / sync ---------- */
  function init(fb){ FB = fb; ensureModal(); }
  function subscribe(cb){ onChange = cb; load(); }

  function load(){
    if (!FB || !FB.onValue) return;
    try {
      FB.onValue(FB.ref(FB.db, PATH), function(snap){
        MAP = snap.val() || {};
        if (typeof onChange === 'function') { try { onChange(); } catch(e){} }
      });
    } catch(e){ console.warn('[kmImg] load failed', e); }
  }

  function get(vendor, id){
    try { return (MAP[vendor] && MAP[vendor][id]) || ''; } catch(e){ return ''; }
  }

  /* ---------- card overlay button ---------- */
  function btnHtml(vendor, id, hasImg){
    const v = String(vendor).replace(/'/g,'');
    const i = String(id).replace(/'/g,'');
    const cls = hasImg ? 'kmimg-btn has' : 'kmimg-btn';
    const label = hasImg ? '✏️' : '📷';
    const title = hasImg ? '사진 교체' : '사진 추가';
    return '<button class="'+cls+'" title="'+title+'" onclick="event.stopPropagation();window.kmImg.openModal(\''+v+'\',\''+i+'\')">'+label+'</button>';
  }

  /* ---------- image compression ---------- */
  function compress(srcDataUrl, maxDim, quality){
    return new Promise(function(resolve, reject){
      const img = new Image();
      img.onload = function(){
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h){ reject(new Error('빈 이미지')); return; }
        const scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.round(w*scale); h = Math.round(h*scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          c.toBlob(function(blob){
            const dataUrl = c.toDataURL('image/jpeg', quality);
            resolve({ blob: blob, dataUrl: dataUrl });
          }, 'image/jpeg', quality);
        } catch(e){ reject(e); }   // tainted canvas (CORS)
      };
      img.onerror = function(){ reject(new Error('이미지 로드 실패')); };
      // 같은 출처/ dataURL 은 그대로, 외부 URL 은 CORS 시도
      if (/^https?:/i.test(srcDataUrl)) img.crossOrigin = 'anonymous';
      img.src = srcDataUrl;
    });
  }

  function fileToDataUrl(file){
    return new Promise(function(resolve, reject){
      const r = new FileReader();
      r.onload = function(){ resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function setPendingFromDataUrl(dataUrl){
    try {
      const out = await compress(dataUrl, 500, 0.72);
      pending = { kind:'blob', blob: out.blob, dataUrl: out.dataUrl };
      showPreview(out.dataUrl);
    } catch(e){
      toast('이미지 처리 실패: ' + (e.message||e), true);
    }
  }

  async function setPendingFromUrl(url){
    url = String(url||'').trim();
    if (!/^https?:\/\//i.test(url)){ toast('http(s) 로 시작하는 이미지 주소를 넣어주세요', true); return; }
    // CORS 허용되면 압축·재호스팅, 막히면 URL 그대로 저장(표시는 됨)
    try {
      const out = await compress(url, 500, 0.72);
      pending = { kind:'blob', blob: out.blob, dataUrl: out.dataUrl };
      showPreview(out.dataUrl);
    } catch(e){
      pending = { kind:'url', url: url };
      showPreview(url);
    }
  }

  /* ---------- save / delete ---------- */
  async function save(){
    if (!pending){ toast('먼저 사진을 선택/붙여넣기 하세요', true); return; }
    if (!cur.vendor || !cur.id){ toast('상품 정보 없음', true); return; }
    setBusy(true);
    let finalUrl = '';
    try {
      if (pending.kind === 'url'){
        finalUrl = pending.url;                                  // 외부 URL 그대로
      } else if (pending.kind === 'blob'){
        // 1순위 Storage 업로드 → URL
        if (FB && FB.storage && FB.sRef && FB.uploadBytes && FB.getDownloadURL && pending.blob){
          try {
            const path = 'product-images/' + cur.vendor + '/' + cur.id + '.jpg';
            const r = FB.sRef(FB.storage, path);
            await FB.uploadBytes(r, pending.blob, { contentType:'image/jpeg' });
            finalUrl = await FB.getDownloadURL(r);
          } catch(se){
            console.warn('[kmImg] storage 실패 → base64 폴백', se);
          }
        }
        if (!finalUrl) finalUrl = pending.dataUrl;               // 폴백: base64 RTDB 저장
      }
      if (!finalUrl){ throw new Error('저장할 이미지 없음'); }
      await FB.set(FB.ref(FB.db, PATH + '/' + cur.vendor + '/' + cur.id), finalUrl);
      // 로컬 즉시 반영(스냅샷 도착 전)
      if (!MAP[cur.vendor]) MAP[cur.vendor] = {};
      MAP[cur.vendor][cur.id] = finalUrl;
      if (typeof onChange === 'function') onChange();
      closeModal();
      toast('사진 저장됨 ✓');
    } catch(e){
      toast('저장 실패: ' + (e.message||e), true);
    } finally {
      setBusy(false);
    }
  }

  async function del(){
    if (!cur.vendor || !cur.id) return;
    if (!confirm('이 상품 사진을 삭제할까요?')) return;
    setBusy(true);
    try {
      await FB.remove(FB.ref(FB.db, PATH + '/' + cur.vendor + '/' + cur.id));
      if (MAP[cur.vendor]) delete MAP[cur.vendor][cur.id];
      if (typeof onChange === 'function') onChange();
      closeModal();
      toast('삭제됨');
    } catch(e){ toast('삭제 실패: ' + (e.message||e), true); }
    finally { setBusy(false); }
  }

  /* ---------- modal UI ---------- */
  let modalEl = null;
  function ensureModal(){
    if (modalEl) return;
    const style = document.createElement('style');
    style.textContent = [
      '.kmimg-btn{position:absolute;top:4px;left:4px;z-index:6;width:30px;height:30px;border-radius:8px;border:none;',
        'background:rgba(26,92,58,.92);color:#fff;font-size:15px;line-height:30px;text-align:center;cursor:pointer;padding:0;box-shadow:0 1px 4px rgba(0,0,0,.3)}',
      '.kmimg-btn.has{background:rgba(0,0,0,.55)}',
      '.kmimg-btn:hover{transform:scale(1.08)}',
      '.kmimg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.kmimg-box{background:#fff;border-radius:14px;max-width:380px;width:100%;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3);font-family:inherit}',
      '.kmimg-title{font-size:17px;font-weight:800;color:#111;margin-bottom:2px}',
      '.kmimg-sub{font-size:12px;color:#666;margin-bottom:10px;word-break:break-word}',
      '.kmimg-preview{width:100%;height:160px;border:2px dashed #d1d5db;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px;overflow:hidden;background:#fafafa;margin-bottom:12px}',
      '.kmimg-preview img{max-width:100%;max-height:100%;object-fit:contain}',
      '.kmimg-row{display:flex;gap:8px;margin-bottom:9px}',
      '.kmimg-row button{flex:1;padding:10px 6px;border-radius:8px;border:1px solid #d1d5db;background:#f3f4f6;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}',
      '.kmimg-row input{flex:1;padding:9px 10px;border-radius:8px;border:1px solid #d1d5db;font-size:13px;font-family:inherit;min-width:0}',
      '.kmimg-row .primary{background:#1a5c3a;color:#fff;border-color:#1a5c3a}',
      '.kmimg-row .danger{background:#fff;color:#dc2626;border-color:#f3b4b4}',
      '.kmimg-hint{font-size:11px;color:#9ca3af;text-align:center;margin:2px 0 12px}',
      '.kmimg-box.busy{opacity:.5;pointer-events:none}'
    ].join('');
    document.head.appendChild(style);

    modalEl = document.createElement('div');
    modalEl.className = 'kmimg-overlay';
    modalEl.style.display = 'none';
    modalEl.innerHTML = [
      '<div class="kmimg-box" id="kmimg-box">',
      '  <div class="kmimg-title">상품 사진 추가</div>',
      '  <div class="kmimg-sub" id="kmimg-prod"></div>',
      '  <div class="kmimg-preview" id="kmimg-preview">미리보기 — 사진을 고르거나 붙여넣기</div>',
      '  <div class="kmimg-row">',
      '    <button id="kmimg-cam">📷 촬영</button>',
      '    <button id="kmimg-file">📁 파일</button>',
      '  </div>',
      '  <div class="kmimg-row">',
      '    <input id="kmimg-url" type="text" inputmode="url" placeholder="🔗 인터넷 이미지 주소(URL)">',
      '    <button id="kmimg-url-go" style="flex:0 0 64px">가져오기</button>',
      '  </div>',
      '  <div class="kmimg-hint">또는 이 창에서 <b>Ctrl+V</b> 로 사진 붙여넣기</div>',
      '  <div class="kmimg-row">',
      '    <button id="kmimg-del" class="danger" style="flex:0 0 64px">삭제</button>',
      '    <button id="kmimg-cancel">취소</button>',
      '    <button id="kmimg-save" class="primary">저장</button>',
      '  </div>',
      '</div>',
      '<input type="file" id="kmimg-cam-input" accept="image/*" capture="environment" style="display:none">',
      '<input type="file" id="kmimg-file-input" accept="image/*" style="display:none">'
    ].join('');
    document.body.appendChild(modalEl);

    const $ = function(id){ return modalEl.querySelector('#'+id); };
    $('kmimg-cam').onclick   = function(){ $('kmimg-cam-input').click(); };
    $('kmimg-file').onclick  = function(){ $('kmimg-file-input').click(); };
    $('kmimg-cam-input').onchange  = onPick;
    $('kmimg-file-input').onchange = onPick;
    $('kmimg-url-go').onclick = function(){ setPendingFromUrl($('kmimg-url').value); };
    $('kmimg-url').onkeydown  = function(e){ if (e.key === 'Enter'){ e.preventDefault(); setPendingFromUrl($('kmimg-url').value); } };
    $('kmimg-save').onclick   = save;
    $('kmimg-del').onclick    = del;
    $('kmimg-cancel').onclick = closeModal;
    modalEl.addEventListener('click', function(e){ if (e.target === modalEl) closeModal(); });
    modalEl.addEventListener('paste', onPaste);

    async function onPick(e){
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const dataUrl = await fileToDataUrl(f);
      setPendingFromDataUrl(dataUrl);
    }
    async function onPaste(e){
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (let i=0;i<items.length;i++){
        if (items[i].type && items[i].type.indexOf('image') === 0){
          const f = items[i].getAsFile();
          if (f){ e.preventDefault(); const d = await fileToDataUrl(f); setPendingFromDataUrl(d); return; }
        }
      }
      // 텍스트로 URL 붙여넣은 경우
      const txt = e.clipboardData && e.clipboardData.getData('text');
      if (txt && /^https?:\/\/\S+\.(png|jpe?g|webp|gif)/i.test(txt.trim())){
        e.preventDefault(); modalEl.querySelector('#kmimg-url').value = txt.trim(); setPendingFromUrl(txt.trim());
      }
    }
  }

  function showPreview(src){
    const p = modalEl.querySelector('#kmimg-preview');
    p.innerHTML = '<img src="'+String(src).replace(/"/g,'&quot;')+'" alt="">';
  }
  function setBusy(b){
    const box = modalEl.querySelector('#kmimg-box');
    if (box) box.classList.toggle('busy', !!b);
  }
  function openModal(vendor, id){
    ensureModal();
    cur = { vendor: vendor, id: id, name: '' };
    pending = null;
    const sub = modalEl.querySelector('#kmimg-prod');
    let nm = '';
    try {
      const v = (window.VENDORS && window.VENDORS[vendor]);
      const prod = v && v.products && v.products.find(function(p){ return String(p.id) === String(id); });
      if (prod) nm = (prod.name || prod.nameKr || '') + '  ·  #' + id;
    } catch(e){}
    sub.textContent = nm || ('#' + id);
    modalEl.querySelector('#kmimg-url').value = '';
    const existing = get(vendor, id);
    const prev = modalEl.querySelector('#kmimg-preview');
    if (existing) prev.innerHTML = '<img src="'+existing.replace(/"/g,'&quot;')+'" alt="">';
    else prev.innerHTML = '미리보기 — 사진을 고르거나 붙여넣기';
    modalEl.querySelector('#kmimg-del').style.display = existing ? '' : 'none';
    modalEl.style.display = 'flex';
    // 붙여넣기 받도록 포커스
    setTimeout(function(){ try { modalEl.querySelector('#kmimg-box').focus(); } catch(e){} }, 30);
  }
  function closeModal(){ if (modalEl) modalEl.style.display = 'none'; pending = null; }

  /* ---------- toast ---------- */
  function toast(msg, isErr){
    try {
      let t = document.getElementById('kmimg-toast');
      if (!t){
        t = document.createElement('div');
        t.id = 'kmimg-toast';
        t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;z-index:10001;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:90vw;text-align:center';
        document.body.appendChild(t);
      }
      t.style.background = isErr ? '#b91c1c' : '#111';
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(t._h);
      t._h = setTimeout(function(){ t.style.opacity = '0'; }, 2600);
    } catch(e){ if (isErr) alert(msg); }
  }

  window.kmImg = { init:init, subscribe:subscribe, get:get, btnHtml:btnHtml, openModal:openModal };
})();
