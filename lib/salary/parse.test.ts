import { describe, expect, it } from "vitest";
import { findHeaderRow, guessMapping, parseCsv, parseEuro, parseLevel, parseOccupation, parseRegion, toRecords } from "./parse";

describe("Zahlen und Namen", () => {
  it("deutsche Zahlen, unterdrückte Werte", () => {
    expect(parseEuro("4.123")).toBe(4123);
    expect(parseEuro("4.123,50 €")).toBe(4124);
    expect(parseEuro("4123")).toBe(4123);
    expect(parseEuro("*")).toBeNull();
    expect(parseEuro("x")).toBeNull();
    expect(parseEuro("")).toBeNull();
    expect(parseEuro("0")).toBeNull();
  });
  it("Regionen, Niveaus, Berufe", () => {
    expect(parseRegion("Nordrhein-Westfalen")).toBe("NW");
    expect(parseRegion("08 Nordrhein-Westfalen")).toBe("NW");
    expect(parseRegion("Bayern")).toBe("BY");
    expect(parseRegion("Deutschland")).toBe("DE");
    expect(parseRegion("Westdeutschland")).toBe("WEST");
    expect(parseRegion("Dresden")).toBeNull();
    expect(parseLevel("4 Experte")).toBe(4);
    expect(parseLevel("Fachkraft")).toBe(2);
    expect(parseLevel("Insgesamt")).toBeNull();
    expect(parseOccupation("43104 Informatik")).toEqual({ kldb: "43104", name: "Informatik" });
    expect(parseOccupation("B 431")).toEqual({ kldb: "431", name: null });
    expect(parseOccupation("Insgesamt")).toBeNull();
  });
});

const TABLE = [
  "Entgeltstatistik der Bundesagentur für Arbeit;;;;;",
  "Stichtag 31.12.2025;;;;;",
  "",
  'KldB 2010;Berufsbezeichnung;Anforderungsniveau;Region;Median;"1. Quartil";"3. Quartil"',
  "43104;Informatik;4 Experte;Deutschland;5.980;4.900;7.100",
  "43104;Informatik;4 Experte;Bayern;6.250;5.100;7.400",
  "43104;Informatik;4 Experte;Dresden;5.500;4.500;6.500",
  "43104;Informatik;4 Experte;Berlin;*;*;*",
  "43104;Informatik;4 Experte;Deutschland;5.980;4.900;7.100",
  "Quelle: Statistik der BA;;;;;",
].join("\n");

describe("Tabelle im Stil der BA", () => {
  const rows = parseCsv(TABLE);
  it("findet Trennzeichen und Kopfzeile, rät die Spalten", () => {
    const h = findHeaderRow(rows);
    expect(h).toBe(2); // Leerzeilen fallen weg, davor stehen zwei Titelzeilen
    expect(rows[h]).toHaveLength(7);
    expect(guessMapping(rows, h)).toEqual({ occupation: 0, name: 1, level: 2, region: 3, median: 4, q25: 5, q75: 6 });
  });
  it("macht Datensätze und nennt, was übersprungen wurde", () => {
    const h = findHeaderRow(rows);
    const r = toRecords(rows, h, guessMapping(rows, h), "DE");
    expect(r.records).toEqual([
      { kldb: "43104", occupationName: "Informatik", level: 4, region: "DE", median: 5980, q25: 4900, q75: 7100 },
      { kldb: "43104", occupationName: "Informatik", level: 4, region: "BY", median: 6250, q25: 5100, q75: 7400 },
    ]);
    expect(r.reasons).toMatchObject({ "Region nicht erkannt (z. B. Stadt)": 1, "kein Median (leer oder unterdrückt)": 1, doppelt: 1, "kein Berufscode": 1 });
  });
  it("ohne Niveau- und Regionsspalte: 5. Stelle des Codes, Standardregion", () => {
    const simple = parseCsv("Beruf;Median\n43104;5.980\n43102;4.100");
    const m = guessMapping(simple, 0);
    expect(m).toMatchObject({ occupation: 0, level: null, region: null, median: 1 });
    expect(toRecords(simple, 0, m, "BY").records.map((x) => [x.kldb, x.level, x.region, x.median])).toEqual([["43104", 4, "BY", 5980], ["43102", 2, "BY", 4100]]);
  });
  it("Anführungszeichen, Komma als Trenner, BOM", () => {
    expect(parseCsv('﻿a,b\n"x, y","z ""q"""')).toEqual([["a", "b"], ["x, y", 'z "q"']]);
  });
});
