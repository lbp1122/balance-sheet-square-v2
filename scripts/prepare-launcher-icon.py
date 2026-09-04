from pathlib import Path
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ANDROID = ROOT / "android-app" / "app" / "src" / "main" / "res" / "drawable-nodpi"
SOURCE = PUBLIC / "app-icon-master.png"

if not SOURCE.exists():
    raise RuntimeError("Missing canonical My Wealth Square icon: public/app-icon-master.png")

image = Image.open(SOURCE).convert("RGBA")
bbox = image.getbbox()
if not bbox:
    raise RuntimeError("Canonical My Wealth Square icon is empty")

# The canonical artwork is already tightly cropped and transparent at the rounded corners.
# Do not auto-remove backgrounds or recrop it; that caused the earlier black/wrong icons.
image = image.resize((512, 512), Image.Resampling.LANCZOS)

PUBLIC.mkdir(parents=True, exist_ok=True)
ANDROID.mkdir(parents=True, exist_ok=True)

image.save(PUBLIC / "app-icon-512.png", optimize=True)
image.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "app-icon-192.png", optimize=True)
image.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png", optimize=True)
image.save(ANDROID / "app_icon_full.png", optimize=True)

print("Prepared My Wealth Square icons from canonical app-icon-master.png")
