# Design prompts — icon & share banner for "Window Title nt"

Two independent prompts. Copy everything below each divider into Google Stitch (device: DESKTOP), one at a time.

**Both deliverables MUST be SVG** — valid, self-contained SVG code only, no PNG/JPG/raster output. We rasterize the PNGs ourselves.

Shared brand facts, so the two pieces match:

| Token         | Value                        | Used for                          |
| ------------- | ---------------------------- | --------------------------------- |
| Accent (cyan) | `#22D3EE`                    | The badge, the HUD pill, the "nt" |
| Base          | `#15151E`                    | Icon tile, banner background      |
| Panel         | `#262B34` (border `#333A45`) | Banner cards / window art         |
| Headline      | `#F5F7FA`                    | Wordmark, HUD text                |
| Muted         | `#9AA3B2`                    | Subtitle                          |
| Mono label    | `#C7CDD6`                    | Illustrative project names        |
| Text on cyan  | `#15151E`                    | Text inside a filled cyan pill    |

The cyan is not decorative — `#22D3EE` is the extension's actual default badge color, verified rendering as `rgb(34, 211, 238)` in a real VS Code window. Do not substitute another accent. Dark text on cyan is likewise real: the extension derives it by luminance so a light pill never renders white-on-white.

---

## Prompt 1 — Marketplace icon

**Required output format: `.svg` — output valid, self-contained SVG code only (no PNG/JPG/raster).** Author it on a **512×512 canvas** so it downscales cleanly; we render `images/icon.png` at 128×128 ourselves. The extension currently ships a crude placeholder icon — this replaces it.

---

Design a marketplace icon for a VS Code extension called **Window Title nt**.

### What the extension does

When you keep one VS Code window open per repository, you lose track of which window is which. This extension makes the project identity unmissable in three places: an always-visible **cyan badge in the status bar**, a **filled pill in the title bar** styled like VS Code's own Update button, and — the headline — a **large pill flashed over the middle of the window** whenever that window gains focus, the way macOS announces a keyboard connecting, then fades out. The core idea is **a window announcing its own name**.

### Concept direction

Lead with ONE strong idea — do not combine them:

1. **A minimal editor/window frame with a single bright cyan pill sitting in its center.** Literally the product: the window, plus the announcement floating over it. Strongest silhouette of the three.
2. **A rounded-square tile where a cyan nameplate/pill is lit by a soft spotlight beam**, suggesting "this one is being announced".
3. **Three stacked window outlines, only the frontmost carrying a cyan label pill** — identity among many windows. Highest risk of clutter; only pursue if it can be done in three shapes.

Favor a clean, geometric, instantly-readable mark over a literal illustration.

### Hard requirements

- **Format:** self-contained SVG, square, 512×512 viewBox. Provide it on a transparent background and also previewed on white.
- **Legibility target is 32 px and up.** This is a VS Code extension icon, not a browser favicon — it never renders at 16 px. It appears at ~128 px on the Marketplace detail page, ~42 px in the Extensions list, and ~32 px at the smallest. That extra headroom buys you **one** more element than a favicon would allow — it does not buy you detail.
- **Three shapes maximum**, excluding the background tile. If a fourth feels necessary, the concept is wrong.
- **No text and no wordmark.** Not even a single letter. The pill in the mark must read as an abstract shape, never as lettering.
- **No thin strokes.** Minimum stroke weight ~4% of the canvas (≈20 px at 512) so nothing disappears when downscaled.
- **Use the whole canvas. No margin.** The rounded-square tile must be **full-bleed** — its edges touch the 512×512 boundary on all four sides, exactly like the Codex, Edit CSV, ENV and ESLint icons in the Marketplace list. VS Code applies its own spacing around the icon; any padding you add is space wasted twice. Do not put the mark on a smaller inner card.
- **The content inside the tile must fill it too.** The focal subject spans **at least 70% of the tile's width**. A small glyph floating in a large tile is the single most common failure here.
- **Minimum contrast 3:1 against the tile for every visible shape.** Measured, not eyeballed: `#2B2B3A` on `#15151E` is only **1.30:1** and disappears entirely — do not use near-neighbours of the base. Cyan `#22D3EE` on `#15151E` is **10.04:1**; a usable neutral is `#6B6B85` at **3.51:1**. If a shape cannot reach 3:1, delete it rather than dim it.
- **Must survive both light and dark Marketplace backgrounds.** The full-bleed dark tile provides that, since the mark never touches the page background.

### Style

- Modern, flat, minimal — the visual family of VS Code's own product icons.
- Base: dark rounded-square "app tile", fill **#15151E**, **full-bleed**, corner radius ~22% of the canvas.
- Accent: cyan **#22D3EE** — the announcement pill, and the largest element in the mark. Exactly one cyan element, and it should be the first thing the eye lands on.
- Neutral secondary shape (a window frame or bars), **only if it earns its place**: `#6B6B85` or lighter, never a near-black like `#2B2B3A`. Recessed in _hierarchy_, not in visibility.
- Two colors plus the tile. No gradients, no drop shadows, no glows that break at small sizes, no skeuomorphism, no photorealism.

### Deliverables

1. The 512×512 SVG (transparent background, plus a white-background preview).
2. Downscaled previews at **128 px, 42 px and 32 px** to prove legibility at the sizes that actually occur.
3. One alternative concept if the primary feels weak at 32 px.

### How it'll be used

It becomes the `icon` field in `package.json` and appears in the VS Code Marketplace, the Extensions sidebar, and the extension detail page. We save the rasterized result as `images/icon.png`.

**Required output format: `.svg` (SVG code only).**

---

## Prompt 2 — Social share banner (Open Graph image)

**Required output format: `.svg` — output valid, self-contained SVG code only (no PNG/JPG/raster).** We rasterize the PNG ourselves.

---

A link-preview banner for the **VS Code extension "Window Title nt"** — shown when someone shares its Marketplace or GitHub link on WhatsApp or social media. **The deliverable MUST be a single self-contained `.svg`**, **1200×400 landscape** (3:1) — a deliberately super-wide letterbox, not a tall card.

**Fill the frame.** This is the most important instruction here, and the easiest to get wrong:

- The background must **bleed to all four edges**. No outer border, no rounded outer corners, no visible frame or card around the artwork. The canvas _is_ the artwork.
- **Vertical margins ≈ 8% of the height** (~32 px top and bottom) and no more. The content is vertically centered, and there must be no large empty band above or below it. If the composition leaves the middle third doing all the work while the top and bottom sit empty, the height is wrong — tighten it.
- Horizontal margins ≈ 4% (~48 px), even on both sides.

It must read instantly at thumbnail size, since WhatsApp renders link previews small and may crop toward the center: keep the logo, wordmark and subtitle within the **left 55%** (~660 px), and let the artwork occupy the right.

Theme: this is a developer tool, so lean into a **dark editor aesthetic** — it must feel at home next to VS Code — with high contrast for thumbnail legibility.

### Design system (must follow)

- Background: near-black charcoal base **#15151E**, with a **very subtle full-canvas diagonal tint** — cyan **#22D3EE at ~6% opacity** (top-right) fading to transparent (bottom-left). No hard dividers, no vertical panel edges.
- Accent: cyan **#22D3EE** — the badge, the HUD pill, the trailing "nt".
- Headline text: near-white **#F5F7FA**. Subtitle: muted slate **#9AA3B2**.
- Cards and window art: dark **#262B34** with a faint **#333A45** 1px border.
- Font: **Inter** — bold headline with tight letter-spacing. Monospace (**JetBrains Mono**) only for the small illustrative project labels.

### Logo (use the REAL icon, do NOT invent a new mark)

- Use the actual extension icon: a **full-bleed dark rounded-square tile (#15151E, corner radius ~22%)** whose dominant element is a single large **cyan #22D3EE** pill spanning ~75% of the tile width. Do not redesign this mark and do not add letters to it. **Do not put a near-black window frame inside it** — `#2B2B3A` on `#15151E` is 1.30:1 and vanishes at this size.
- Render it at ~76×76 px, sitting **directly above** the wordmark with a clear gap — logo bottom ≈ 18 px above the cap height of the "W". It must be large enough that the cyan pill is unmistakable in a thumbnail.

### Left alignment (strict)

- The **logo tile's left edge**, the **"W"** of the wordmark, and the **first letter of the subtitle** must share **one vertical guide** — a single common left margin. The logo must not poke left of the text, nor the text sit right of the logo.

### Wordmark & subtitle (left, stacked)

1. Wordmark **"Window Title nt"** — Inter, weight 800, ~56 px, letter-spacing −1.5. Render **"Window Title" in near-white #F5F7FA** and the trailing **"nt" in cyan #22D3EE**.
2. Subtitle directly below — Inter, weight 400, ~20 px, **#9AA3B2**, on **one single line**: **"Know which project each window is — announced the moment you focus it."**

Logo, wordmark and subtitle together form one tight block, vertically centered as a unit. Total block height should be roughly **240 px of the 400** — filling the frame, not floating in it.

### Right-side art — "the window announcing itself"

This is the whole pitch, so make it the one piece of art:

- A **stylized editor window** (rounded rect, rx ≈ 16, fill **#262B34**, faint **#333A45** border) that bleeds off the right edge **and off both the top and bottom** — on a letterbox canvas it must fill the full height, never sit as a small floating card with air above and below it. Inside it, suggest an editor with 3–4 short flat code bars in **#333A45** — abstract, never readable text.
- Centered over that window, the hero element: a **large cyan-outlined pill** (fill **#262B34**, 2px **#22D3EE** border, rx ≈ 20) containing **"PAYMENTS-API"** in Inter, weight 700, ~34 px, **#22D3EE**, letter-spacing +1. This is the HUD — give it a soft cyan halo at ~10% opacity so it clearly floats above the window.
- Along the window's **top** edge, a thin **title bar strip** (~28 px tall, fill **#1B1E26**) holding, at its right end, a **small solid cyan pill** (fill **#22D3EE**, rx ≈ 6, ~22 px tall) with **"payments-api"** in Inter ~14 px in **dark #15151E**. This is the title-bar pill — keep it small and secondary to the hero HUD, and do not outline it; it is filled, unlike the HUD.
- Along the window's **bottom** edge, a thin **status bar strip** (~26 px tall, fill **#1B1E26**) carrying a small cyan dot plus **"payments-api"** in JetBrains Mono ~18 px **#22D3EE** — the always-visible badge.
- Those three cyan marks — top pill, center HUD, bottom badge — should read as one vertical rhythm down the window. The HUD dominates; the other two are quiet confirmations.
- **Two further window outlines behind** the main one, offset up-right and down-right, drawn only as 1px **#333A45** outlines at ~35% opacity with **no** pill — conveying "many windows, this is the one you're in".
- The whole cluster **blends into the background diagonally** (soft opacity fade, top-right → center) — never a straight vertical edge.

### Rules

- Flat vector shapes only: no photos, no screenshots, no real VS Code window chrome, no traffic-light buttons, no raster effects that will not survive as SVG. Prefer gradient and opacity masks for the diagonal blend.
- No feature chips, badges, bullet lists, or extra copy of any kind — just logo, wordmark, subtitle and the window art.
- The only literal text in the art is the illustrative project name, repeated as `PAYMENTS-API` (HUD) and `payments-api` (title-bar pill and status badge). Everything else is abstract bars.
- **No outer border, frame, card or rounded outer corners**, and no drop shadow around the whole canvas. The background bleeds edge to edge.
- **Every visible shape needs ≥3:1 contrast against the background it sits on.** `#2B2B3A` on `#15151E` is 1.30:1 and disappears; `#22D3EE` on `#15151E` is 10.04:1. Panels may be subtle, but nothing meaningful may be invisible.
- The wordmark and subtitle must stay legible when the image is displayed at 300 px wide.

**Required output format: `.svg` (SVG code only).**

---

## Rasterizing the results

ImageMagick's SVG renderer silently drops arcs and some paths, so do **not** use `magick` to convert these. Use QuickLook or headless Chrome, then downscale:

```bash
# QuickLook
qlmanage -t -s 512 -o . icon.svg

# or headless Chrome via the chrome-devtools MCP: open the file:// URL,
# resize the page to the artboard, screenshot, then:
magick icon-512.png -resize 128x128 images/icon.png
```

Check the result at 32 px before accepting it — that is the size that decides whether the icon works.
