// Extract plain text from a Canva PDF export → save to text/{ID}.txt
// Usage: node extract-pdf-text.js <design_id> [pdf_path]
//   - If pdf_path is omitted, looks in ~/Downloads for a Canva PDF
//     (filename pattern: <design title>.pdf, picks the newest)
const fs = require('fs');
const path = require('path');
const os = require('os');

// Resolve pdf-parse from the parent kimchi-mart-order/node_modules
let pdfParse;
try {
  pdfParse = require(path.join(__dirname, '..', 'node_modules', 'pdf-parse'));
} catch (e) {
  console.error('pdf-parse not found. Run from canva-backup or kimchi-mart-order:');
  console.error('  npm install pdf-parse');
  process.exit(1);
}

const designId = process.argv[2];
let pdfPath = process.argv[3];

if (!designId) {
  console.error('Usage: node extract-pdf-text.js <design_id> [pdf_path]');
  process.exit(1);
}

// Auto-detect: pick the newest PDF in ~/Downloads if no path given
if (!pdfPath) {
  const downloads = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(downloads)) {
    console.error('Downloads folder not found and no pdf_path given.');
    process.exit(1);
  }
  const candidates = fs.readdirSync(downloads)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => ({ name: f, full: path.join(downloads, f), mtime: fs.statSync(path.join(downloads, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    console.error('No PDFs in Downloads folder.');
    process.exit(1);
  }
  // Find the newest one (most likely the just-downloaded Canva export)
  pdfPath = candidates[0].full;
  console.log(`Auto-picked newest PDF: ${candidates[0].name}`);
}

if (!fs.existsSync(pdfPath)) {
  console.error(`PDF not found: ${pdfPath}`);
  process.exit(1);
}

const outPath = path.join(__dirname, 'text', `${designId}.txt`);
const buf = fs.readFileSync(pdfPath);

pdfParse(buf).then(data => {
  // pdf-parse returns text with form-feed-style page breaks; preserve as-is
  // because parse-text.js splits by \n+ and is happy with anything text-y.
  fs.writeFileSync(outPath, data.text);
  const lineCount = data.text.split('\n').length;
  console.log(`✓ Extracted ${data.numpages} pages, ${lineCount} lines → ${outPath}`);
  console.log(`  PDF size: ${(buf.length / 1024).toFixed(1)} KB`);
}).catch(err => {
  console.error('PDF parse failed:', err.message);
  process.exit(1);
});
