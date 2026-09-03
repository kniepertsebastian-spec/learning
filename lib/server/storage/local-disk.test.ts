import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("local-disk storage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "sources-test-"));
    process.env.SOURCES_STORAGE_DIR = tempDir;
  });

  afterEach(async () => {
    delete process.env.SOURCES_STORAGE_DIR;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("derives a stable, sharded storage key from a checksum", async () => {
    const { sha256Hex, storageKeyForChecksum } = await import("./local-disk");
    const checksum = sha256Hex(Buffer.from("hello world"));
    const key = storageKeyForChecksum(checksum);
    expect(key).toBe(`${checksum.slice(0, 2)}/${checksum}.pdf`);
  });

  it("writes and reads back the exact same bytes", async () => {
    const { sha256Hex, storageKeyForChecksum, writeSourceFile, readSourceFile } = await import(
      "./local-disk"
    );
    const data = Buffer.from("%PDF-1.4 fake content for the round trip test");
    const key = storageKeyForChecksum(sha256Hex(data));

    await writeSourceFile(key, data);
    const readBack = await readSourceFile(key);

    expect(readBack.equals(data)).toBe(true);
  });

  it("rejects a storage key that isn't a valid sha256-sharded path", async () => {
    const { writeSourceFile, readSourceFile } = await import("./local-disk");
    const data = Buffer.from("irrelevant");

    await expect(writeSourceFile("../../etc/passwd", data)).rejects.toThrow();
    await expect(readSourceFile("not-a-real-key.pdf")).rejects.toThrow();
  });
});
