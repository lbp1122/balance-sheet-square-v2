from collections import deque
from pathlib import Path
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ANDROID = ROOT / "android-app" / "app" / "src" / "main" / "res" / "drawable-nodpi"

# This file is the exact My Wealth Square artwork approved by the user.
# It was committed in "Use final My Wealth Square icon".
SOURCE = PUBLIC / "app-icon-192.png"

if not SOURCE.exists():
    raise RuntimeError("Missing approved My Wealth Square icon: public/app-icon-192.png")

image = Image.open(SOURCE).convert("RGBA")
width, height = image.size
pixels = image.load()

# Estimate the neutral presentation background from the four corners.
corners = [
    pixels[0, 0],
    pixels[width - 1, 0],
    pixels[0, height - 1],
    pixels[width - 1, height - 1],
]
background = tuple(
    round(sum(pixel[channel] for pixel in corners) / len(corners))
    for channel in range(3)
)

# Detect the artwork by contrast from the corner background.
xs = []
ys = []
for y in range(height):
    for x in range(width):
        r, g, b, a = pixels[x, y]
        difference = max(
            abs(r - background[0]),
            abs(g - background[1]),
            abs(b - background[2]),
        )
        if a > 10 and difference > 35:
            xs.append(x)
            ys.append(y)

if not xs:
    raise RuntimeError("Could not detect My Wealth Square artwork")

pad = max(1, round(min(width, height) * 0.01))
left = max(0, min(xs) - pad)
top = max(0, min(ys) - pad)
right = min(width, max(xs) + 1 + pad)
bottom = min(height, max(ys) + 1 + pad)
image = image.crop((left, top, right, bottom))

# Remove only neutral background connected to the outer edge.
# White chart symbols inside the blue/teal/red/gold icon are enclosed, so they stay.
pixels = image.load()
width, height = image.size

def is_background(pixel):
    r, g, b, a = pixel
    if a < 10:
        return True
    neutral = max(r, g, b) - min(r, g, b) < 28
    difference = max(
        abs(r - background[0]),
        abs(g - background[1]),
        abs(b - background[2]),
    )
    return neutral and (difference < 55 or (r + g + b) / 3 > 150)

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
    raise RuntimeError("My Wealth Square artwork disappeared during cleanup")

image = image.crop(bbox)

# Deliberately fill the full square. No outer white margin.
image = image.resize((512, 512), Image.Resampling.LANCZOS)

PUBLIC.mkdir(parents=True, exist_ok=True)
ANDROID.mkdir(parents=True, exist_ok=True)

image.save(PUBLIC / "app-icon-512.png", optimize=True)
image.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "app-icon-192.png", optimize=True)
image.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png", optimize=True)
image.save(ANDROID / "app_icon_full.png", optimize=True)

print(
    "Prepared full-size My Wealth Square icon "
    f"from {SOURCE.name}: source crop={(left, top, right, bottom)}, artwork={bbox}"
)
