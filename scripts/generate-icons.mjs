// Erzeugt alle App-Icons und iOS-Startbilder aus einem Entwurf (Marke: indigofarbenes „K“ auf Navy).
// Aufruf: node scripts/generate-icons.mjs   (benötigt `sharp`, kommt mit Next.js)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const BG = "#0A1118"; // Dunkles Theme (--bg in globals.css)
const TILE = "#161B3A"; // Navy-Kachel der Marke
const MARK = "#A9AFFF"; // --accent-text (dunkel)

// „K“ auf einer 512er-Fläche, mittig; Maße so, dass es in der 80-%-Sicherheitszone (Mitte, Radius 205) bleibt.
const GLYPH = `M160 128 H216 V240 L292 128 H358 L276 248 L362 384 H294 L224 284 V384 H160 Z`;
const glyph = (fill, scale = 1) => `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)"><path d="${GLYPH}" fill="${fill}" fill-rule="evenodd"/></g>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`;
/** Rundes Symbol (purpose „any“): transparente Ecken. */
const anySvg = svg(`<rect width="512" height="512" rx="112" fill="${TILE}"/>${glyph(MARK)}`);
/** Maskable und Apple: bis an den Rand gefüllt, das System schneidet zu; das Zeichen bleibt in der Sicherheitszone. */
const fullSvg = svg(`<rect width="512" height="512" fill="${TILE}"/>${glyph(MARK, 0.9)}`);

const out = "public/icons";
mkdirSync(out, { recursive: true });
const png = (source, size) => sharp(Buffer.from(source)).resize(size, size).png().toBuffer();

writeFileSync(join(out, "icon.svg"), anySvg);
for (const size of [192, 512]) {
  writeFileSync(join(out, `icon-${size}x${size}.png`), await png(anySvg, size));
  writeFileSync(join(out, `maskable-${size}x${size}.png`), await png(fullSvg, size));
}
writeFileSync(join(out, "apple-touch-icon.png"), await sharp(Buffer.from(fullSvg)).resize(180, 180).flatten({ background: TILE }).png().toBuffer());

// favicon.ico mit 32×32 und 48×48 (PNG-Einträge sind in ICO erlaubt)
const sizes = [32, 48];
const images = await Promise.all(sizes.map((s) => png(anySvg, s)));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((img, i) => {
  const e = 6 + i * 16;
  header[e] = sizes[i];
  header[e + 1] = sizes[i];
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(img.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
writeFileSync("app/favicon.ico", Buffer.concat([header, ...images]));

// iOS-Startbilder: dunkler Grund, Zeichen mittig. Gerät → Pixelgröße (Punkte × Faktor); das iPad zusätzlich im Querformat
// (w/h getauscht, pw/ph bleiben Hochformat-Werte wie in der Media-Query von app/layout.tsx).
export const STARTUP_IMAGES = [
  { name: "iphone-430x932", w: 1290, h: 2796, pw: 430, ph: 932, ratio: 3 },
  { name: "iphone-393x852", w: 1179, h: 2556, pw: 393, ph: 852, ratio: 3 },
  { name: "iphone-390x844", w: 1170, h: 2532, pw: 390, ph: 844, ratio: 3 },
  { name: "iphone-414x896", w: 828, h: 1792, pw: 414, ph: 896, ratio: 2 },
  { name: "iphone-375x667", w: 750, h: 1334, pw: 375, ph: 667, ratio: 2 },
  { name: "ipad-834x1194", w: 1668, h: 2388, pw: 834, ph: 1194, ratio: 2 },
  { name: "ipad-1194x834", w: 2388, h: 1668, pw: 834, ph: 1194, ratio: 2 },
];
mkdirSync("public/splash", { recursive: true });
const mark = await png(anySvg, 220);
for (const s of STARTUP_IMAGES) {
  const buf = await sharp({ create: { width: s.w, height: s.h, channels: 3, background: BG } })
    .composite([{ input: mark, left: Math.round((s.w - 220) / 2), top: Math.round((s.h - 220) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join("public/splash", `${s.name}.png`), buf);
}
console.log("Icons und Startbilder erzeugt.");
