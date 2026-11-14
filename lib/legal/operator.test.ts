import { describe, expect, it } from "vitest";
import { getOperatorInfo } from "./operator";

describe("getOperatorInfo", () => {
  it("ohne Angaben ist es unvollständig und nicht freigegeben", () => {
    const info = getOperatorInfo({});
    expect(info).toMatchObject({ name: null, addressLines: [], email: null, complete: false, privacyReviewed: false });
  });

  it("Name, Anschrift und E-Mail machen die Angaben vollständig", () => {
    const info = getOperatorInfo({ LEGAL_OPERATOR_NAME: "Beispiel GmbH", LEGAL_OPERATOR_ADDRESS: "Musterstraße 1; 12345 Musterstadt", LEGAL_CONTACT_EMAIL: "kontakt@example.org" });
    expect(info.complete).toBe(true);
    expect(info.addressLines).toEqual(["Musterstraße 1", "12345 Musterstadt"]);
  });

  it("zerlegt die Anschrift auch an \\n aus der .env-Datei", () => {
    expect(getOperatorInfo({ LEGAL_OPERATOR_ADDRESS: "Musterstraße 1\\n12345 Musterstadt" }).addressLines).toHaveLength(2);
  });

  it("leere oder nur aus Leerzeichen bestehende Werte zählen als fehlend", () => {
    const info = getOperatorInfo({ LEGAL_OPERATOR_NAME: "  ", LEGAL_CONTACT_EMAIL: "", LEGAL_OPERATOR_ADDRESS: "Straße 1" });
    expect(info.complete).toBe(false);
    expect(info.name).toBeNull();
  });

  it("die Aussage zum KI-Dienst kommt aus der Umgebung und fehlt sonst", () => {
    expect(getOperatorInfo({}).aiStatement).toBeNull();
    expect(getOperatorInfo({ LEGAL_AI_STATEMENT: " Verarbeitung in der EU, kein Training. " }).aiStatement).toBe("Verarbeitung in der EU, kein Training.");
  });

  it("die Freigabe der Datenschutzerklärung gilt nur bei genau `true`", () => {
    expect(getOperatorInfo({ LEGAL_PRIVACY_REVIEWED: "true" }).privacyReviewed).toBe(true);
    expect(getOperatorInfo({ LEGAL_PRIVACY_REVIEWED: "1" }).privacyReviewed).toBe(false);
    expect(getOperatorInfo({ LEGAL_TERMS_REVIEWED: "true" }).termsReviewed).toBe(true);
    expect(getOperatorInfo({}).termsReviewed).toBe(false);
  });
});
