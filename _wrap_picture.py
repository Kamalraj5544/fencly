"""Wrap each <img src="images/*.jpg"> in a <picture> element with a WebP source.

Idempotent: skips imgs already inside a <picture>.
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent
HTML_FILES = ["index.html", "warranty.html", "trade-portal.html"]

# Match a multi-line <img ... src="images/X.jpg" ... />
# Group 1: leading whitespace; group 2: full img tag; group 3: filename
IMG_RE = re.compile(
    r'(?P<lead>[ \t]*)(?P<img><img\b[^>]*?src="images/(?P<file>[^"]+\.jpg)"[^>]*?/?>)',
    re.DOTALL,
)

def already_wrapped(src: str, idx: int) -> bool:
    """Check if <img> at idx is already preceded by <picture> ... <source ...>."""
    window = src[max(0, idx - 200):idx]
    return "<picture" in window and "</picture>" not in window

def wrap(src: str) -> tuple[str, int]:
    out = []
    last = 0
    count = 0
    for m in IMG_RE.finditer(src):
        if already_wrapped(src, m.start()):
            continue
        out.append(src[last:m.start()])
        lead = m.group("lead")
        img_tag = m.group("img")
        webp = m.group("file").replace(".jpg", ".webp")
        wrapper = (
            f'{lead}<picture>\n'
            f'{lead}  <source srcset="images/{webp}" type="image/webp" />\n'
            f'{lead}  {img_tag}\n'
            f'{lead}</picture>'
        )
        out.append(wrapper)
        last = m.end()
        count += 1
    out.append(src[last:])
    return "".join(out), count

for filename in HTML_FILES:
    path = ROOT / filename
    if not path.exists():
        print(f"skip: {filename} not found")
        continue
    src = path.read_text(encoding="utf-8")
    new_src, n = wrap(src)
    if n:
        path.write_text(new_src, encoding="utf-8")
    print(f"{filename}: wrapped {n} <img> tag(s)")
