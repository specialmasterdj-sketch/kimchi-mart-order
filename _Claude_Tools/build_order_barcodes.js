// build_order_barcodes.js — 오더센터 상품 id → 바코드(숫자) 표. 유통기한 이력 경고에 쓴다.
// 2026-10-28 사장님: "유통기한이 지나 버린 제품은 오더센터에서 오더할 때 반드시 경고 문구가 있어야 한다.
//   벤더 하나씩 들어가서 같은 제품이면 그 지점 관리자에게 오더 시 경고. 아주 정확하고 천천히 대조."
//   유통기한 기록(expiry/<지점>/products)은 바코드로 남는다 → 오더센터 상품도 바코드로 찾는다.
//   맞추는 방법은 Top 500 연결(build_top500_map.js)과 같다 — 이름으로는 맞추지 않는다.
//     ① 카탈로그에 바코드가 있는 상품: 그 바코드
//     ② 바코드가 없는 벤더: POS 상품 마스터(바코드·벤더·벤더품번)를 다리로, 벤더품번이 정확히 같은 상품
//   런타임(recommend.js)은 체크디지트 한 자리 차이만 허용해 맞춘다.
//
//   node _Claude_Tools/build_order_barcodes.js <pos 폴더 (pos_<지점>.json: [바코드,벤더,품번,이름] 배열)>
//   → order-barcodes.json  { asof, vendors: { <vendor>: { <productId>: "<바코드 숫자, 앞 0 뗌>" } } }
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const digits = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');

function load(files){
  const ctx = { window: {}, console };
  ctx.globalThis = ctx; ctx.self = ctx.window;
  vm.createContext(ctx);
  for (const f of files) {
    let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    src = src.replace(/^\s*(const|let)\s+([A-Z_][A-Z0-9_]*)\s*=/gm, 'var $2 =');
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx;
}
const isProduct = o => o.id != null && (o.name || o.nameKr || o.en) && (o.size || o.packSize || o.unit || o.um || o.price != null || o.upc || o.barcode);
function walkAll(o, out, seen = new Set()){
  if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
  if (Array.isArray(o)) { o.forEach(x => walkAll(x, out, seen)); return; }
  if (isProduct(o)) out.push(o);
  for (const v of Object.values(o)) if (v && typeof v === 'object') walkAll(v, out, seen);
}
// 벤더별 상품 목록 — 각 오더 페이지가 kmRecs 에 넘기는 p.id 기준 (build_top500_map.js 와 같은 출처)
const lists = {};
{ const c = load(['products.js']); for (const [v, def] of Object.entries(c.VENDORS || {})) { lists[v] = []; walkAll(def, lists[v]); } }
{ const c = load(['hanmi_products.js', 'cj_products.js']); lists.wang = []; walkAll(c.window, lists.wang); walkAll(c.CJ_PRODUCTS, lists.wang); }
{ const c = load(['rheebros_products.js']); lists.rhee_full = []; walkAll(c.window, lists.rhee_full); }
{ const html = fs.readFileSync(path.join(ROOT, 'wismettac.html'), 'utf8');
  const line = html.split(/\r?\n/).find(l => l.startsWith('const PRODUCTS = ['));
  if (line) lists.wismettac = JSON.parse(line.slice('const PRODUCTS = '.length).replace(/;\s*$/, '')); }

const vendors = {};
// 2026-10-28 사진 대조로 확인한 틀린 연결 — 이 상품들은 바코드가 다른 제품 것이다 (카탈로그·POS 오류). 연결하지 않는다.
//   (유통기한 856쌍 중 이름이 다른 92쌍 + 맛 충돌 15쌍을 사진으로 하나씩 봄 → 12쌍 제외, 844쌍 확인)
const WRONG_ID = new Set(['rhee_full:19972K','walong:3604314','two_bros_food:JTA004','two_bros_food:FJT-103','wang:1020763',
  'haitai:HT236551','wang:01015','walong:3604494','wang:08201','well_luck:91182']);
const put = (v, id, bc) => {
  if (WRONG_ID.has(v + ':' + id)) return false;
  const d = digits(bc); if (d.length < 8) return false;
  const m = vendors[v] = vendors[v] || {};
  if (m[String(id)]) return false;
  m[String(id)] = d; return true;
};
// 바코드는 맞는데 이름이 전혀 다른 것 — 카탈로그·POS 쪽 오류 (2026-10-25 Top 500 검수에서 확인)
const EXCLUDE = new Set(['wang:087703064522', 'well_luck:072810293606']);
const EXCLUDE_POS = new Set(['two_bros_food:HKT907', 'two_bros_food:KMN301', 'eastern_wine:3904']);

// ① 카탈로그 바코드
let n1 = 0;
for (const [v, l] of Object.entries(lists)) for (const p of l) {
  const bc = p.upc || p.barcode || p.barcodeDisplay;
  if (!bc || EXCLUDE.has(v + ':' + String(bc).replace(/\D/g, ''))) continue;
  if (put(v, p.id, bc)) n1++;
}
// ② POS 다리 (POS 벤더 ↔ 오더센터 벤더 짝은 사람이 정한 표만)
const POS2ORD = { 'JFC':'jfc', 'ASSI':'rhee_full', 'WISMETTAC':'wismettac', 'SEOULTRADING':'seoul_trading', 'EASTLAND':'eastland',
  'WANG HANMI':'wang', 'HANMI':'wang', 'CJ':'wang', 'LINK TRADING':'link', 'EASTERN WINE':'eastern_wine', 'WALONG':'walong', 'OCM':'ocm',
  'TWO BROS':'two_bros_food', 'WELL LUCK':'well_luck', 'FAF':'faf', 'HAITAI':'haitai', 'POCAS':'pocas', 'AAF IMPORT':'aaf', 'FRESHPOINT':'freshpoint' };
const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
let n2 = 0;
const POSDIR = process.argv[2];
if (POSDIR && fs.existsSync(POSDIR)) {
  const byCode = {};
  for (const [v, l] of Object.entries(lists)) { byCode[v] = new Map(); for (const p of l) { const k = normCode(p.id); if (k.length >= 3 && !byCode[v].has(k)) byCode[v].set(k, p); } }
  for (const f of fs.readdirSync(POSDIR)) {
    if (!/^pos_.*\.json$/.test(f)) continue;
    for (const [bc, pv, vcode] of JSON.parse(fs.readFileSync(path.join(POSDIR, f), 'utf8'))) {
      const ov = POS2ORD[String(pv || '').trim().toUpperCase()];
      if (!ov || !byCode[ov]) continue;
      const k = normCode(vcode); if (k.length < 3) continue;
      const p = byCode[ov].get(k); if (!p || EXCLUDE_POS.has(ov + ':' + p.id)) continue;
      if (put(ov, p.id, bc)) n2++;
    }
  }
}
fs.writeFileSync(path.join(ROOT, 'order-barcodes.json'), JSON.stringify({ asof: new Date().toISOString().slice(0, 10), vendors }));
console.log('catalog barcodes', n1, '· via POS', n2);
for (const [v, m] of Object.entries(vendors)) console.log(' ', v, Object.keys(m).length, '/', (lists[v] || []).length);
