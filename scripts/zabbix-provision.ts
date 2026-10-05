import { config } from "dotenv";
config({ path: ".env" });
import { createZabbixClient, provision, DEFAULT_OPTIONS } from "../lib/server/ops/zabbix";

/**
 * Legt in einem laufenden Zabbix den Host der Lernplattform mit Items und Triggern an (idempotent).
 * Anleitung: docs/MONITORING.md
 *
 * Usage: ZABBIX_PASSWORD=... npm run monitoring:provision
 * Optional: ZABBIX_URL (Standard http://127.0.0.1:8081/api_jsonrpc.php), ZABBIX_USER (Admin),
 *           LEARNING_APP_URL (Standard http://app:3000, Sicht des Zabbix-Servers)
 */
async function main() {
  const password = process.env.ZABBIX_PASSWORD;
  if (!password) {
    console.error("ZABBIX_PASSWORD fehlt (das geänderte Passwort des Zabbix-Benutzers).");
    process.exit(1);
  }
  const client = createZabbixClient(process.env.ZABBIX_URL ?? "http://127.0.0.1:8081/api_jsonrpc.php");
  await client.login(process.env.ZABBIX_USER ?? "Admin", password);
  const log = await provision(client.call, { ...DEFAULT_OPTIONS, appUrl: process.env.LEARNING_APP_URL ?? DEFAULT_OPTIONS.appUrl });
  console.log(log.length ? log.join("\n") : "Nichts zu tun, alles ist schon eingerichtet.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
