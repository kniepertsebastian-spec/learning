/** Screenshots zu Firmendokumenten: Typ (Endung, MIME-Typ UND Dateikopf) und Größe prüfen. */

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGES_PER_DOCUMENT = 20;

const TYPES: Record<string, { mime: string; magic: (b: Buffer) => boolean }> = {
  png: { mime: "image/png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { mime: "image/webp", magic: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
};

export type ImageInspection =
  | { ok: true; mimeType: string }
  | { ok: false; code: "empty" | "too_large" | "unsupported_type" | "invalid_content"; message: string };

export function inspectImage(input: { filename: string; mimeType: string; data: Buffer }): ImageInspection {
  if (input.data.byteLength === 0) return { ok: false, code: "empty", message: "Die Datei ist leer." };
  if (input.data.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, code: "too_large", message: `Das Bild ist größer als ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.` };
  }
  const ext = /\.([A-Za-z0-9]+)$/.exec(input.filename.trim())?.[1]?.toLowerCase() ?? "";
  const type = TYPES[ext];
  const mime = input.mimeType.trim().toLowerCase();
  if (!type || (mime !== type.mime && mime !== "application/octet-stream" && mime !== "")) {
    return { ok: false, code: "unsupported_type", message: "Erlaubt sind Bilder als PNG, JPEG oder WebP; Typ und Endung müssen zusammenpassen." };
  }
  if (!type.magic(input.data)) {
    return { ok: false, code: "invalid_content", message: "Der Inhalt passt nicht zum Bildtyp." };
  }
  return { ok: true, mimeType: type.mime };
}
