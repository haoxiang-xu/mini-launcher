"""Convert the selected Minecraft Launcher icon to platform icon formats."""
from pathlib import Path
from shutil import copyfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build"
OUT.mkdir(exist_ok=True)
source = ROOT / "src/assets/minecraft-launcher-icon.png"
copyfile(source, OUT / "icon.png")
with Image.open(source) as original:
    image = original.convert("RGBA")
    image.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
copyfile(ROOT / "src/assets/minecraft-launcher-icon-mac.png", OUT / "icon-mac.png")
copyfile(ROOT / "src/assets/minecraft-launcher-icon-mac.icns", OUT / "icon.icns")
