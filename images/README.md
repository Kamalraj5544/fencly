# Fencly · Image Assets

Drop real product photography here. Until then the site ships with styled CSS placeholders so every section still looks premium out of the box.

## Recommended filenames

| Slot | Filename | Aspect | Notes |
|---|---|---|---|
| Hero background | `hero.jpg` | 16:9, 2400px wide | Dark, atmospheric install shot. Dual-tone vertical slat preferred. |
| Product 01 · Dual Tone | `p1-dual-tone.jpg` | 4:5 | Backyard or pool-side install |
| Product 02 · Single Tone | `p2-single-tone.jpg` | 4:5 | Fluted slat close-up |
| Product 03 · FlowShield ASA | `p3-flowshield.jpg` | 4:5 | Horizontal slats with airflow gap |
| Product 04 · Privacy | `p4-privacy.jpg` | 4:5 | Solid fence line |
| Product 05 · Carving | `p5-carving.jpg` | 4:5 | One of the laser-cut patterns |
| Product 06 · Super Kit | `p6-super-kit.jpg` | 4:5 | White WPC post kit |
| Product 07 · Trellis | `p7-trellis.jpg` | 4:5 | Mid-trellis garden |
| Product 08 · Woven | `p8-woven.jpg` | 4:5 | Basket-weave texture |
| Product 09 · Gates | `p9-gates.jpg` | 4:5 | Best single swing shot |
| Gate · Single | `gate-single.jpg` | 3:4 | |
| Gate · Double | `gate-double.jpg` | 3:4 | |
| Gate · Slide | `gate-slide.jpg` | 3:4 | |

## To use real images

1. Add your file to this folder.
2. Open `../css/styles.css` and find the `.hero__bg-image` or `.panel__img--pX` rule.
3. Replace the `background: ...` value with:

   ```css
   background: url('../images/hero.jpg') center/cover no-repeat;
   ```

4. Save — no rebuild required.

## Optimisation

- Export JPGs at quality 75–82 or serve WebP / AVIF.
- Target **under 300 KB per image**.
- Use [Squoosh](https://squoosh.app/) for quick in-browser compression.
