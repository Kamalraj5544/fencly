"""Generate a tiny base64 WebP of the hero — small enough to inline in critical CSS.
The browser paints the blurred placeholder on first parse, then swaps to the
preloaded full-resolution WebP once the deferred stylesheet applies.
"""
from base64 import b64encode
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).parent
SRC = ROOT / "_originals_backup" / "hero.jpg"
TARGET_W = 32  # 32px wide is plenty when the browser scales it to viewport width

def main():
    img = Image.open(SRC).convert("RGB")
    # Preserve aspect ratio, scale to TARGET_W wide
    ratio = TARGET_W / img.width
    target_h = int(img.height * ratio)
    img = img.resize((TARGET_W, target_h), Image.LANCZOS)
    # Soften slightly so the upscale looks intentional rather than pixelated
    img = img.filter(ImageFilter.GaussianBlur(radius=0.5))
    buf = BytesIO()
    img.save(buf, "WEBP", quality=55, method=6)
    data = buf.getvalue()
    b64 = b64encode(data).decode("ascii")
    data_uri = f"data:image/webp;base64,{b64}"
    print(f"LQIP: {TARGET_W}x{target_h}, {len(data)} bytes raw, {len(b64)} bytes base64")
    print(f"\n--- DATA URI (paste into critical CSS) ---\n{data_uri}\n")
    out = ROOT / "_lqip_hero.txt"
    out.write_text(data_uri, encoding="utf-8")
    print(f"Saved to {out}")

if __name__ == "__main__":
    main()
