from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "app-icon-1024.png"
PUBLIC = ROOT / "public"
ANDROID = ROOT / "android-app" / "app" / "src" / "main" / "res" / "drawable-nodpi"

image = Image.open(SOURCE).convert("RGBA")

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
pad = max(2, round(side * 0.012))
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
canvas.resize((512, 512), Image.Resampling.LANCZOS).save(ANDROID / "app_icon_v2.png")

print(f"Prepared full-size My Wealth Square icon from {SOURCE.name}: {bbox}")
