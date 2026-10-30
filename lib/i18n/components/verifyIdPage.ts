// Texte von app/verify/[id]/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    verifyADocument: "Nachweis prüfen",
    thereIsNoDocumentFor: "Zu dieser Kennung gibt es keinen Nachweis. Das Dokument ist nicht von uns ausgestellt worden.",
    revokedTheHolderHasWithdrawn: "Widerrufen: Die Person hat diesen Nachweis zurückgezogen.",
    invalidTheStoredEntryNo: "Ungültig: Der gespeicherte Eintrag stimmt nicht mehr mit seiner Signatur überein.",
    issuedTo: "Ausgestellt für",
    earnedOn: "Erworben am",
    validUntil: "gültig bis",
    validIndefinitely: "unbegrenzt gültig",
    genuineThisDocumentWasIssued: "Echt: Dieser Nachweis wurde am {0} ausgestellt und ist unverändert.",
    n0Of1ChaptersCompleted: "{0} von {1} Kapiteln abgeschlossen, {2} von {3} Lektionen durchgearbeitet",
  },
  en: {
    verifyADocument: "Verify a document",
    thereIsNoDocumentFor: "There is no document for this ID. It was not issued by us.",
    revokedTheHolderHasWithdrawn: "Revoked: the holder has withdrawn this document.",
    invalidTheStoredEntryNo: "Invalid: the stored entry no longer matches its signature.",
    issuedTo: "Issued to",
    earnedOn: "Earned on",
    validUntil: "valid until",
    validIndefinitely: "valid indefinitely",
    genuineThisDocumentWasIssued: "Genuine: this document was issued on {0} and is unchanged.",
    n0Of1ChaptersCompleted: "{0} of {1} chapters completed, {2} of {3} lessons worked through",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_verifyIdPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
