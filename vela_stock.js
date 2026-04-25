/* Vela stock lookup for vendor-order pages.
 *
 * Reads the snapshot pos-cost-filter pushes to Firebase and lookup.html
 * caches in localStorage as 'kimchi-products-override-<branchId>'.
 * Builds case-insensitive byCode / byItem / byVendorCode indexes once
 * per branch change so vendor pages can decorate cards with the live
 * POS stock number.
 *
 * Same-origin caveat: every page that uses this must live under
 * specialmasterdj-sketch.github.io so they share the localStorage with
 * lookup.html. PWAs scoped under /kimchi-mart-order/ already qualify.
 *
 * Public API:
 *   VelaStock.load(branchId)        — lazy load + cache
 *   VelaStock.get(product)          — match by barcode → ITEM NUMBER → VENDOR CODE
 *                                      → product.id (fallback). Returns
 *                                      { stock, vela } or null.
 *   VelaStock.badgeHtml(product)    — inline HTML snippet ready to drop
 *                                      into a card.
 *   VelaStock.refresh()             — drop cache (call after a fresh push)
 */
(function (g) {
  'use strict';
  const KEY = (b) => 'kimchi-products-override-' + b;
  const BRANCH_KEY = 'km_branch';
  let cached = { branch: null, byCode: null, byItem: null, byVc: null, count: 0 };

  function currentBranch() {
    try { return localStorage.getItem(BRANCH_KEY) || ''; } catch (e) { return ''; }
  }

  function norm(s) {
    return String(s == null ? '' : s).trim().toUpperCase();
  }

  function loadFromLs(branch) {
    try {
      const raw = localStorage.getItem(KEY(branch));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      const rows = obj && Array.isArray(obj.rows) ? obj.rows : null;
      if (!rows || !rows.length) return null;
      const byCode = Object.create(null);
      const byItem = Object.create(null);
      const byVc = Object.create(null);
      for (const r of rows) {
        const code = norm(r.CODE || r.FULL_BARCODE);
        const item = norm(r.ITEM_NUMBER);
        const vc = norm(r.VENDOR_CODE);
        if (code && !(code in byCode)) byCode[code] = r;
        if (item && !(item in byItem)) byItem[item] = r;
        if (vc && !(vc in byVc)) byVc[vc] = r;
      }
      return { byCode, byItem, byVc, count: rows.length };
    } catch (e) { return null; }
  }

  function ensure(branchOverride) {
    const branch = branchOverride || currentBranch();
    if (cached.branch === branch && cached.byCode) return cached;
    const idx = branch ? loadFromLs(branch) : null;
    cached = idx ? { branch, ...idx } : { branch, byCode: null, byItem: null, byVc: null, count: 0 };
    return cached;
  }

  function get(product, branchOverride) {
    if (!product) return null;
    const idx = ensure(branchOverride);
    if (!idx.byCode) return null;
    const tryKey = (val, map) => (val && map[norm(val)]) || null;
    let row =
      tryKey(product.barcode, idx.byCode) ||
      tryKey(product.id, idx.byItem) ||
      tryKey(product.id, idx.byVc) ||
      // Fallback: some vendors store the UPC in the id field directly.
      tryKey(product.id, idx.byCode);
    if (!row) return null;
    const stock = Number(row.STOCK) || 0;
    return { stock, vela: row };
  }

  function badgeHtml(product, branchOverride) {
    const hit = get(product, branchOverride);
    if (!hit) return '';
    const n = hit.stock;
    const css = n > 0
      ? 'background:#e8f5e9;color:#1b5e20;border:1px solid #66bb6a'
      : (n === 0
        ? 'background:#fff3e0;color:#e65100;border:1px solid #ffb74d'
        : 'background:#ffebee;color:#b71c1c;border:1px solid #ef5350');
    return '<span class="vela-stock-badge" title="POS 재고 (Vela)" style="display:inline-block;padding:2px 7px;border-radius:9px;font-size:10.5px;font-weight:700;line-height:1.4;' + css + '">📦 ' + n + '</span>';
  }

  g.VelaStock = {
    load: ensure,
    get: get,
    badgeHtml: badgeHtml,
    refresh: function () { cached = { branch: null, byCode: null, byItem: null, byVc: null, count: 0 }; },
    _stats: function () { const i = ensure(); return { branch: i.branch, count: i.count }; },
  };
})(window);
