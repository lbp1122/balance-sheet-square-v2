from collections import deque
from pathlib import Path
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ANDROID = ROOT / "android-app" / "app" / "src" / "main" / "res" / "drawable-nodpi"
CANDIDATES = [
    # The JPG files contain the user-approved My Wealth Square artwork.
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

# The approved artwork was supplied on a neutral presentation canvas.
# Crop to the central artwork area first so the icon itself occupies most of the launcher tile.
if SOURCE.suffix.lower() in {".jpg", ".jpeg"}:
    side = min(image.width, image.height)
    crop_side = max(1, round(side * 0.66))
    left = (image.width - crop_side) // 2
    top = (image.height - crop_side) // 2
    image = image.crop((left, top, left + crop_side, top + crop_side))

# Remove only neutral background pixels that are connected to an outer edge.
# This cannot erase the enclosed white chart symbols.
px = image.load()
w, h = image.size
seen = set()
queue = deque()

def is_background(pixel):
    r, g, b, a = pixel
    if a == 0:
        return True
    # White/grey presentation background and its shadow are nearly neutral.
    return max(r, g, b) - min(r, g, b) <= 34 and (r + g + b) / 3 >= 70

for x in range(w):
    for y in (0, h - 1):
        if is_background(px[x, y]):
            queue.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if is_background(px[x, y]):
            queue.append((x, y))

while queue:
    x, y = queue.popleft()
    if (x, y) in seen or not is_background(px[x, y]):
        continue
    seen.add((x, y))
    r, g, b, _ = px[x, y]
    px[x, y] = (r, g, b, 0)
    if x > 0:
        queue.append((x - 1, y))
    if x + 1 < w:
        queue.append((x + 1, y))
    if y > 0:
        queue.append((x, y - 1))
    if y + 1 < h:
        queue.append((x, y + 1))

bbox = image.getbbox()
if not bbox:
    raise RuntimeError("Could not detect icon artwork after edge cleanup")
image = image.crop(bbox)

# Keep the icon full-size: no extra white or transparent safety margin.
side = max(image.size)
canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
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
