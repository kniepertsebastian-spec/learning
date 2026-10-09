# Anmeldung über das Firmenkonto (SSO, OpenID Connect)

Firmen binden ihren eigenen Anmeldedienst (IdP) an, statt Mitarbeitende einzuladen. Wer sich mit einer bestätigten
Firmen-Domain anmeldet, wird automatisch Mitglied; die Rolle ergibt sich bei **jeder** Anmeldung aus den Gruppen im IdP.

## Voraussetzungen auf dem Server

- `APP_BASE_URL` (öffentliche Adresse, z. B. `https://learning.example`): daraus entsteht die Rückkehr-Adresse
  `…/api/sso/callback`, die im IdP eingetragen wird.
- `APP_ENCRYPTION_KEY`: das Client-Geheimnis der Firma liegt verschlüsselt in der Datenbank.
- Der IdP muss über **https** und eine öffentliche Adresse erreichbar sein (SSRF-Schutz). Ein IdP im Firmennetz ist nur mit
  `SSO_ALLOW_PRIVATE_IDP=true` möglich.

## Einrichtung durch den Firmen-Admin (Firmenbereich → Anmeldung)

1. **E-Mail-Domain eintragen und bestätigen.** Es erscheint ein DNS-TXT-Eintrag
   (`_certstudy-verify.<domain>` = `certstudy-verify=<Token>`); nach dem Setzen „Prüfen“ klicken. Eine bestätigte Domain gehört
   genau einer Firma. Öffentliche Mail-Anbieter (gmail.com …) sind ausgeschlossen.
2. **Im IdP eine Anwendung anlegen** (Typ „Web“, Authorization Code): Redirect-URI wie angezeigt, Scopes `openid email profile`,
   Gruppen als Anspruch (Claim) mitliefern.
3. **Aussteller, Client-ID, Client-Geheimnis** eintragen, **Gruppen den Rollen zuordnen** (eine pro Zeile), einschalten.
4. Optional: **Passwort-Anmeldung sperren.** Firmen-Admins behalten sie als Notzugang.

### Beispiel Microsoft Entra ID

- Aussteller: `https://login.microsoftonline.com/<Verzeichnis-ID>/v2.0`
- App-Registrierung → Authentifizierung → Web-Redirect-URI eintragen; Zertifikate & Geheimnisse → neues Client-Geheimnis.
- Token-Konfiguration → „Gruppen-Anspruch hinzufügen“ (Sicherheitsgruppen). Entra liefert Gruppen-**Objekt-IDs**; diese werden
  den Rollen zugeordnet. Hat jemand mehr als etwa 200 Gruppen, liefert Entra keine Liste mehr (dann die Gruppen auf die
  zugewiesenen beschränken).

## Verhalten und Sicherheit

- Der Ablauf nutzt PKCE, `state` und `nonce`. Geprüft werden Aussteller, Empfänger (Client-ID), Signatur gegen die Schlüssel des
  IdP und der Ablauf des ID-Tokens.
- Die E-Mail-Adresse muss zu einer bestätigten Domain **dieser** Firma gehören. Ein Konto, das schon zu einer anderen Firma
  gehört, wird nie übernommen.
- Beim ersten Verknüpfen eines bestehenden Kontos werden alte Sitzungen beendet; ein noch unbestätigtes Konto verliert sein altes
  Passwort (es könnte jemand anderem gehören).
- Rolle: höchste Rolle der zugeordneten Gruppen, ohne Treffer „Lernende“. **Der letzte Firmen-Admin wird nie herabgestuft.**
- Die Sitzung entsteht über ein einmaliges Ticket (Hash in der Datenbank, 60 Sekunden gültig).
- Wird die letzte bestätigte Domain entfernt, wird SSO ausgeschaltet.

## Bewusst nicht enthalten

- SAML (nur OIDC), SCIM (automatisches Entfernen ausgeschiedener Personen: wer im IdP gesperrt wird, kann sich nicht mehr anmelden,
  eine bestehende Sitzung läuft aber bis zum Ablauf weiter und das Konto bleibt bis zum Entfernen als Mitglied bestehen).
- Abmeldung am IdP (Single Logout).
- Zugriffsbeschränkung auf bestimmte Gruppen (wer sich anmelden kann, ist mindestens Lernende/r).
