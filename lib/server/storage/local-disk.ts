import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * R1.1 (roadmap.md): lokaler Datei-Storage für hochgeladene Prüfungsunterlagen
 * (PDFs) - bewusst ein benanntes Docker-Volume statt eines externen
 * Objektspeichers, passend zum aktuellen Single-Instance-Deployment (siehe
 * docker-compose.yml). `SOURCES_STORAGE_DIR` zeigt im Container auf das
 * Volume; ohne Docker (lokale Entwicklung) fällt es auf ./data/sources im
 * Repo zurück (siehe .gitignore).
 */
function storageRoot(): string {
  return process.env.SOURCES_STORAGE_DIR
    ? path.resolve(process.env.SOURCES_STORAGE_DIR)
    : path.resolve(process.cwd(), "data", "sources");
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Inhaltsadressierter Storage-Key (sha256-sharded), unabhängig von einer
 * einzelnen Zertifizierung - identische Bytes landen unabhängig vom Upload
 * nur einmal auf der Platte. Ausschließlich aus einem bereits berechneten
 * Hex-Hash gebaut (nie aus Nutzereingaben), daher keine Pfad-Traversal-Gefahr.
 */
export function storageKeyForChecksum(checksum: string): string {
  return `${checksum.slice(0, 2)}/${checksum}.pdf`;
}

const STORAGE_KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f]{64}\.pdf$/;

function resolveStoragePath(storageKey: string): string {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new Error(`Ungültiger storageKey: ${storageKey}`);
  }
  return path.join(storageRoot(), storageKey);
}

/** Schreibt nur, falls die Datei noch nicht existiert - Dateien sind
 * inhaltsadressiert, ein erneuter Schreibvorgang wäre ein No-op mit
 * identischem Inhalt. */
export async function writeSourceFile(storageKey: string, data: Buffer): Promise<void> {
  const filePath = resolveStoragePath(storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
}

export async function readSourceFile(storageKey: string): Promise<Buffer> {
  return readFile(resolveStoragePath(storageKey));
}
