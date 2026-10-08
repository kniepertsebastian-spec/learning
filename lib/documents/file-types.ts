/** Dateiendungen, die Firmendokumente und Kursquellen haben dürfen (ohne Server-Code, damit auch die Oberfläche sie nutzt). */

/** Konfiguration, Playbooks und Skripte, gelesen als reiner Text (z. B. Ansible, Docker Compose, Shell- und Python-Skripte). */
export const EXTRA_TEXT_EXTENSIONS: readonly string[] = [
  "yml", "yaml", "py", "sh", "bash", "zsh", "ps1", "psm1", "bat", "cmd", "js", "mjs", "cjs", "ts", "sql", "conf", "cfg", "ini", "toml",
  "tf", "tfvars", "hcl", "j2", "jinja", "service", "timer", "rb", "go", "rs", "java", "c", "h", "cpp", "cs", "php", "pl", "lua", "groovy",
  "gradle", "properties", "csv", "log", "rst", "adoc",
];

/** Alle erlaubten Endungen für Dokumente (ohne Punkt, klein). */
export const DOCUMENT_EXTENSIONS: readonly string[] = ["pdf", "txt", "md", "json", "xml", "html", "htm", ...EXTRA_TEXT_EXTENSIONS];

/** Wert für das `accept`-Attribut eines Datei-Felds. */
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.map((e) => `.${e}`).join(",");

export function extensionOfName(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

export function isAcceptedDocumentName(filename: string): boolean {
  return DOCUMENT_EXTENSIONS.includes(extensionOfName(filename));
}
