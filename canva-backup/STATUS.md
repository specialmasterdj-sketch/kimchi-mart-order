# Canva Price-Tag Backup — Status Report

**Last refresh:** 2026-05-05 (autonomous run while owner was out)

## Snapshot

| Phase | Done | Remaining |
|-------|------|-----------|
| PNG download | **22 designs** (2,612 / 2,870 pages = 91%) | 27 designs (~258 pages) |
| Text extraction | **11 designs** (master.json) | 38 designs |
| `master.json` products | **2,240 unique** (after label filter) | grows when more text added |
| PDF export | 0 | (TBD whether needed) |

## What ran this session

1. **Verified 22 priority-1 PNGs** — every design's file count matches manifest page count exactly. No partial downloads.
2. **Refreshed `master.json`** — picked up 4 new text files since last run (7 → 11). Product count was 1,438; after improving the label filter (drops "PER LB", "ON SALE", etc.) it's now **2,240** real products.
3. **Found 2 corrupt 0-byte files** in `DAG1xayOS2I` (p032, p072) — Canva URL had expired (403), so couldn't redownload. Stubs deleted; the next run with fresh URLs will pick them up.
4. **Patched `download.js`** — was leaving 0-byte stubs on failure (HTTP errors / expired signed URLs). New version writes to `*.part`, validates ≥ 1KB, then renames. Failures now leave NO trace.
5. **Improved `parse-text.js` filter** — added stop-list of label words (`PER LB`, `EACH`, `ON SALE`, `KIMCHI MART`, store names, etc.) and a "single short English word" rule. Cuts ~14 false-positive products per text file.

## Backlog — needs Canva session (owner action required)

### Priority 1 — text only missing (4 designs, total 811 pages of products)
PNGs done, but text not yet extracted:
- `DAHGGMiUdFk` FREEZER PRICES CORAL SPRINGS (242p)
- `DAGY6Swyswo` VEGETABLE PRICES BIG SIGNS (220p)
- `DAG_YaXWVV4` Copy of VEGETABLE PRICES (117p)
- `DAGiMP-f9vM` OPEN FREEZER PRICES 2025 (232p)

### Priority 2 — both PNG + text missing (3 designs)
- `DAGtzVnuC60` TOP DOOR FREEZER PRICES copy (21p) — manifest notes "already exported as test", but PNGs aren't here
- `DAG8_53BwHI` LAS OLAS SALE FLYERS (5p)
- `DAHC0VfTSxo` QR CODES LIST (16p)

### Priority 2 — text only missing (8 designs)
- `DAHANsSm3Bg` (247p), `DAHAmbxepIk` (232p), `DAG3fCHwQ5k` (30p),
  `DAG2KbXtIgo` (104p), `DAG7P2ZHTyE` (199p), `DAG1zOu5JWQ` (109p),
  `DAG9MCTyUGg` (72p) door freezer

### Priority 3 — fully untouched (24 designs, ~218 pages)
See `manifest.json`. These are the older / smaller / one-off designs.
**Recommendation:** skip for now unless a specific lookup turns up missing data.

## Re-fix needed (when owner returns)

Two corrupt pages need fresh URLs — owner pulls a new export URL list for `DAG1xayOS2I`, then run:

```bash
node download.js DAG1xayOS2I
```

The new download.js will only fetch `p032` and `p072` (existing files > 1KB are skipped) and won't leave any stubs if a URL is bad.

## Re-extracting URL files

Canva's signed export URLs expire (~24-48h). The 22 URL files in `designs/*-urls.txt` were captured 2026-05-02 and are now all 403. **Don't run `download.js` against them now** — fortunately the script's "skip if file > 1KB" guard means the existing complete designs won't be touched.
