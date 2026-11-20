/**
 * Quellen eines Kursauftrags sind Adressen (http/https) oder hochgeladene Dateien. Eine Datei steht in der Liste als
 * `upload:<id>`; so passen beide in dieselbe Liste (source_urls) und behalten ihre Reihenfolge. Ohne Server-Code, damit
 * auch die Oberfläche es nutzt.
 */
export const UPLOAD_REF_PREFIX = "upload:";

export function uploadRef(id: string): string {
  return `${UPLOAD_REF_PREFIX}${id}`;
}

export function isUploadRef(value: string): boolean {
  return value.startsWith(UPLOAD_REF_PREFIX);
}

/** Gültige Quelle: eine http(s)-Adresse oder ein Upload-Verweis mit UUID. */
export function isValidSourceRef(value: string): boolean {
  if (isUploadRef(value)) return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.slice(UPLOAD_REF_PREFIX.length));
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
