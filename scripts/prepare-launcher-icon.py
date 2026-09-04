from pathlib import Path
from PIL import Image, ImageDraw, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ANDROID = ROOT / "android-app" / "app" / "src" / "main" / "res" / "drawable-nodpi"
CANDIDATES = [
    # The JPG is the user-approved My Wealth Square artwork.
    # Use it as the single visual source, then crop away its presentation background.
    PUBLIC / "app-icon-512.jpg",
    PUBLIC / "app-icon-192.jpg",
    PUBLIC / "app-icon-512.png",
    ANDROID / "app_icon_v2.jpg",
    PUBLIC / "app-icon-1024.png",
]

image = None
SOURCE = None
for candidate in CANDIDATES:
    try:
        test = Image.open(candidate)
        test.load()
        image = test.convert("RGBA")
        SOURCE = candidate
        break
    except Exception:
        continue

if image is None or SOURCE is None:
    raise RuntimeError("Could not open any My Wealth Square source icon")

# Remove only the neutral background connected to the outer edges.
# Internal white chart symbols are enclosed by coloured panels, so they remain untouched.
for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)):
    ImageDraw.floodfill(image, point, (0, 0, 0, 0), thresh=42)

bbox = image.getbbox()
if not bbox:
    raise RuntimeError("Could not detect icon artwork")
image = image.crop(bbox)

# Make a square transparent canvas with only a very small safety margin.
side = max(image.size)
pad = 0
canvas = Image.new("RGBA", (side + pad * 2, side + pad * 2), (0, 0, 0, 0))
canvas.alpha_composite(
    image,
    ((canvas.width - image.width) // 2, (canvas.height - image.height) // 2),
)

PUBLIC.mkdir(parents=True, exist_ok=True)
ANDROID.mkdir(parents=True, exist_ok=True)

for size in (192, 512):
    output = canvas.resize((size, size), Image.Resampling.LANCZOS)
    output.save(PUBLIC / f"app-icon-{size}.png")

canvas.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png")
canvas.resize((512, 512), Image.Resampling.LANCZOS).save(ANDROID / "app_icon_full.png")

print(f"Prepared full-size My Wealth Square icon from {SOURCE.name}: {bbox}")
