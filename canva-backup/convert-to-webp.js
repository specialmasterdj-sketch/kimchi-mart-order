// Convert all design PNGs → WebP (quality 75, native resolution)
// Output beside each PNG: p001.webp, p002.webp, ...
// Skips already-converted files so it's resumable.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const os = require('os');

const ROOT = path.join(__dirname, 'designs');
const Q = 75;
const CONCURRENCY = Math.max(2, Math.min(8, os.cpus().length));

// Collect all PNG paths
const designs = fs.readdirSync(ROOT).filter(d => fs.statSync(path.join(ROOT, d)).isDirectory());
const tasks = [];
for (const d of designs) {
  const dir = path.join(ROOT, d);
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.png')) {
      const png = path.join(dir, f);
      const webp = png.replace(/\.png$/i, '.webp');
      tasks.push({ png, webp });
    }
  }
}
console.log(`${tasks.length} PNGs to consider, concurrency=${CONCURRENCY}, q=${Q}`);

// Skip already-done
const todo = tasks.filter(t => {
  if (!fs.existsSync(t.webp)) return true;
  // If webp older than png, redo
  const a = fs.statSync(t.png).mtimeMs;
  const b = fs.statSync(t.webp).mtimeMs;
  return b < a;
});
console.log(`${todo.length} need conversion (${tasks.length - todo.length} already done)`);

let done = 0, fail = 0, sumPng = 0, sumWebp = 0;
const startTs = Date.now();

async function worker() {
  while (todo.length) {
    const t = todo.shift();
    if (!t) break;
    try {
      await sharp(t.png).webp({ quality: Q, effort: 4 }).toFile(t.webp);
      sumPng  += fs.statSync(t.png).size;
      sumWebp += fs.statSync(t.webp).size;
      done++;
      if (done % 50 === 0) {
        const pct = Math.round(done / (done + todo.length) * 100);
        const elapsed = (Date.now() - startTs) / 1000;
        const rate = done / elapsed;
        const eta = todo.length / rate;
        console.log(`  ${done}/${done + todo.length} (${pct}%) · ${rate.toFixed(1)}/s · ETA ${eta.toFixed(0)}s · so far ${(sumWebp/1024/1024).toFixed(1)} MB (-${(100 - sumWebp/sumPng*100).toFixed(0)}%)`);
      }
    } catch (e) {
      fail++;
      console.error(`  fail ${t.png}: ${e.message}`);
    }
  }
}

(async () => {
  const workers = Array.from({ length: CONCURRENCY }, worker);
  await Promise.all(workers);
  console.log(`\n✓ Done. ${done} converted, ${fail} failed.`);
  if (sumPng > 0) {
    console.log(`  Total: ${(sumPng/1024/1024).toFixed(1)} MB → ${(sumWebp/1024/1024).toFixed(1)} MB (-${(100 - sumWebp/sumPng*100).toFixed(0)}%)`);
  }
  // Final folder size
  let total = 0;
  function walk(p) {
    for (const f of fs.readdirSync(p)) {
      const fp = path.join(p, f);
      const s = fs.statSync(fp);
      if (s.isDirectory()) walk(fp);
      else if (f.endsWith('.webp')) total += s.size;
    }
  }
  walk(ROOT);
  console.log(`  All WebP files in designs/: ${(total/1024/1024).toFixed(1)} MB`);
})();
