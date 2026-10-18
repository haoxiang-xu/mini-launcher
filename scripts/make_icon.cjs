// Compose the Mini monogram as an SVG, then export native platform formats.
// PNG/ICO/ICNS conversion requires Pillow: python3 -m pip install Pillow.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Resvg } = require('@resvg/resvg-js');
const root = path.resolve(__dirname, '..');
const glyph = fs.readFileSync(path.join(root, 'src/assets/mini-monogram-3d.png')).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024">
  <defs><linearGradient id="green" x2="0" y2="1"><stop stop-color="#69b949"/><stop offset="1" stop-color="#3d922f"/></linearGradient></defs>
  <rect x="100" y="100" width="824" height="824" rx="184" fill="url(#green)"/>
  <rect x="101.5" y="101.5" width="821" height="821" rx="182.5" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="3"/>
  <svg x="229" y="244" width="566" height="500" viewBox="483 114 954 841"><image width="1920" height="1080" xlink:href="data:image/png;base64,${glyph}"/></svg>
</svg>\n`;
fs.writeFileSync(path.join(root, 'src/assets/mini-launcher-icon.svg'), svg);
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng();
for (const name of ['icon.png', 'icon-mac.png']) fs.writeFileSync(path.join(root, 'build', name), png);
execFileSync('python3', ['-c', `from PIL import Image
from pathlib import Path
root = Path(${JSON.stringify(root)}) / 'build'
with Image.open(root / 'icon.png') as image:
    image.save(root / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
    image.save(root / 'icon.icns', sizes=[(16,16),(32,32),(64,64),(128,128),(256,256),(512,512),(1024,1024)])
`]);
console.log('Mini Launcher SVG, PNG, ICO and ICNS generated.');
