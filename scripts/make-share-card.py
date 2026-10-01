"""Development-only original share artwork. Requires Pillow and a Chinese system font."""

from pathlib import Path
import math
import random

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCALE = 2
image = Image.new("RGB", (1200 * SCALE, 630 * SCALE), "#09141c")
draw = ImageDraw.Draw(image)
font_path = Path("C:/Windows/Fonts/msyh.ttc")
if not font_path.exists():
    raise SystemExit("Set font_path in this script to a Chinese system font.")


def font(size):
    return ImageFont.truetype(str(font_path), size * SCALE)


def text(position, content, size, color):
    draw.text(tuple(round(v * SCALE) for v in position), content, font=font(size), fill=color)


def ellipse(box, fill=None, outline=None, width=1):
    draw.ellipse(tuple(round(v * SCALE) for v in box), fill=fill, outline=outline, width=width * SCALE)


def line(points, color, width=1):
    draw.line([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=color, width=width * SCALE)


random.seed(31415)
for _ in range(110):
    x, y = random.randint(0, 1199), random.randint(0, 629)
    r = random.choice([0.5, 0.5, 1])
    ellipse((x - r, y - r, x + r, y + r), "#365765")

# Restrained orbital map and a distant, lit planet.
for radius in (141, 191, 241):
    ellipse((915 - radius, 312 - radius, 915 + radius, 312 + radius), outline="#1e3743")
ellipse((822, 219, 1008, 405), "#1c4949", "#427569", 2)
ellipse((828, 225, 946, 393), "#27625b")
ellipse((828, 231, 918, 386), "#35786a")
ellipse((965, 193, 986, 214), "#83e8c5")
line([(976, 204), (797, 348), (712, 482)], "#456e67", 2)
ellipse((789, 340, 805, 356), "#bddacb")
ellipse((698, 468, 726, 496), "#1c4538", "#83e8c5", 2)

text((70, 67), "DEEP SPACE COMMS", 17, "#83e8c5")
line([(72, 123), (127, 123)], "#83e8c5", 3)
text((67, 159), "深空通信站", 66, "#e0eeeb")
text((74, 276), "一段信号，一次来自远方的回应。", 26, "#b2c8c6")
text((74, 338), "跟随剧情，亲手压缩消息、修复错误。", 22, "#829da8")
text((74, 474), "信息熵  /  哈夫曼编码  /  汉明纠错", 18, "#9ab9b0")
text((74, 526), "18 个航段 · 独立挑战 · 原创配乐", 17, "#6c8d9b")
text((836, 528), "MIRA / SECTOR 04", 12, "#5b8790")

image.resize((1200, 630), Image.Resampling.LANCZOS).save(ROOT / "assets/share-card.png", optimize=True)
print("Created assets/share-card.png (1200 × 630)")
