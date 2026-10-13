import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = process.cwd();
const BUILD_DIR = path.join(ROOT, "build");

const SIZES = [16, 32, 64, 128, 256, 512, 1024];
const ICNS_TYPES = new Map([
  [16, "icp4"],
  [32, "icp5"],
  [64, "icp6"],
  [128, "ic07"],
  [256, "ic08"],
  [512, "ic09"],
  [1024, "ic10"]
]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function isInsideRoundedRect(x, y, size, radius) {
  const max = size - 1;
  const left = x < radius;
  const right = x > max - radius;
  const top = y < radius;
  const bottom = y > max - radius;

  if ((left || right) && (top || bottom)) {
    const cx = left ? radius : max - radius;
    const cy = top ? radius : max - radius;
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  }

  return true;
}

function drawRect(buffer, size, x0, y0, x1, y1, color) {
  const [r, g, b, a] = color;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(size, Math.ceil(y1)); y += 1) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(size, Math.ceil(x1)); x += 1) {
      const offset = (y * size + x) * 4;
      buffer[offset] = r;
      buffer[offset + 1] = g;
      buffer[offset + 2] = b;
      buffer[offset + 3] = a;
    }
  }
}

function makeImage(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.18);
  const bgTop = [50, 112, 92];
  const bgBottom = [30, 73, 62];

  for (let y = 0; y < size; y += 1) {
    const progress = y / Math.max(1, size - 1);
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      if (!isInsideRoundedRect(x, y, size, radius)) {
        rgba[offset + 3] = 0;
        continue;
      }

      const diagonal = (x + y) / (size * 2);
      rgba[offset] = Math.round(bgTop[0] * (1 - progress) + bgBottom[0] * progress + diagonal * 8);
      rgba[offset + 1] = Math.round(bgTop[1] * (1 - progress) + bgBottom[1] * progress + diagonal * 8);
      rgba[offset + 2] = Math.round(bgTop[2] * (1 - progress) + bgBottom[2] * progress + diagonal * 8);
      rgba[offset + 3] = 255;
    }
  }

  const white = [255, 250, 243, 255];
  const amber = [215, 149, 0, 255];
  drawRect(rgba, size, size * 0.28, size * 0.22, size * 0.40, size * 0.78, white);
  drawRect(rgba, size, size * 0.28, size * 0.22, size * 0.75, size * 0.35, white);
  drawRect(rgba, size, size * 0.28, size * 0.43, size * 0.65, size * 0.55, white);
  drawRect(rgba, size, size * 0.28, size * 0.82, size * 0.72, size * 0.89, amber);

  return rgba;
}

function makePng(size) {
  const raw = makeImage(size);
  const stride = size * 4;
  const scanlines = Buffer.alloc((stride + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const target = y * (stride + 1);
    scanlines[target] = 0;
    raw.copy(scanlines, target + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    chunk("IEND")
  ]);
}

function makeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((item) => item.data)]);
}

function makeIcns(pngs) {
  const iconChunks = pngs
    .filter(({ size }) => ICNS_TYPES.has(size))
    .map(({ size, data }) => {
      const type = Buffer.from(ICNS_TYPES.get(size), "ascii");
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length + 8, 0);
      return Buffer.concat([type, length, data]);
    });

  const totalLength = 8 + iconChunks.reduce((sum, item) => sum + item.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(totalLength, 4);

  return Buffer.concat([header, ...iconChunks]);
}

function makeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Formatter">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#36705c"/>
      <stop offset="100%" stop-color="#1e493e"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="180" fill="url(#bg)"/>
  <path d="M286 224h486v132H416v107h282v123H416v214H286z" fill="#fffaf3"/>
  <rect x="286" y="840" width="452" height="72" rx="20" fill="#d79500"/>
</svg>
`;
}

await mkdir(BUILD_DIR, { recursive: true });

const pngs = SIZES.map((size) => ({ size, data: makePng(size) }));
await writeFile(path.join(BUILD_DIR, "icon.svg"), makeSvg(), "utf8");
await writeFile(path.join(BUILD_DIR, "icon.png"), pngs.find((item) => item.size === 1024).data);
await writeFile(path.join(BUILD_DIR, "icon.ico"), makeIco(pngs.filter((item) => item.size <= 256).reverse()));
await writeFile(path.join(BUILD_DIR, "icon.icns"), makeIcns(pngs));

console.log("Generated build/icon.svg, build/icon.png, build/icon.ico, and build/icon.icns");
