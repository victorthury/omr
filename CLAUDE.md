# OMR — Project Conventions

## File Map

| HTML | CSS | JS |
|------|-----|----|
| `index.html` | `style.css` | `script.js` |
| `gabaritos.html` | `style.css` | `gabaritos.js`, `scanner.js` |

## Rule: No Inline CSS or JS

HTML files must contain **zero** `<style>` blocks and **zero** `<script>` blocks with code.

- All styles go in `style.css`
- All scripts go in their respective `.js` file
- No `style="…"` attributes on elements either — express via a CSS selector

## style.css Structure

Sections are separated by banner comments:

```css
/* ─── SECTION NAME ───────────────────────────────────────────── */
```

Current sections (in order):
1. `RESET`
2. `SCREEN: CONTROL PANEL` — `index.html` page layout
3. `PREVIEW WRAPPER` — sheet preview area
4. `OMR SHEET` — the printable answer sheet
5. `MOBILE` — responsive overrides for control panel
6. `ANSWER KEY EDITOR` — editor UI in `index.html`
7. `SCANNER MODAL` — modal chrome + result display (shared)
8. `GABARITOS PAGE` — `gabaritos.html` page layout and cards
9. `PRINT STYLES` — `@media print` rules (always last)

When adding styles for a new page or feature, insert a new section **before** `PRINT STYLES`.

## JS Files

- **`script.js`** — sheet generation, preview, answer key editor (all for `index.html`)
- **`gabaritos.js`** — list rendering, CRUD on `localStorage` key `omr_saved_keys`
- **`scanner.js`** — OpenCV.js camera pipeline; calls `load()` from `gabaritos.js`, so it must be loaded after

Load order in `gabaritos.html`:
```html
<script src="gabaritos.js"></script>
<script src="scanner.js"></script>
```
