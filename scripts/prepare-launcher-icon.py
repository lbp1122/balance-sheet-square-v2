from pathlib import Path
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ANDROID = ROOT / "android-app" / "app" / "src" / "main" / "res" / "drawable-nodpi"
SOURCE = PUBLIC / "app-icon-source.png"

if not SOURCE.exists():
    raise RuntimeError("Missing approved My Wealth Square icon source")

image = Image.open(SOURCE).convert("RGBA")

# The approved simple square icon is already the final artwork.
# Do not crop, remove its blue background, or alter its proportions.
PUBLIC.mkdir(parents=True, exist_ok=True)
ANDROID.mkdir(parents=True, exist_ok=True)

image.resize((512, 512), Image.Resampling.LANCZOS).save(PUBLIC / "app-icon-512.png", optimize=True)
image.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "app-icon-192.png", optimize=True)
image.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png", optimize=True)
image.resize((512, 512), Image.Resampling.LANCZOS).save(ANDROID / "app_icon_full.png", optimize=True)

print("Prepared launcher and in-app icons from approved simple square artwork")
