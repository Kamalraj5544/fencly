# Fencly — Static Website

Marketing site for Fencly, a Sydney-based WPC composite fencing supplier.

Plain HTML, CSS and vanilla JS. No framework, no build step.

---

## Stack

- Hand-written HTML5 (semantic, accessible)
- Custom CSS (no Tailwind, no Bootstrap)
- Vanilla JS (Intersection Observer, no dependencies)
- Google Fonts: **Instrument Serif** + **DM Sans**
- Total payload: ~60 KB HTML/CSS/JS (before images)

---

## Run locally

Open `index.html` directly in any modern browser — it works from the file system.

Or serve it with any static server:

```bash
# Python
python -m http.server 8000

# Node (if you have npx)
npx serve .

# PHP
php -S localhost:8000
```

Then visit **http://localhost:8000**.

---

## Deploy

Drop the `fencly-website/` folder into any static host:

| Host | How |
|---|---|
| **Netlify** | Drag and drop the folder onto app.netlify.com/drop |
| **Vercel** | `vercel deploy` from the folder, or drag into the dashboard |
| **Cloudflare Pages** | Connect repo or upload zip |
| **GitHub Pages** | Push to a repo, enable Pages on `main` → root |
| **S3 / any bucket** | Upload files, point CloudFront / bucket website at `index.html` |

No environment variables, no build command.

---

## File structure

```
fencly-website/
├── index.html           # Single-page site (all sections)
├── css/
│   └── styles.css       # All styles
├── js/
│   └── main.js          # All interactions + form submission
├── images/
│   └── README.md        # Where to drop real photography
├── apps-script/
│   ├── Code.gs          # Google Apps Script form handler
│   └── README.md        # 5-minute deployment guide
└── README.md            # This file
```

---

## What's included

- Hero, trust marquee, features grid
- Tabbed product showcase (Privacy Fence, Mid Trellis, Full Trellis in stock; others commented out)
  - Image carousel per product, keyboard navigation, hash deep-linking (`#p4`, `#p7`, `#p9`)
- Why-co-extrusion section with cross-section diagram
- Cost comparison table (Fencly vs timber vs Colorbond)
- Performance / test results
- Delivery timeline
- Trade pricing section
- Trade sample-set form (ABN required) and free measure-and-quote form
- Footer with product index, service areas, contact

---

## Adding real images

See `images/README.md` for filenames, aspect ratios, and the one-line CSS edit needed per image.

The site ships with styled CSS placeholders (gradients + slat patterns) so every section still renders in a brand-appropriate way before any photography is added.

---

## Accessibility

- Skip-to-content link
- Semantic landmarks (`header`, `nav`, `main`, `section`, `footer`)
- Focus-visible outlines on all interactive elements
- ARIA attributes on tabs, mobile toggle, form status
- `prefers-reduced-motion` respected — disables reveal animations
- Keyboard-navigable tabs (arrow keys)
- Colour contrast tested on dark/light sections

---

## Browser support

Evergreen Chrome, Safari, Firefox, Edge. iOS Safari 14+ and Android Chrome 90+.

---

## Customisation quick-reference

| What | Where |
|---|---|
| Brand colours | `:root` block in `css/styles.css` |
| Fonts | `<link>` in `index.html` + `--f-display` / `--f-sans` tokens |
| Contact email | `FENCLY_FALLBACK_EMAIL` constant at the top of `js/main.js` (also search for `hello@fencly.com.au` in `index.html`) |
| Product content | Each `<article class="panel" id="pN">` block in `index.html` |
| Form submission endpoint | Deploy the Google Apps Script in [`apps-script/`](apps-script/README.md), then paste the Web App URL into `FENCLY_FORM_ENDPOINT` at the top of `js/main.js`. Each submission lands in a Google Sheet, emails the company, and sends the requester a thank-you. Leave empty to use the `mailto:` fallback. |

---

## License

© Fencly Australia. All rights reserved.
# fencly
