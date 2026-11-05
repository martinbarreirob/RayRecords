// Draws the app icon (the ray logo from public/logo.svg on a white tile) and writes it as PNG
// files, plus an ICO and an SVG for the browser tab. No dependencies: it parses the logo's shapes
// (an ellipse and paths made of M, L, C and Z) and rasterizes them itself.
// Run it from apps/web with `pnpm icons` after changing the logo or the tile.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/', import.meta.url);
mkdirSync(new URL('icons/', OUT), { recursive: true });

const BACKGROUND = [255, 255, 255]; // white tile
const DISC = [43, 43, 43]; // charcoal, as in logo.svg
const RAY = [255, 255, 255];

// The disc takes this share of the tile (a maskable icon keeps its content inside 80%).
const DISC_SHARE = 0.8;

/** Reads the shapes of logo.svg in drawing order: an ellipse or a flattened path, with its fill. */
function readLogo() {
  const svg = readFileSync(new URL('logo.svg', OUT), 'utf8');
  const shapes = [];
  for (const [tag] of svg.matchAll(/<(?:ellipse|path)\s[^>]*>/g)) {
    const fill = /fill="([^"]+)"/.exec(tag)[1];
    const color = fill.toLowerCase() === '#fff' ? RAY : DISC;
    if (tag.startsWith('<ellipse')) {
      const attr = (name) => Number(new RegExp(`${name}="([^"]+)"`).exec(tag)[1]);
      shapes.push({
        color,
        ellipse: { cx: attr('cx'), cy: attr('cy'), rx: attr('rx'), ry: attr('ry') },
      });
    } else {
      const polygon = flatten(/\sd="([^"]+)"/.exec(tag)[1]);
      const xs = polygon.map((p) => p[0]);
      const ys = polygon.map((p) => p[1]);
      const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      shapes.push({ color, polygon, box });
    }
  }
  const disc = shapes[0].ellipse;
  return { svg, shapes, disc };
}

/** Turns a path of absolute M, L, C and Z commands into a polygon (cubic curves in 12 steps). */
function flatten(d) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g);
  const points = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[MLCZ]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'Z') continue;
    if (cmd === 'M' || cmd === 'L') {
      x = num();
      y = num();
      points.push([x, y]);
    } else if (cmd === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
      for (let t = 1; t <= 12; t++) {
        const u = t / 12;
        const v = 1 - u;
        points.push([
          v ** 3 * x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u ** 3 * x3,
          v ** 3 * y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u ** 3 * y3,
        ]);
      }
      x = x3;
      y = y3;
    }
  }
  return points;
}

/** Non-zero winding test of a point against a polygon. */
function inside(polygon, px, py) {
  let winding = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    if (ay <= py) {
      if (by > py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) > 0) winding++;
    } else if (by <= py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) < 0) winding--;
  }
  return winding !== 0;
}

const logo = readLogo();
const scale = DISC_SHARE / (logo.disc.rx * 2); // logo units -> unit square

/** Colour at a point of the unit square, as [r, g, b, a], or null when the point is transparent. */
function shade(x, y, { rounded }) {
  if (rounded) {
    // Rounded square: points outside the corner arcs are transparent.
    const r = 0.22;
    const cx = Math.min(Math.max(x, r), 1 - r);
    const cy = Math.min(Math.max(y, r), 1 - r);
    if (Math.hypot(x - cx, y - cy) > r) return null;
  }

  // Back to logo coordinates, with the disc centred in the tile.
  const lx = logo.disc.cx + (x - 0.5) / scale;
  const ly = logo.disc.cy + (y - 0.5) / scale;
  let color = BACKGROUND;
  for (const shape of logo.shapes) {
    const hit = shape.ellipse
      ? ((lx - shape.ellipse.cx) / shape.ellipse.rx) ** 2 +
          ((ly - shape.ellipse.cy) / shape.ellipse.ry) ** 2 <=
        1
      : lx >= shape.box[0] &&
        lx <= shape.box[2] &&
        ly >= shape.box[1] &&
        ly <= shape.box[3] &&
        inside(shape.polygon, lx, ly);
    if (hit) color = shape.color;
  }
  return [...color, 255];
}

/** Renders the icon at `size` px with 3x3 supersampling for smooth edges. */
function render(size, options) {
  const samples = 3;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const color = shade(
            (px + (sx + 0.5) / samples) / size,
            (py + (sy + 0.5) / samples) / size,
            options,
          );
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          a += color[3];
        }
      }
      const covered = a / 255;
      const offset = (py * size + px) * 4;
      if (covered > 0) {
        pixels[offset] = Math.round(r / covered);
        pixels[offset + 1] = Math.round(g / covered);
        pixels[offset + 2] = Math.round(b / covered);
      }
      pixels[offset + 3] = Math.round(a / (samples * samples));
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, options) {
  const pixels = render(size, options);
  // Each scanline starts with a filter byte (0 = none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A .ico that holds a single PNG image (supported by every current browser). */
function ico(size) {
  const image = png(size, { rounded: true });
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header[6] = size;
  header[7] = size;
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(image.length, 14);
  header.writeUInt32LE(22, 18); // offset of the image
  return Buffer.concat([header, image]);
}

const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
// The logo's own shapes, moved and scaled to sit on the tile.
const inner = logo.svg
  .replace(/^[\s\S]*?<\/title>/, '')
  .replace('</svg>', '')
  .trim();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="${hex(BACKGROUND)}"/>
  <g transform="translate(${(50 - logo.disc.cx * scale * 100).toFixed(2)} ${(50 - logo.disc.cy * scale * 100).toFixed(2)}) scale(${(scale * 100).toFixed(5)})">${inner}</g>
</svg>
`;

const write = (path, data) => writeFileSync(new URL(path, OUT), data);
write('icons/icon-192.png', png(192, { rounded: true }));
write('icons/icon-512.png', png(512, { rounded: true }));
// Maskable: full bleed, the system applies its own mask (the record stays inside the safe zone).
write('icons/icon-maskable-512.png', png(512, { rounded: false }));
write('icons/apple-touch-icon.png', png(180, { rounded: false }));
write('icons/icon.svg', svg);
write('favicon.ico', ico(48));
console.log('Icons written to apps/web/public');
