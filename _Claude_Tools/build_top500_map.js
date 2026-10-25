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

// 벤더별 상품 목록 — 각 오더 페이지가 kmRecs 에 넘기는 p.id 기준
const isProduct = o => o.id != null && (o.name || o.nameKr || o.en) && (o.size || o.packSize || o.unit || o.um || o.price != null || o.upc || o.barcode);
function walkAll(o, out, seen = new Set()){
  if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
  if (Array.isArray(o)) { o.forEach(x => walkAll(x, out, seen)); return; }
  if (isProduct(o)) out.push(o);
  for (const v of Object.values(o)) if (v && typeof v === 'object') walkAll(v, out, seen);
}
const lists = {};
// index.html — VENDORS[<vendor>] 안의 상품들
{ const c = load(['products.js']); for (const [v, def] of Object.entries(c.VENDORS || {})) { lists[v] = []; walkAll(def, lists[v]); } }
// hanmi.html (vendor 'wang') — 한미 + CJ   ·  rheebros.html (vendor 'rhee_full')
{ const c = load(['hanmi_products.js', 'cj_products.js']); lists.wang = []; walkAll(c.window, lists.wang); walkAll(c.CJ_PRODUCTS, lists.wang); }
{ const c = load(['rheebros_products.js']); lists.rhee_full = []; walkAll(c.window, lists.rhee_full); }
// wismettac.html — 상품 목록이 페이지 안 PRODUCTS 에 있다
{ const html = fs.readFileSync(path.join(ROOT, 'wismettac.html'), 'utf8');
  const line = html.split(/\r?\n/).find(l => l.startsWith('const PRODUCTS = ['));
  if (line) lists.wismettac = JSON.parse(line.slice('const PRODUCTS = '.length).replace(/;\s*$/, '')); }

// ① 카탈로그에 바코드가 있는 상품 — 바코드로 바로
for (const [v, l] of Object.entries(lists)) add(v, l.filter(p => p.upc || p.barcode || p.barcodeDisplay));
const viaBarcode = Object.values(vendors).reduce((n, m) => n + Object.keys(m).length, 0);

// ② 카탈로그에 바코드가 없는 벤더 — POS 상품 마스터를 다리로 쓴다
//    Top 500 바코드 → POS 행(FULL_BARCODE) → 그 행의 VENDOR + VENDOR_CODE(벤더 품번) → 같은 벤더 카탈로그에서 품번이 똑같은 상품
//    POS 벤더 ↔ 오더센터 벤더 짝은 사람이 정한 표만 쓴다(추측 금지). 품번은 대소문자·기호·앞 0 만 무시하고 정확히 같아야 한다.
//    POS 파일: [바코드, 벤더, 벤더품번, 이름] 배열 (kfood-guide 의 products/<지점>/rows 에서 뽑음) — 3번째 인자
const POS2ORD = { 'JFC':'jfc', 'ASSI':'rhee_full', 'WISMETTAC':'wismettac', 'SEOULTRADING':'seoul_trading', 'EASTLAND':'eastland',
  'WANG HANMI':'wang', 'HANMI':'wang', 'CJ':'wang', 'LINK TRADING':'link', 'EASTERN WINE':'eastern_wine', 'WALONG':'walong', 'OCM':'ocm',
  'TWO BROS':'two_bros_food', 'WELL LUCK':'well_luck', 'FAF':'faf', 'HAITAI':'haitai', 'POCAS':'pocas', 'AAF IMPORT':'aaf', 'FRESHPOINT':'freshpoint' };
// POS 다리로 이어졌지만 이름이 전혀 다른 것 — POS 쪽 품번 오류로 보고 빼 둔다 (2026-10-25 육안 검수)
const EXCLUDE_POS = new Set(['two_bros_food:HKT907', 'two_bros_food:KMN301', 'eastern_wine:3904']);
const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
const POSFILE = process.argv[3];
let viaPos = 0;
if (POSFILE && fs.existsSync(POSFILE)) {
  const byCode = {};
  for (const [v, l] of Object.entries(lists)) { byCode[v] = new Map(); for (const p of l) { const k = normCode(p.id); if (k.length >= 3 && !byCode[v].has(k)) byCode[v].set(k, p); } }
  for (const r of JSON.parse(fs.readFileSync(POSFILE, 'utf8'))) {
    const [bc, pv, vcode] = r;
    const ov = POS2ORD[String(pv || '').trim().toUpperCase()];
    if (!ov || !byCode[ov]) continue;
    const item = findTop(bc); if (!item) continue;
    const k = normCode(vcode); if (k.length < 3) continue;
    const p = byCode[ov].get(k); if (!p) continue;
    if (EXCLUDE_POS.has(ov + ':' + p.id)) continue;
    const m = vendors[ov] = vendors[ov] || {};
    if (!m[String(p.id)]) { m[String(p.id)] = item; viaPos++; }
  }
}
console.log('via barcode', viaBarcode, '· via POS bridge', viaPos);
for (const v of Object.keys(vendors)) if (!Object.keys(vendors[v]).length) delete vendors[v];
// 오더센터 🔴 목록에 띄울 이름 (연결된 품목만)
const names = {};
{ const want = new Set(Object.values(vendors).flatMap(m => Object.values(m)));
  for (const f of fs.readdirSync(path.join(KFOOD, 'key-grocery-cat'))) if (f.endsWith('.json'))
    for (const it of JSON.parse(fs.readFileSync(path.join(KFOOD, 'key-grocery-cat', f), 'utf8')).items || [])
      if (want.has(it.id) && !names[it.id]) names[it.id] = [it.en || '', it.ko || ''];
}
const out = { asof: new Date().toISOString().slice(0, 10), vendors, names };
fs.writeFileSync(path.join(ROOT, 'top500-map.json'), JSON.stringify(out));
const linked = new Set(Object.values(vendors).flatMap(m => Object.values(m)));
console.log('Top 500 items:', new Set(top.values()).size, '· linked:', linked.size);
for (const [v, m] of Object.entries(vendors)) console.log(' ', v, Object.keys(m).length);
