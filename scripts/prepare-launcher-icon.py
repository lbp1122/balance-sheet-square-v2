from collections import deque
from pathlib import Path
from PIL import Image, ImageFile
import numpy as np

ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ANDROID = ROOT / "android-app" / "app" / "src" / "main" / "res" / "drawable-nodpi"
SOURCE = PUBLIC / "app-icon-512.jpg"

if not SOURCE.exists():
    raise RuntimeError("Missing approved My Wealth Square icon source: public/app-icon-512.jpg")

image = Image.open(SOURCE).convert("RGBA")

# Detect the coloured blue/gold/teal/coral artwork, not the neutral presentation background.
rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
channel_max = rgb.max(axis=2)
channel_min = rgb.min(axis=2)
colour_span = channel_max.astype(np.int16) - channel_min.astype(np.int16)
mask = (colour_span >= 35) & (channel_max >= 70)
ys, xs = np.where(mask)
if xs.size == 0:
    raise RuntimeError("Could not detect My Wealth Square icon artwork")

pad = max(3, round(min(image.size) * 0.018))
left = max(0, int(xs.min()) - pad)
top = max(0, int(ys.min()) - pad)
right = min(image.width, int(xs.max()) + 1 + pad)
bottom = min(image.height, int(ys.max()) + 1 + pad)
image = image.crop((left, top, right, bottom))

# Remove only neutral background pixels connected to an outer edge.
# Enclosed white chart symbols remain untouched.
pixels = image.load()
width, height = image.size

def is_background(pixel):
    r, g, b, a = pixel
    return a == 0 or (
        max(r, g, b) - min(r, g, b) <= 45
        and (r + g + b) / 3 >= 45
    )

queue = deque()
for x in range(width):
    queue.append((x, 0))
    queue.append((x, height - 1))
for y in range(height):
    queue.append((0, y))
    queue.append((width - 1, y))

seen = set()
while queue:
    x, y = queue.popleft()
    if (x, y) in seen:
        continue
    seen.add((x, y))
    if not is_background(pixels[x, y]):
        continue

    r, g, b, _ = pixels[x, y]
    pixels[x, y] = (r, g, b, 0)

    if x > 0:
        queue.append((x - 1, y))
    if x + 1 < width:
        queue.append((x + 1, y))
    if y > 0:
        queue.append((x, y - 1))
    if y + 1 < height:
        queue.append((x, y + 1))

bbox = image.getbbox()
if not bbox:
    raise RuntimeError("My Wealth Square artwork disappeared during background cleanup")

image = image.crop(bbox)

# Fill the complete launcher/in-app tile. No extra white or transparent safety margin.
image = image.resize((512, 512), Image.Resampling.LANCZOS)

PUBLIC.mkdir(parents=True, exist_ok=True)
ANDROID.mkdir(parents=True, exist_ok=True)

image.save(PUBLIC / "app-icon-512.png", optimize=True)
image.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "app-icon-192.png", optimize=True)
image.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png", optimize=True)
image.save(ANDROID / "app_icon_full.png", optimize=True)

print(f"Prepared full-size My Wealth Square icon from {SOURCE.name}: crop={(left, top, right, bottom)}, artwork={bbox}")
