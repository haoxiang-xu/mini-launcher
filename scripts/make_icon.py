"""Draw the mini wordmark icon for the Windows launcher."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build"
OUT.mkdir(exist_ok=True)
image = Image.new("RGBA", (256, 256), "#0a0a0a")
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((15, 15, 241, 241), radius=28, outline="#f5f5f5", width=5)
font = ImageFont.truetype(str(ROOT / "src/fonts/Monocraft-Bold.ttf"), 60)
draw.text((128, 128), "mini", anchor="mm", font=font, fill="#f5f5f5")
image.save(OUT / "icon.png")
image.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
