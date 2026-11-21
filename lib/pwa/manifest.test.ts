import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

type Entry = { src: string; sizes?: string; type?: string; purpose?: string; form_factor?: string };
const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
  id: string;
  lang: string;
  dir: string;
  categories: string[];
  theme_color: string;
  background_color: string;
  icons: Entry[];
  screenshots: Entry[];
  shortcuts: Array<{ name: string; url: string }>;
};
const file = (src: string) => join("public", src);

describe("Web-App-Manifest", () => {
  it("hat die Pflichtfelder für den ausführlichen Installationsdialog", () => {
    expect(manifest).toMatchObject({ id: "/", lang: "de", dir: "ltr" });
    expect(manifest.categories).toEqual(["education", "productivity"]);
    expect(manifest.theme_color).toBe(manifest.background_color);
  });

  it("trennt „any“ und „maskable“ (nie kombiniert) und liefert beide Größen", () => {
    expect(manifest.icons.every((i) => i.purpose === "any" || i.purpose === "maskable")).toBe(true);
    for (const purpose of ["any", "maskable"]) {
      const sizes = manifest.icons.filter((i) => i.purpose === purpose).map((i) => i.sizes);
      expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    }
  });

  it("verweist nur auf vorhandene Dateien mit den angegebenen Maßen", async () => {
    for (const entry of [...manifest.icons, ...manifest.screenshots]) {
      expect(existsSync(file(entry.src)), entry.src).toBe(true);
      if (entry.type === "image/png" && entry.sizes) {
        const meta = await sharp(file(entry.src)).metadata();
        expect(`${meta.width}x${meta.height}`, entry.src).toBe(entry.sizes);
      }
    }
  });

  it("hat Screenshots für breit und schmal", () => {
    expect(manifest.screenshots.map((s) => s.form_factor).sort()).toEqual(["narrow", "wide"]);
  });

  it("hat die drei Verknüpfungen", () => {
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(["/", "/offline", "/exams"]);
  });

  it("liefert das Apple-Symbol deckend und die iOS-Startbilder in Gerätegröße", async () => {
    const touch = await sharp(file("icons/apple-touch-icon.png")).metadata();
    expect([touch.width, touch.height, touch.hasAlpha]).toEqual([180, 180, false]);
    const splash = await sharp(file("splash/iphone-393x852.png")).metadata();
    expect([splash.width, splash.height]).toEqual([1179, 2556]);
    const ipadLandscape = await sharp(file("splash/ipad-1194x834.png")).metadata();
    expect([ipadLandscape.width, ipadLandscape.height]).toEqual([2388, 1668]);
  });
});
