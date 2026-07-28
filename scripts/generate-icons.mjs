import { createRequire } from 'module';
import { writeFileSync } from 'fs';

const require = createRequire(import.meta.url);
const sharp = require('/usr/lib/node_modules/sharp-cli/node_modules/sharp');

// Droplet SVG: centered in 1024x1024, ~600px tall
// Four quadrants clipped to droplet shape, white pulse line through center
// Droplet: pointed top, rounded bottom, centered at (512, 512), ~280px wide, 360px tall
// The droplet path: tip at top-center, curves out to sides, rounds at bottom

const CREAM  = '#FBFAF7';
const TEAL   = '#8ED4D8';   // top-left: activity / steps (lighter)
const CORAL  = '#F2A28C';   // top-right: food / meals (lighter)
const PURPLE = '#B092D9';   // bottom-left: finance (lighter)
const BERRY  = '#CE7A92';   // bottom-right: glucose / HR (lighter)
const WHITE  = '#FFFFFF';
const BLACK  = '#111111';

// Droplet: shifted down 57px vs old design so bounding box (y=227–797) centers at y=512 in the tile
const DROPLET = `M 512 227 C 512 227, 652 377, 672 547 C 692 717, 610 797, 512 797 C 414 797, 332 717, 352 547 C 372 377, 512 227, 512 227 Z`;

// Pulse baseline at y=512. Endpoints at x=270 (left) and x=760 (right) extend well past the
// droplet boundary (~x=358 left, ~x=666 right) so the clip-path terminates each end flush
// with the outline — no gap on either side, no overhang into the cream background.
const PULSE = `M 270 512 L 440 512 L 465 512 L 480 447 L 510 691 L 530 512 L 760 512`;

function iconSVG(bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  ${bg ? `<rect width="1024" height="1024" fill="${CREAM}"/>` : ''}

  <defs>
    <clipPath id="drop">
      <path d="${DROPLET}"/>
    </clipPath>
    <clipPath id="topLeft">
      <rect x="0" y="0" width="512" height="512"/>
    </clipPath>
    <clipPath id="topRight">
      <rect x="512" y="0" width="512" height="512"/>
    </clipPath>
    <clipPath id="bottomLeft">
      <rect x="0" y="512" width="512" height="512"/>
    </clipPath>
    <clipPath id="bottomRight">
      <rect x="512" y="512" width="512" height="512"/>
    </clipPath>
  </defs>

  <!-- four colour quadrants, clipped to droplet -->
  <g clip-path="url(#drop)">
    <rect x="0"   y="0"   width="512" height="512" fill="${TEAL}"   clip-path="url(#topLeft)"/>
    <rect x="512" y="0"   width="512" height="512" fill="${CORAL}"  clip-path="url(#topRight)"/>
    <rect x="0"   y="512" width="512" height="512" fill="${PURPLE}" clip-path="url(#bottomLeft)"/>
    <rect x="512" y="512" width="512" height="512" fill="${BERRY}"  clip-path="url(#bottomRight)"/>
  </g>

  <!-- droplet outline -->
  <path d="${DROPLET}" fill="none" stroke="${BLACK}" stroke-width="4"/>

  <!-- pulse line — butt caps so clip produces a clean edge at the outline -->
  <path d="${PULSE}" fill="none" stroke="${BLACK}" stroke-width="22"
        stroke-linecap="butt" stroke-linejoin="round"
        clip-path="url(#drop)"/>
</svg>`;
}

function monoSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <defs>
    <clipPath id="drop">
      <path d="${DROPLET}"/>
    </clipPath>
  </defs>
  <!-- solid dark droplet with outline -->
  <path d="${DROPLET}" fill="#1A1A1A" stroke="${BLACK}" stroke-width="4"/>
  <!-- white pulse line — butt caps for clean clip at outline -->
  <path d="${PULSE}" fill="none" stroke="${WHITE}" stroke-width="22"
        stroke-linecap="butt" stroke-linejoin="round"
        clip-path="url(#drop)"/>
</svg>`;
}

const SIZE = 1024;

async function render(svgStr, outPath) {
  await sharp(Buffer.from(svgStr))
    .resize(SIZE, SIZE)
    .png()
    .toFile(outPath);
  console.log('wrote', outPath);
}

const base = '/root/wellness-fresh-multiuser-dev/assets/images';

await render(iconSVG(true),  `${base}/icon.png`);
await render(iconSVG(false), `${base}/android-icon-foreground.png`);
await render(monoSVG(),      `${base}/android-icon-monochrome.png`);

// Solid cream background — just a flat colour image
await sharp({
  create: { width: SIZE, height: SIZE, channels: 4,
             background: { r: 0xFB, g: 0xFA, b: 0xF7, alpha: 1 } }
}).png().toFile(`${base}/android-icon-background.png`);
console.log('wrote', `${base}/android-icon-background.png`);

console.log('All icons generated.');
