"""Download Google Fonts woff2 files locally and emit a self-hosted CSS.

Why: even with async-load (preload+onload), Lighthouse still flags Google Fonts
as render-blocking on mobile because the CSS request adds a chain link before
the woff2 fetch can start. Self-hosting cuts both the chain and the third-party
connection.
"""
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
FONT_DIR = ROOT / "fonts"
FONT_DIR.mkdir(exist_ok=True)

# Same URL the HTML uses (most generous weight set, matches index.html)
FONTS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400"
    "&family=Inter+Tight:wght@300;400;500;600;700"
    "&display=swap"
)

# Real Chrome UA so Google serves us woff2, not woff
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=30).read()

def main():
    print(f"Fetching CSS from Google Fonts...")
    css = fetch(FONTS_URL).decode("utf-8")

    # Find all woff2 URLs
    woff2_urls = re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", css)
    woff2_urls = list(dict.fromkeys(woff2_urls))  # de-dupe, preserve order
    print(f"Found {len(woff2_urls)} woff2 file(s)")

    # Download each unique URL; keep subsets distinct via the gstatic path slug.
    new_css_blocks = []
    blocks = re.split(r"(?=/\* )", css)  # split on '/* subset */' comments which precede each block
    file_index = 0
    url_to_local = {}
    for block in blocks:
        block = block.strip()
        if "@font-face" not in block:
            continue
        family_match = re.search(r"font-family:\s*'([^']+)'", block)
        style_match = re.search(r"font-style:\s*(\w+)", block)
        weight_match = re.search(r"font-weight:\s*([\d\s]+)", block)
        subset_match = re.search(r"^/\*\s*([\w-]+)\s*\*/", block)
        url_match = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", block)
        if not (family_match and url_match):
            continue
        url = url_match.group(1)
        if url in url_to_local:
            local_name = url_to_local[url]
        else:
            family = family_match.group(1).replace(" ", "-").lower()
            style = (style_match.group(1) if style_match else "normal").lower()
            weight = (weight_match.group(1) if weight_match else "400").strip().replace(" ", "-")
            subset = (subset_match.group(1) if subset_match else "default").lower()
            local_name = f"{family}-{style}-{weight}-{subset}.woff2"
            local_path = FONT_DIR / local_name
            data = fetch(url)
            local_path.write_bytes(data)
            print(f"  downloaded {local_name} ({len(data)/1024:.1f} KB)")
            url_to_local[url] = local_name
        rewritten = block.replace(url, f"../fonts/{local_name}")
        new_css_blocks.append(rewritten)
        file_index += 1

    out_css = "\n".join(new_css_blocks)
    out_path = ROOT / "css" / "fonts.css"
    out_path.write_text(out_css, encoding="utf-8")
    print(f"\nWrote {out_path} ({len(out_css)} bytes)")
    print(f"Wrote {file_index} @font-face blocks")
    print(f"Fonts saved to {FONT_DIR}")

if __name__ == "__main__":
    main()
