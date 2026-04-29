"""One-shot image optimizer.

Backs originals to images/_originals/, then for each JPG:
  - Resizes to fit within 1600x1000 (long edge), preserving aspect
  - Re-saves JPG at quality 82 (mozjpeg-style optimisation via Pillow)
  - Writes parallel .webp at quality 80
"""
from pathlib import Path
import shutil
from PIL import Image

ROOT = Path(__file__).parent / "images"
BACKUP = ROOT / "_originals"
MAX_W, MAX_H = 1600, 1000
JPG_QUALITY = 82
WEBP_QUALITY = 80

def main():
    BACKUP.mkdir(exist_ok=True)
    rows = []
    for jpg in sorted(ROOT.glob("*.jpg")):
        # Backup if not already
        backup_path = BACKUP / jpg.name
        if not backup_path.exists():
            shutil.copy2(jpg, backup_path)

        # Read from backup so we always start from original
        img = Image.open(backup_path)
        if img.mode != "RGB":
            img = img.convert("RGB")

        before_size = backup_path.stat().st_size
        before_dims = img.size

        # Resize if needed
        img.thumbnail((MAX_W, MAX_H), Image.LANCZOS)
        after_dims = img.size

        # Re-save JPG
        img.save(jpg, "JPEG", quality=JPG_QUALITY, optimize=True, progressive=True)
        jpg_after = jpg.stat().st_size

        # Generate WebP
        webp = jpg.with_suffix(".webp")
        img.save(webp, "WEBP", quality=WEBP_QUALITY, method=6)
        webp_after = webp.stat().st_size

        rows.append((jpg.name, before_dims, after_dims, before_size, jpg_after, webp_after))

    # Report
    print(f"{'file':32} {'orig dim':>11} {'new dim':>11} {'orig kb':>9} {'jpg kb':>8} {'webp kb':>9}")
    print("-" * 90)
    total_orig = total_jpg = total_webp = 0
    for name, bd, ad, bs, ja, wa in rows:
        print(f"{name:32} {f'{bd[0]}x{bd[1]}':>11} {f'{ad[0]}x{ad[1]}':>11} "
              f"{bs/1024:>9.1f} {ja/1024:>8.1f} {wa/1024:>9.1f}")
        total_orig += bs
        total_jpg += ja
        total_webp += wa
    print("-" * 90)
    print(f"{'TOTAL':32} {' ':23} {total_orig/1024:>9.1f} {total_jpg/1024:>8.1f} {total_webp/1024:>9.1f}")
    print(f"\nJPG savings: {(total_orig - total_jpg)/1024:.0f} KB ({(1 - total_jpg/total_orig)*100:.1f}%)")
    print(f"WebP savings vs original: {(total_orig - total_webp)/1024:.0f} KB ({(1 - total_webp/total_orig)*100:.1f}%)")

if __name__ == "__main__":
    main()
