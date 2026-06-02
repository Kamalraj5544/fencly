"""One-shot importer for the two new product lines (Planter Box + WPC Cladding).

Reads the WhatsApp source photos, resizes to fit within 1600x1000 (long edge),
re-saves JPG at q82 + WebP at q80, matching _optimize_images.py conventions.
Prints final dimensions so the <img width/height> attributes can be set.
"""
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\HP\Downloads\photos-fence")
DEST = Path(__file__).parent / "images"
MAX_W, MAX_H = 1600, 1000
JPG_QUALITY = 82
WEBP_QUALITY = 80

# source filename -> destination stem (no extension)
MAP = {
    # Fence with Planter Box
    "WhatsApp Image 2026-05-31 at 7.08.18 PM.jpeg":     "p12-planter-installed",
    "WhatsApp Image 2026-05-31 at 7.08.17 PM.jpeg":     "p12-planter-detail",
    # WPC Cladding
    "WhatsApp Image 2026-06-02 at 6.03.46 AM.jpeg":     "p13-cladding-charcoal",
    "WhatsApp Image 2026-05-31 at 7.08.18 PM (2).jpeg": "p13-cladding-black",
    "WhatsApp Image 2026-05-31 at 7.08.19 PM (2).jpeg": "p13-cladding-teak",
    "WhatsApp Image 2026-05-31 at 7.08.19 PM.jpeg":     "p13-cladding-boundary",
}


def main():
    print(f"{'dest':28} {'orig dim':>11} {'new dim':>11} {'jpg kb':>8} {'webp kb':>9}")
    print("-" * 72)
    for src_name, stem in MAP.items():
        src = SRC / src_name
        img = Image.open(src)
        if img.mode != "RGB":
            img = img.convert("RGB")
        before = img.size
        img.thumbnail((MAX_W, MAX_H), Image.LANCZOS)
        after = img.size

        jpg = DEST / f"{stem}.jpg"
        img.save(jpg, "JPEG", quality=JPG_QUALITY, optimize=True, progressive=True)
        webp = DEST / f"{stem}.webp"
        img.save(webp, "WEBP", quality=WEBP_QUALITY, method=6)

        print(f"{stem:28} {f'{before[0]}x{before[1]}':>11} {f'{after[0]}x{after[1]}':>11} "
              f"{jpg.stat().st_size/1024:>8.1f} {webp.stat().st_size/1024:>9.1f}")


if __name__ == "__main__":
    main()
