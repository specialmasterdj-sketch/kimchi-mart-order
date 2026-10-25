// build_top500_map.js — 그로서리 Top 500 품목(UPC) ↔ 오더센터 상품 id 연결표를 만든다.
// 2026-10-25 사장님: "Top 500 점검에서 없음(✗)이 나온 제품을 오더센터에서 계속 깜빡이게 해서 오더로 이어지게"
//
//   node _Claude_Tools/build_top500_map.js <kfood-guide 폴더>
//   → top500-map.json  { asof, vendors: { <vendor>: { <productId>: <top500 itemId> } } }
//
// 오더센터 쪽 상품 목록(products.js · hanmi/cj · rheebros · wismettac)을 그대로 읽어
// 바코드(UPC) 숫자로만 맞춘다. 이름으로는 맞추지 않는다(틀린 연결이 없는 것보다 나쁘다).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const KFOOD = process.argv[2];
if (!KFOOD) { console.error('usage: node build_top500_map.js <kfood-guide dir>'); process.exit(1); }

// UPC 정규화: 숫자만, 앞 0 제거. 한쪽만 체크디지트가 붙은 경우(길이가 정확히 1 차이)만 끝자리를 떼고 맞춘다.
// (둘 다 끝자리를 떼면 '비프 사발면 ↔ 랍스터 사발면' 같은 틀린 연결이 생겼다)
const digits = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');

// Top 500 품목: itemId('u'+code) 별 UPC
const top = new Map();   // normalized upc → itemId
for (const f of fs.readdirSync(path.join(KFOOD, 'key-grocery-cat'))) {
  if (!f.endsWith('.json')) continue;
  const j = JSON.parse(fs.readFileSync(path.join(KFOOD, 'key-grocery-cat', f), 'utf8'));
  for (const it of j.items || []) { const d = digits(it.code); if (d.length >= 8 && !top.has(d)) top.set(d, it.id); }
}

function load(files){
  const ctx = { window: {}, console };
  ctx.globalThis = ctx; ctx.self = ctx.window;
  vm.createContext(ctx);
  for (const f of files) {
    let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    src = src.replace(/^\s*(const|let)\s+([A-Z_][A-Z0-9_]*)\s*=/gm, 'var $2 =');   // const → var 로 바꿔 ctx 에 남긴다
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx;
}
// 객체 안을 돌며 {id, upc|barcode|barcodeDisplay} 를 가진 상품을 모은다
function walk(o, out, seen = new Set()){
  if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
  if (Array.isArray(o)) { o.forEach(x => walk(x, out, seen)); return; }
  if (o.id != null && (o.upc || o.barcode || o.barcodeDisplay)) out.push(o);
  for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, out, seen);
}
const topTrim = new Map();   // Top 500 쪽 끝자리(체크디지트) 뗀 것 → itemId
for (const [d, id] of top) if (!topTrim.has(d.slice(0, -1))) topTrim.set(d.slice(0, -1), id);
// GS1(UPC/EAN) 체크디지트: 오른쪽부터 3,1,3,1… 가중합 → 10의 배수로 맞추는 숫자. 앞자리 0 은 영향 없음.
const checkDigit = body => { let sum = 0; for (let i = 0; i < body.length; i++) sum += (+body[body.length - 1 - i]) * (i % 2 ? 1 : 3); return (10 - sum % 10) % 10; };
function findTop(src){
  const d = digits(src); if (d.length < 8) return null;
  if (top.has(d)) return top.get(d);                                    // 똑같음
  const body = d.slice(0, -1);                                          // 오더센터 쪽에만 체크디지트
  if (top.has(body) && checkDigit(body) === +d.slice(-1)) return top.get(body);
  const t = topTrim.get(d);                                             // Top 500 쪽에만 체크디지트
  if (t && checkDigit(d) === +String([...top].find(([k, v]) => v === t)[0]).slice(-1)) return t;
  return null;
}
// 바코드는 맞는데 이름이 전혀 다른 것 — 벤더 카탈로그 쪽 바코드 오류로 보고 연결하지 않는다 (2026-10-25 육안 검수)
const EXCLUDE = new Set(['wang:087703064522', 'well_luck:072810293606']);
const vendors = {};
function add(vendor, list){
  const m = vendors[vendor] = vendors[vendor] || {};
  for (const p of list) {
    for (const src of [p.upc, p.barcode, p.barcodeDisplay]) {
      if (src && EXCLUDE.has(vendor + ':' + String(src).replace(/\D/g, ''))) break;
      const hit = findTop(src);
      if (hit) { m[String(p.id)] = hit; break; }
    }
  }
}

// index.html — VENDORS[<vendor>] 안의 상품들
{ const c = load(['products.js']); for (const [v, def] of Object.entries(c.VENDORS || {})) { const l = []; walk(def, l); add(v, l); } }
// hanmi.html (vendor 'wang') — 한미 + CJ
{ const c = load(['hanmi_products.js', 'cj_products.js']); const l = []; walk(c.window, l); walk(c.CJ_PRODUCTS, l); add('wang', l); }
// rheebros.html (vendor 'rhee_full')
{ const c = load(['rheebros_products.js']); const l = []; walk(c.window, l); add('rhee_full', l); }
// wismettac.html (vendor 'wismettac') — 데이터 파일이 있으면
for (const f of fs.readdirSync(ROOT)) if (/^wismettac.*products.*\.js$/i.test(f)) { const c = load([f]); const l = []; walk(c.window, l); walk(c, l); add('wismettac', l); }

for (const v of Object.keys(vendors)) if (!Object.keys(vendors[v]).length) delete vendors[v];
const out = { asof: new Date().toISOString().slice(0, 10), vendors };
fs.writeFileSync(path.join(ROOT, 'top500-map.json'), JSON.stringify(out));
const linked = new Set(Object.values(vendors).flatMap(m => Object.values(m)));
console.log('Top 500 items:', new Set(top.values()).size, '· linked:', linked.size);
for (const [v, m] of Object.entries(vendors)) console.log(' ', v, Object.keys(m).length);
