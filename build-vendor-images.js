// 벤더 *_products.js 파일들에서 barcode/PLU → image 매핑 추출
// 결과: vendor_images.json — 가격표 생성기에서 fetch 해서 사용
const fs = require('fs');
const vm = require('vm');

const FILES = [
  'hanmi_products.js',
  'cj_products.js',
  'jayone_products.js',
  'pulmuone_products.js',
  'rheebros_products.js',
  'products.js',  // VENDORS = { rhee_full, seoul_trading, ... } 24+ 벤더 통합
];

const index = {};   // key → { image, vendor, name }
let total = 0;

for (const f of FILES){
  if (!fs.existsSync(f)){ console.log('스킵 (없음):', f); continue; }
  let code = fs.readFileSync(f, 'utf8');
  // 최상위 const/let 을 var 로 (vm context 에서 노출되도록)
  code = code.replace(/^(const|let)\s+([A-Z_][A-Z0-9_]*)\s*=/gm, 'var $2 =');
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  try { vm.runInContext(code, ctx); }
  catch(e){ console.log('파싱 실패:', f, e.message); continue; }

  // 가능한 위치 모두 탐색 — Array (직접 상품 목록) OR Object (VENDORS={vendor:{products:[...]}})
  const allProds = [];  // [{product, vendorHint}]
  const candidates = [...Object.keys(ctx.window), ...Object.keys(ctx)];
  for (const k of candidates){
    const v = ctx.window[k] || ctx[k];
    if (Array.isArray(v) && v[0] && (v[0].image || v[0].barcode || v[0].plu)){
      v.forEach(p => allProds.push({ p, vh: '' }));
    } else if (v && typeof v === 'object' && !Array.isArray(v)){
      // VENDORS 같은 구조: { vendor_id: { products: [...], ... } }
      for (const vKey of Object.keys(v)){
        const vObj = v[vKey];
        if (vObj && Array.isArray(vObj.products)){
          vObj.products.forEach(p => allProds.push({ p, vh: vKey }));
        }
      }
    }
  }
  if (!allProds.length){ console.log('상품 배열 못 찾음:', f); continue; }

  const vendor = f.replace('_products.js','');
  let added = 0;
  for (const item of allProds){
    const p = item.p;
    const vh = item.vh;
    const img = p.image || '';
    if (!img || typeof img !== 'string') continue;
    const name = p.name || p.en || p.nameKr || p.ko || '';
    const entry = { image: img, vendor: vh || vendor, name };
    const keys = [
      String(p.barcode || '').trim(),
      String(p.plu || '').trim(),
      String(p.id || '').trim(),
      String(p.upc || '').trim(),
      String(p.code || '').trim()
    ].filter(Boolean);
    for (const k of keys){
      if (!index[k]) index[k] = entry;
      // 바코드 마지막 1자리(체크 디지트) 제거 버전도 인덱싱
      if (/^\d{12,14}$/.test(k)) {
        const trim1 = k.slice(0, -1);
        if (!index[trim1]) index[trim1] = entry;
      }
      // 0 prefix 제거 (UPC-A vs EAN-13)
      if (/^0\d+$/.test(k)) {
        const noZero = k.replace(/^0+/, '');
        if (noZero && !index[noZero]) index[noZero] = entry;
      }
    }
    if (keys.length) added++;
  }
  total += added;
  console.log(`${f}: ${added}개 매핑 추가`);
}

fs.writeFileSync('vendor_images.json', JSON.stringify(index));
const sizeKB = (fs.statSync('vendor_images.json').size / 1024).toFixed(1);
console.log(`\n완료: 총 ${Object.keys(index).length}개 키, ${total}개 상품, ${sizeKB} KB`);
console.log('샘플 5개:');
Object.entries(index).slice(0, 5).forEach(([k, v]) => console.log(` ${k} → ${v.image} (${v.vendor})`));
