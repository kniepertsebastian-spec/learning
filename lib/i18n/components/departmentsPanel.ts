// Texte von components/DepartmentsPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    departments: "Abteilungen",
    assignMembersToDepartmentsMandatory: "Ordne Mitglieder Abteilungen zu. Pflichtschulungen lassen sich dann auf bestimmte Abteilungen einschränken. Wechselt jemand die Abteilung, greifen Regeln, die das vorsehen, sofort.",
    newDepartmentEGOperations: "Neue Abteilung, z. B. Operations",
    departmentName: "Name der Abteilung",
    create: "Anlegen",
    delete: "löschen",
    departmentOf: "Abteilung von",
    noDepartment: "keine Abteilung",
    mandatoryTraining0LearningPath: "Pflichtschulungen: {0} Lernpfad/Lernpfade zugewiesen.",
  },
  en: {
    departments: "Departments",
    assignMembersToDepartmentsMandatory: "Assign members to departments. Mandatory training can then be limited to certain departments. When someone changes department, rules that allow it apply immediately.",
    newDepartmentEGOperations: "New department, e.g. Operations",
    departmentName: "Department name",
    create: "Create",
    delete: "delete",
    departmentOf: "Department of",
    noDepartment: "no department",
    mandatoryTraining0LearningPath: "Mandatory training: {0} learning path(s) assigned.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_departmentsPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
