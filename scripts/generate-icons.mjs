import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BG = [15, 23, 42]; // #0f172a
const FG = [56, 189, 248]; // #38bdf8 accent

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  const capR = size * 0.32;
  const brimW = size * 0.62;
  const brimH = size * 0.09;

  for (let y = 0; y < size; y++) {
    let offset = y * (size * 4 + 1);
    raw[offset] = 0; // filter type none
    offset += 1;
    for (let x = 0; x < size; x++) {
      let [r, g, b] = BG;
      const dx = x - cx;
      const dy = y - (cy - size * 0.06);
      const inCap = (dx * dx) / (capR * capR) + (dy * dy) / (capR * capR * 0.7) <= 1;
      const inBrim =
        Math.abs(x - cx) <= brimW / 2 &&
        Math.abs(y - (cy + size * 0.1)) <= brimH / 2;
      if (inCap || inBrim) {
        [r, g, b] = FG;
      }
      const p = offset + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = 255;
    }
  }

  const idat = deflateSync(raw);

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const png = makePng(size);
  writeFileSync(join(outDir, `icon-${size}x${size}.png`), png);
  console.log(`wrote icon-${size}x${size}.png (${png.length} bytes)`);
}
