# Fencly · Image Assets

Real product photography lives here. All images are fence installations (no gates) sourced from MecoFence with supplier permission.

## Current files

| Slot | File | Source note |
|---|---|---|
| Hero background | `hero.jpg` | Dark grey WPC privacy fence, suburban backyard (gallery 6-8.jpg) |
| Product 01 · Dual Tone (hero card) | `p1-dual-tone.jpg` | Mecofence gallery image 9-2.jpg — used only by `.hero__card-img` |
| Product 01 · Dual Tone (products section) | `p1-dual-tone-product.jpg` | Close-up brown WPC panel with horizontal lines (gallery 4-4.jpg) |
| Product 02 · Single Tone | `p2-single-tone.jpg` | Solid brown WPC privacy fence with metal posts (gallery 微信图片_20200803101106.jpg) |
| Product 04 · Privacy | `p4-privacy.jpg` | Dark grey louvered WPC privacy fence with climbing plants (gallery Combines-woods-load-bearing…jpg) |
| Product 05 · Carving | `p5-carving.jpg` | Brown WPC fence with decorative laser-cut metal panels |
| Product 06 · Super Kit | `p6-super-kit.jpg` | Pure white composite fence with white WPC post |
| Product 07 · Trellis | `p7-trellis.jpg` | 6ft full trellis dark grey composite fence |
| Product 08 · Woven | `p8-woven.jpg` | Light brown woven WPC boundary fence |
| Product 09 · Full Trellis | `p9-full-trellis.jpg` | Charcoal open-board WPC fence with aluminium posts along a boundary |
| Product 06 · Planter Box | `p12-planter-installed.jpg` | Teak WPC privacy screen + integrated planter boxes on a deck |
| Product 07 · WPC Cladding | `p13-cladding-charcoal.jpg` | Charcoal fluted WPC boards as a rooftop feature wall |

### Fence with Planter Box gallery (2 slides)

| Slide | File | What it shows |
|---|---|---|
| 1 · Installed | `p12-planter-installed.jpg` | Teak privacy panels with full-width planter boxes along a deck |
| 2 · Detail | `p12-planter-detail.jpg` | Close-up of the planter box, aluminium frame and 160mm boards |

### WPC Cladding gallery (4 slides)

| Slide | File | What it shows |
|---|---|---|
| 1 · Feature wall | `p13-cladding-charcoal.jpg` | Charcoal fluted cladding feature wall (rooftop terrace) |
| 2 · Wall | `p13-cladding-black.jpg` | Black fluted wall cladding beside a pool |
| 3 · Poolside | `p13-cladding-teak.jpg` | Teak fluted cladding wrapping a pool surround |
| 4 · Boundary | `p13-cladding-boundary.jpg` | Charcoal fluted cladding on a low boundary wall |

## Privacy Fence gallery (5 swipeable slides)

The Privacy Fence product panel now displays a swipeable gallery wired to
these files:

| Slide | File | What it shows |
|---|---|---|
| 1 · Installed | `p4-privacy-installed.jpg` | Charcoal horizontal-slat fence in a residential backyard |
| 2 · Texture | `p4-privacy-texture.jpg` | Close-up of co-extruded WPC wood-grain surface (charcoal) |
| 3 · Colour · Teak | `p4-privacy-teak.jpg` | Teak colourway with black aluminium posts |
| 4 · Colour · Charcoal | `p4-privacy-charcoal.jpg` | Full-coverage charcoal solid privacy panels |
| 5 · Configuration | `p4-privacy-mixed.jpg` | Slat-top + solid-bottom configuration in teak |

`p4-privacy.jpg` is kept as the SEO/Open Graph hero image and is a copy of
slide 1 (`p4-privacy-installed.jpg`).

To swap any slide, just overwrite the file in this folder — no markup change
needed.


## Where they're wired

- Hero: `.hero__bg-image` in `css/styles.css`
- Floating hero card: `.hero__card-img`
- Product tab thumbnails: `.pcard__visual--pX`
- Expanded product panels: `.panel__img--pX`

## Optimisation

- Export JPGs at quality 75–82 or serve WebP / AVIF.
- Target **under 300 KB per image** (a few currently exceed — run through [Squoosh](https://squoosh.app/) if needed).
