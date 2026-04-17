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
| Product 09 · Gates | _placeholder_ | Gate imagery pending — CSS placeholder in use |

## Where they're wired

- Hero: `.hero__bg-image` in `css/styles.css`
- Floating hero card: `.hero__card-img`
- Product tab thumbnails: `.pcard__visual--pX`
- Expanded product panels: `.panel__img--pX`

## Optimisation

- Export JPGs at quality 75–82 or serve WebP / AVIF.
- Target **under 300 KB per image** (a few currently exceed — run through [Squoosh](https://squoosh.app/) if needed).
