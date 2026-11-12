"""检查 logo PNG 的 alpha 通道：四角应透明，中心应不透明。"""

from pathlib import Path

from PIL import Image

p = Path("apps/web/public/logo-128.png")
if not p.exists():
    print("MISSING")
    raise SystemExit(1)

im = Image.open(p).convert("RGBA")
w, h = im.size
px = im.load()

corners = [px[1, 1][3], px[w - 2, 1][3], px[1, h - 2][3], px[w - 2, h - 2][3]]
center = px[w // 2, h // 2][3]
print(f"corners={corners}")
print(f"center={center}")
