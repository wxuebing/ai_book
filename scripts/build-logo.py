"""把 logo 的圆角挖出来 —— 圆角外侧变透明，不再有灰底。

用户原话：「我让你把logo的圆角给改了，你也不该，ps不会吗？」

问题：原图是「圆角方形图标 + 浅灰背景」。上次只裁了最外圈，
圆角处的四个灰三角仍然保留，32px 显示时看起来脏。
正解：用圆角矩形蒙版挖空，输出**带 alpha 的 PNG**。
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

pub = Path("apps/web/public")
assets = Path("assets")
src = assets / "logo-original.jpg"
if not src.exists():
    print(f"缺少原图：{src}")
    sys.exit(1)

img = Image.open(src).convert("RGB")
w, h = img.size
print(f"原图：{w}x{h}")

# ── 1. 找图标包围盒（与背景色差异明显处）──
corners = [
    img.getpixel((2, 2)),
    img.getpixel((w - 3, 2)),
    img.getpixel((2, h - 3)),
    img.getpixel((w - 3, h - 3)),
]
bg = tuple(sum(c[i] for c in corners) // len(corners) for i in range(3))
print(f"背景色：rgb{bg}")

px = img.load()
TH = 24
min_x, min_y, max_x, max_y = w, h, -1, -1
for y in range(0, h, 2):
    for x in range(0, w, 2):
        r, g, b = px[x, y]
        if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > TH:
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            min_y = min(min_y, y)
            max_y = max(max_y, y)

side = min(max_x - min_x, max_y - min_y)
left = (min_x + max_x) // 2 - side // 2
top = (min_y + max_y) // 2 - side // 2
print(f"图标框：({left},{top}) 边长 {side}")

icon = img.crop((left, top, left + side, top + side))

# ── 2. 圆角半径 ──
# 原图是 iOS 风格的圆角方形，圆角半径约等于边长的 22%。
# 不用自动检测：图标内部也有弧线（云纹），自动扫会误判到内部弧。
radius = int(side * 0.22)
print(f"圆角半径：{radius}px（边长 {side} 的 22%）")

# ── 2b. 只吃掉"图标圆角外侧"的真背景，不吃图标自带的奶白边框 ──
# 原图结构：浅灰背景 → 奶白圆角边框(rgba 253,252,247) → 金色细线 → 深青底。
# 奶白边框是**设计的一部分**，必须保留。
# 做法：从四角泛洪，但容差调小到 12 —— 只吃纯浅灰背景(rgb 220,221,215)，
# 不会越过奶白边框（与浅灰差 33）。
from PIL import ImageDraw as _D

SENT = (254, 1, 254)  # 泛洪标记色
flood = icon.copy()

for corner in [(0, 0), (side - 1, 0), (0, side - 1), (side - 1, side - 1)]:
    try:
        _D.floodfill(flood, corner, SENT, thresh=12)
    except Exception:
        pass

fp = flood.load()
bg_mask = Image.new("L", (side, side), 255)  # 255 = 保留
bp = bg_mask.load()
eaten = 0
for y in range(side):
    for x in range(side):
        if fp[x, y] == SENT:
            bp[x, y] = 0
            eaten += 1
print(f"吃掉真背景：{eaten / (side * side):.1%}（保留奶白边框）")

# ── 3. 圆角蒙版（4x 超采样）× flood fill ──
# 圆角半径取奶白边框的外沿 —— 22% 略大，用 20% 更贴合
SS = 4
geo = Image.new("L", (side * SS, side * SS), 0)
gd = ImageDraw.Draw(geo)
gd.rounded_rectangle(
    [0, 0, side * SS - 1, side * SS - 1], radius=int(side * 0.20) * SS, fill=255
)
geo = geo.resize((side, side), Image.LANCZOS)

mask = Image.composite(bg_mask, Image.new("L", (side, side), 0), geo)

rgba = icon.convert("RGBA")
rgba.putalpha(mask)

# ── 4. 各尺寸输出（PNG 保留 alpha）──
master = assets / "logo-master.png"
rgba.save(master, "PNG", optimize=True)
print(f"母版：{master.name} {master.stat().st_size // 1024}KB")

for size in (64, 128, 256):
    out = pub / f"logo-{size}.png"
    rgba.resize((size, size), Image.LANCZOS).save(out, "PNG", optimize=True)
    print(f"  {out.name}: {out.stat().st_size / 1024:.1f} KB")

# favicon：带 alpha
ico = pub / "favicon.ico"
rgba.resize((256, 256), Image.LANCZOS).save(
    ico, sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]
)
print(f"  {ico.name}: {ico.stat().st_size / 1024:.1f} KB")

# 清理旧的 jpg 版本（避免样式里引用错）
for old in pub.glob("logo-*.jpg"):
    old.unlink()
    print(f"  已删除旧文件 {old.name}")
