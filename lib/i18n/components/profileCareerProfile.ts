// Texte von components/profile/CareerProfile.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    eGKubernetesItSecurity: "z. B. Kubernetes, IT-Sicherheit",
    eGTerraformWireshark: "z. B. Terraform, Wireshark",
    newSkill: "Neuer Skill",
    newTool: "Neues Tool",
    level: "Stufe",
    recency: "Aktualität",
    add: "Hinzufügen",
    networkError: "Keine Verbindung zum Server. Die Änderung wurde nicht gespeichert – bitte prüfe deine Internetverbindung und versuche es erneut.",
  },
  en: {
    eGKubernetesItSecurity: "e.g. Kubernetes, IT security",
    eGTerraformWireshark: "e.g. Terraform, Wireshark",
    newSkill: "New skill",
    newTool: "New tool",
    level: "Level",
    recency: "Recency",
    add: "Add",
    networkError: "No connection to the server. The change was not saved – please check your internet connection and try again.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_profileCareerProfile(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
