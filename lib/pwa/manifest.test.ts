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
  description: string;
  shortcuts: Array<{ name: string; url: string; icons: Entry[] }>;
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

  it("hat die drei Verknüpfungen, jede mit eigenem 96er-Symbol", async () => {
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(["/", "/offline", "/exams"]);
    const icons = manifest.shortcuts.map((s) => s.icons[0]);
    expect(new Set(icons.map((i) => i.src)).size).toBe(3);
    for (const icon of icons) {
      expect(icon.sizes).toBe("96x96");
      const meta = await sharp(file(icon.src)).metadata();
      expect(`${meta.width}x${meta.height}`, icon.src).toBe("96x96");
    }
  });

  it("hat eine knappe deutsche Beschreibung", () => {
    expect(manifest.description.length).toBeLessThanOrEqual(100);
    expect(manifest.description).not.toContain(" / ");
  });

  it("liefert ein Push-Badge mit Transparenz (Android nutzt nur den Alphakanal)", async () => {
    const badge = await sharp(file("icons/badge-96x96.png")).metadata();
    expect([badge.width, badge.height, badge.hasAlpha]).toEqual([96, 96, true]);
    const { data } = await sharp(file("icons/badge-96x96.png")).raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0); // Ecke links oben transparent
  });

  it("liefert das Apple-Symbol deckend und die iOS-Startbilder in Gerätegröße", async () => {
    const touch = await sharp(file("icons/apple-touch-icon.png")).metadata();
    expect([touch.width, touch.height, touch.hasAlpha]).toEqual([180, 180, false]);
    const splash = await sharp(file("splash/iphone-393x852.png")).metadata();
    expect([splash.width, splash.height]).toEqual([1179, 2556]);
    const ipadLandscape = await sharp(file("splash/ipad-1194x834.png")).metadata();
    expect([ipadLandscape.width, ipadLandscape.height]).toEqual([2388, 1668]);
    for (const [name, w, h] of [["iphone-402x874", 1206, 2622], ["iphone-440x956", 1320, 2868], ["ipad-1024x1366", 2048, 2732], ["ipad-1376x1032", 2752, 2064]] as const) {
      const meta = await sharp(file(`splash/${name}.png`)).metadata();
      expect([meta.width, meta.height], name).toEqual([w, h]);
    }
  });
});
